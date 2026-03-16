use std::sync::Arc;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous};
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
};

use crate::config::AppConfig;
use crate::graphql::{create_schema, CineSchema};
use crate::handlers::AppState;
use crate::services::distributed::{DistributedService, WorkerService};
use crate::services::plugin::PluginManager;
use crate::services::progress_hub::ProgressHub;
use crate::services::smart_cache::{SmartCacheConfig, SmartCacheManager, WarmupStrategy};
use crate::services::task_executors::{
    BatchHashExecutor, HashExecutor, RenameExecutor, ScanExecutor, ScrapeExecutor,
    SimilarScanExecutor,
};
use crate::services::task_queue::{TaskQueue, TaskQueueConfig, TaskType};
use crate::services::{scheduler, watcher};

use crate::routes::build_app_router;

/// Shared objects created during bootstrap that are reused across master/worker modes.
pub struct BootstrapContext {
    pub config: Arc<AppConfig>,
    pub db: sqlx::SqlitePool,
    pub task_queue: Arc<TaskQueue>,
    pub distributed: Arc<DistributedService>,
    pub plugin_manager: Arc<PluginManager>,
    pub progress_hub: Arc<ProgressHub>,
    pub smart_cache: Arc<SmartCacheManager>,
}

impl BootstrapContext {
    pub async fn new() -> anyhow::Result<Self> {
        let config = AppConfig::load()?;
        let config = Arc::new(config);

        // 初始化数据库连接选项
        use std::str::FromStr;

        let options = SqliteConnectOptions::from_str(&config.database_url)?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .pragma("mmap_size", "2147483648")
            .pragma("cache_size", "-2000000")
            .pragma("page_size", "4096")
            .pragma("temp_store", "2");

        let db = sqlx::SqlitePool::connect_with(options).await?;

        sqlx::migrate!()
            .run(&db)
            .await
            .map_err(|e| anyhow::anyhow!("Migration failed: {}", e))?;

        let cache_config = SmartCacheConfig {
            max_size: 10000,
            ttl: std::time::Duration::from_secs(3600),
            warmup_strategy: config.enable_cache_warmup.then_some(WarmupStrategy::MostFrequent {
                top_n: 1000,
            }),
            sync_interval: std::time::Duration::from_secs(30),
            metrics_interval: std::time::Duration::from_secs(60),
            enable_distributed_sync: false,
            node_id: "master".to_string(),
        };

        let smart_cache = Arc::new(SmartCacheManager::new(cache_config.clone()));

        // 启动缓存后台任务
        let cache_for_bg = smart_cache.clone();
        tokio::spawn(async move {
            cache_for_bg.start_background_tasks().await;
        });

        let progress_hub = Arc::new(ProgressHub::new());

        let mut task_queue_config = TaskQueueConfig::new(4);
        task_queue_config.lease_duration = std::time::Duration::from_secs(config.task_lease_seconds);
        task_queue_config.dispatch_interval =
            std::time::Duration::from_millis(config.task_dispatch_interval_ms);
        task_queue_config.retries_pure = config.task_retries_pure;
        task_queue_config.retries_idempotent = config.task_retries_idempotent;
        task_queue_config.retries_side_effectful = config.task_retries_side_effectful;
        task_queue_config
            .per_type_limits
            .insert(TaskType::Scan, 1);
        task_queue_config
            .per_type_limits
            .insert(TaskType::Hash, 3);

        let task_queue = Arc::new(TaskQueue::with_config(
            db.clone(),
            task_queue_config,
            progress_hub.clone(),
        ));
        task_queue.clone().start_background_dispatcher();

        let distributed = Arc::new(DistributedService::new(task_queue.clone(), config.clone()));

        let plugin_manager = Arc::new(PluginManager::new("plugins"));

        if config.enable_plugins {
            let pm = plugin_manager.clone();
            tokio::spawn(async move {
                if let Err(e) = pm.load_plugins().await {
                    tracing::error!("Failed to load plugins: {}", e);
                }
            });
        } else {
            tracing::info!("Plugins disabled by config (enable_plugins = false)");
        }

        task_queue.register_executor(
            TaskType::Scan,
            Arc::new(ScanExecutor { db: db.clone() }),
        );
        task_queue.register_executor(
            TaskType::Hash,
            Arc::new(HashExecutor {
                db: db.clone(),
                hash_cache: smart_cache.clone(),
            }),
        );
        task_queue.register_executor(
            TaskType::Scrape,
            Arc::new(ScrapeExecutor {
                db: db.clone(),
                http_client: reqwest::Client::new(),
                config: config.clone(),
            }),
        );
        task_queue.register_executor(
            TaskType::Rename,
            Arc::new(RenameExecutor { db: db.clone() }),
        );
        task_queue.register_executor(
            TaskType::Custom("batch_hash".to_string()),
            Arc::new(BatchHashExecutor { db: db.clone() }),
        );
        task_queue.register_executor(
            TaskType::Custom("similar_scan".to_string()),
            Arc::new(SimilarScanExecutor { db: db.clone() }),
        );

        Ok(Self {
            config,
            db,
            task_queue,
            distributed,
            plugin_manager,
            progress_hub,
            smart_cache,
        })
    }
}

pub async fn run_master(ctx: BootstrapContext) -> anyhow::Result<()> {
    let app_state = Arc::new(AppState {
        db: ctx.db.clone(),
        config: ctx.config.clone(),
        progress_hub: ctx.progress_hub.as_ref().clone(),
        http_client: reqwest::Client::new(),
        task_queue: ctx.task_queue.clone(),
        distributed: ctx.distributed.clone(),
        plugin_manager: ctx.plugin_manager.clone(),
    });

    start_background_services(ctx.db.clone(), app_state.clone()).await?;

    if ctx.config.enable_cache_warmup {
        let db_for_warmup = ctx.db.clone();
        let cache_for_warmup = ctx.smart_cache.clone();
        tokio::spawn(async move {
            if let Err(e) = cache_for_warmup
                .warmup_cache("file_hash", &db_for_warmup)
                .await
            {
                tracing::warn!("Cache warmup failed: {}", e);
            }
        });
    } else {
        tracing::info!("Cache warmup disabled by config (enable_cache_warmup = false)");
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST, axum::http::Method::PUT, axum::http::Method::DELETE])
        .allow_headers(Any);

    let graphql_schema: CineSchema = create_schema();

    let app = build_app_router(app_state, graphql_schema, cors, CompressionLayer::new());

    let addr = format!("0.0.0.0:{}", ctx.config.port);
    tracing::info!("Cine Master starting on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

pub async fn run_worker(
    node_id: Option<String>,
    master_url: String,
    ctx: BootstrapContext,
) -> anyhow::Result<()> {
    tracing::info!("Cine Worker starting...");
    let worker = WorkerService::new(
        node_id,
        master_url,
        ctx.task_queue.clone(),
        vec![TaskType::Hash, TaskType::Scrape],
    );
    worker.run().await?;
    Ok(())
}

async fn start_background_services(
    db: sqlx::SqlitePool,
    state: Arc<AppState>,
) -> anyhow::Result<()> {
    let scheduler = scheduler::SchedulerService::new(db.clone()).await?;
    tokio::spawn(async move {
        if let Err(e) = scheduler.start().await {
            tracing::error!("Scheduler error: {}", e);
        }
    });

    let tq = state.task_queue.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(6 * 3600));
        interval.tick().await;
        loop {
            interval.tick().await;
            tq.cleanup_execution_records(std::time::Duration::from_secs(24 * 3600))
                .await;
        }
    });

    // 1c. 回收租约过期任务，防止 Worker 掉线导致任务长期 running
    let tq = state.task_queue.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        interval.tick().await;
        loop {
            interval.tick().await;
            match tq.reclaim_expired_leases().await {
                Ok(reclaimed) if reclaimed > 0 => {
                    tracing::warn!("Reclaimed {} expired task leases", reclaimed);
                }
                Ok(_) => {}
                Err(e) => {
                    tracing::warn!("Failed to reclaim expired leases: {}", e);
                }
            }
        }
    });

    let (watcher_service, mut rx) = watcher::WatcherService::new(db.clone());
    watcher_service.start_all().await?;

    tokio::spawn(async move {
        while let Some(path) = rx.recv().await {
            tracing::info!("Auto-processing directory: {}", path);
            let _state_clone = state.clone();
            let _path_clone = path.clone();

            let _ = state
                .task_queue
                .submit(
                    TaskType::Scan,
                    Some(format!("自动扫描: {}", path)),
                    serde_json::json!({
                        "directory": path,
                        "recursive": true,
                        "file_types": ["video", "audio", "image"]
                    }),
                )
                .await;
        }
    });

    Ok(())
}

