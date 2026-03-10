use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    http::Method,
    routing::{delete, get, post},
    Router,
};
use clap::{Parser, ValueEnum};
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
};
use tracing_subscriber;

use cine_backend::config::AppConfig;

use cine_backend::handlers;
use cine_backend::handlers::*;
use cine_backend::openapi;
use utoipa::OpenApi;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[arg(short, long, value_enum, default_value_t = RunMode::Master)]
    mode: RunMode,

    #[arg(long, default_value = "http://127.0.0.1:3000")]
    master_url: String,

    #[arg(long)]
    node_id: Option<String>,
}

#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum)]
enum RunMode {
    Master,
    Worker,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    // 先加载配置（在日志初始化前）
    let config = AppConfig::load()?;
    let config = Arc::new(config);

    // 使用配置中的日志级别初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .or_else(|_| tracing_subscriber::EnvFilter::try_new(&config.log_level))
                .unwrap_or_else(|_| "cine=info,axum=info".into()),
        )
        .init();

    tracing::info!("Configuration loaded successfully");

    // 初始化数据库连接选项
    use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous};
    use std::str::FromStr;

    let options = SqliteConnectOptions::from_str(&config.database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .pragma("mmap_size", "2147483648") // 2GB mmap size
        .pragma("cache_size", "-2000000") // ~2GB cache
        .pragma("page_size", "4096") // Standard SSD page size
        .pragma("temp_store", "2"); // Use MEMORY for temporary storage

    let db = sqlx::SqlitePool::connect_with(options).await?;

    // 运行数据库迁移
    sqlx::migrate!()
        .run(&db)
        .await
        .map_err(|e| anyhow::anyhow!("Migration failed: {}", e))?;

    // 初始化智能缓存管理器
    let cache_config = cine_backend::services::smart_cache::SmartCacheConfig {
        max_size: 10000,
        ttl: std::time::Duration::from_secs(3600), // 1小时
        warmup_strategy: config.enable_cache_warmup.then(|| {
            cine_backend::services::smart_cache::WarmupStrategy::MostFrequent { top_n: 1000 }
        }),
        sync_interval: std::time::Duration::from_secs(30),
        metrics_interval: std::time::Duration::from_secs(60),
        enable_distributed_sync: false, // 可以根据配置启用
        node_id: "master".to_string(),
    };
    let smart_cache = Arc::new(cine_backend::services::smart_cache::SmartCacheManager::new(
        cache_config.clone(),
    ));

    // 启动缓存后台任务
    let cache_for_bg = smart_cache.clone();
    tokio::spawn(async move {
        cache_for_bg.start_background_tasks().await;
    });

    // 兼容性：创建传统的FileHashCache
    let hash_cache = Arc::new(cine_backend::services::cache::FileHashCache::new());

    // 初始化任务队列并注册执行器
    // 使用配置化的并发控制，避免重型任务压垮系统
    let mut task_queue_config =
        cine_backend::services::task_queue::TaskQueueConfig::new(4 /* 全局最大并发 */);
    // 限制扫描任务并发，避免同时多目录深度遍历导致 IO 峰值过高
    task_queue_config
        .per_type_limits
        .insert(cine_backend::services::task_queue::TaskType::Scan, 1);
    // 为哈希任务设置略高并发，充分利用 CPU，但仍受全局并发限制
    task_queue_config
        .per_type_limits
        .insert(cine_backend::services::task_queue::TaskType::Hash, 3);

    let task_queue = Arc::new(cine_backend::services::task_queue::TaskQueue::with_config(
        db.clone(),
        task_queue_config,
    ));

    // 初始化分布式服务
    let distributed =
        Arc::new(cine_backend::services::distributed::DistributedService::new(task_queue.clone()));

    // 初始化插件管理器
    let plugin_manager = Arc::new(cine_backend::services::plugin::PluginManager::new(
        "plugins",
    ));

    // 异步加载插件 (后台运行，不阻塞启动)；可通过配置 disable
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
        cine_backend::services::task_queue::TaskType::Scan,
        Arc::new(cine_backend::services::task_executors::ScanExecutor { db: db.clone() }),
    );
    task_queue.register_executor(
        cine_backend::services::task_queue::TaskType::Hash,
        Arc::new(cine_backend::services::task_executors::HashExecutor {
            db: db.clone(),
            hash_cache: hash_cache.clone(),
        }),
    );
    task_queue.register_executor(
        cine_backend::services::task_queue::TaskType::Scrape,
        Arc::new(cine_backend::services::task_executors::ScrapeExecutor {
            db: db.clone(),
            http_client: reqwest::Client::new(),
            config: config.clone(),
        }),
    );
    task_queue.register_executor(
        cine_backend::services::task_queue::TaskType::Rename,
        Arc::new(cine_backend::services::task_executors::RenameExecutor { db: db.clone() }),
    );
    task_queue.register_executor(
        cine_backend::services::task_queue::TaskType::Custom("batch_hash".to_string()),
        Arc::new(cine_backend::services::task_executors::BatchHashExecutor { db: db.clone() }),
    );

    match cli.mode {
        RunMode::Master => {
            // 构建应用状态
            let app_state = handlers::AppState {
                db: db.clone(),
                config: config.clone(),
                progress_broadcaster: cine_backend::websocket::ProgressBroadcaster::new(),
                hash_cache,
                http_client: reqwest::Client::new(),
                task_queue,
                distributed,
                plugin_manager: plugin_manager.clone(),
            };
            let app_state = Arc::new(app_state);

            // 启动后台服务
            start_background_services(db.clone(), app_state.clone()).await?;

            // 缓存预热（可配置关闭，减少启动时间）
            if config.enable_cache_warmup {
                let db_for_warmup = db.clone();
                let cache_for_warmup = smart_cache.clone();
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

            // CORS 配置
            let cors = CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
                .allow_headers(Any);

            // 创建GraphQL schema
            let graphql_schema = cine_backend::graphql::create_schema();

            // GraphQL处理函数
            async fn graphql_handler(
                schema: axum::extract::Extension<cine_backend::graphql::CineSchema>,
                req: GraphQLRequest,
            ) -> GraphQLResponse {
                schema.execute(req.into_inner()).await.into()
            }

            // 构建路由
            let app = Router::new()
                .route("/api/health", get(health_check))
                .route("/api/metrics", get(cine_backend::handlers::metrics::get_dashboard_metrics))
                .route("/metrics", get(cine_backend::handlers::metrics::get_metrics))
                // 性能监控API
                .route("/api/monitoring/trends", get(cine_backend::handlers::performance_monitor::get_performance_trends))
                .route("/api/monitoring/resources", get(cine_backend::handlers::performance_monitor::get_resource_history))
                .route("/api/monitoring/anomalies", get(cine_backend::handlers::performance_monitor::get_performance_anomalies))
                .route("/api/monitoring/health", get(cine_backend::handlers::performance_monitor::get_system_health))
                .route("/api/monitoring/metrics", get(cine_backend::handlers::performance_monitor::get_detailed_metrics))

                // GraphQL API
                .route("/graphql", axum::routing::post(graphql_handler))
                .layer(axum::extract::Extension(graphql_schema))
            // WebSocket 进度推送（供前端使用）
            .route(
                "/ws",
                get(
                    |ws: axum::extract::WebSocketUpgrade,
                     state: axum::extract::State<Arc<handlers::AppState>>| async move {
                        cine_backend::websocket::ws_handler(ws, state).await
                    },
                ),
            )
                .route(
                    "/api/ws/worker",
                    get(
                        |ws: axum::extract::WebSocketUpgrade,
                        state: axum::extract::State<Arc<handlers::AppState>>| async move {
                            ws.on_upgrade(|socket| async move {
                                state.distributed.handle_worker_socket(socket).await
                            })
                        },
                    ),
                )
                .route("/api/scan", post(scan_directory))
                .route("/api/files", get(list_files))
                .route("/api/files/:id/info", get(get_video_info))
                .route("/api/files/:id/subtitles", get(find_subtitles))
                .route(
                    "/api/files/:id/subtitles/search",
                    get(search_remote_subtitles),
                )
                .route(
                    "/api/files/:id/subtitles/download",
                    post(download_remote_subtitle),
                )
                .route("/api/scrape", post(scrape_metadata))
                .route("/api/scrape/batch", post(batch_scrape_metadata))
                .route("/api/rename", post(batch_rename))
                .route("/api/dedupe", post(find_duplicates))
                .route("/api/dedupe/movies", get(find_duplicate_movies))
                .route("/api/dedupe/similar", get(find_similar_files))
                .route("/api/empty-dirs", get(find_empty_dirs))
                .route("/api/empty-dirs/delete", post(delete_empty_dirs))
                .route("/api/large-files", get(find_large_files))
                .route("/api/files/:id/move", post(move_file))
                .route("/api/files/:id/copy", post(copy_file))
                .route("/api/files/batch-move", post(batch_move_files))
                .route("/api/files/batch-copy", post(batch_copy_files))
                .route("/api/trash", get(list_trash))
                .route("/api/trash/:id", post(move_to_trash))
                .route("/api/trash/:id/restore", post(restore_from_trash))
                .route("/api/trash/:id/delete", delete(permanently_delete))
                .route("/api/trash/cleanup", post(cleanup_trash))
                .route("/api/logs", get(list_operation_logs))
                .route("/api/logs/:id/undo", post(undo_operation))
                .route("/api/history", get(list_scan_history))
                .route(
                    "/api/watch-folders",
                    get(list_watch_folders).post(add_watch_folder),
                )
                .route("/api/watch-folders/:id", delete(delete_watch_folder))
                .route("/api/files/:id/nfo", get(get_nfo).put(update_nfo))
                .route("/api/settings", get(get_settings).post(update_settings))
                .route("/api/plugins", get(list_plugins))
                .route("/api/queue/stats", get(cine_backend::handlers::queue_stats::get_queue_stats))
                .route("/api/queue/history", get(cine_backend::handlers::queue_stats::get_execution_history))
                .nest("/api/tasks", cine_backend::handlers::tasks::task_routes())
                .merge(
                    utoipa_swagger_ui::SwaggerUi::new("/swagger-ui")
                        .url("/api-docs/openapi.json", openapi::ApiDoc::openapi()),
                )
                .layer(ServiceBuilder::new()
                    .layer(cors)
                    // 添加响应压缩：支持gzip, deflate, br
                    .layer(CompressionLayer::new())
                    // 添加API版本控制
                    .layer(axum::middleware::from_fn(cine_backend::api_version::api_version_middleware))
                )
                .with_state(app_state);

            let addr = format!("0.0.0.0:{}", config.port);
            tracing::info!("Cine Master starting on {}", addr);

            let listener = tokio::net::TcpListener::bind(&addr).await?;
            axum::serve(listener, app).await?;
        }
        RunMode::Worker => {
            tracing::info!("Cine Worker starting...");
            let worker = cine_backend::services::distributed::WorkerService::new(
                cli.node_id,
                cli.master_url,
                task_queue,
                vec![
                    cine_backend::services::task_queue::TaskType::Hash,
                    cine_backend::services::task_queue::TaskType::Scrape,
                ],
            );
            worker.run().await?;
        }
    }

    Ok(())
}

async fn start_background_services(
    db: sqlx::SqlitePool,
    state: Arc<handlers::AppState>,
) -> anyhow::Result<()> {
    // 1. 启动定时器
    let scheduler = cine_backend::services::scheduler::SchedulerService::new(db.clone()).await?;
    tokio::spawn(async move {
        if let Err(e) = scheduler.start().await {
            tracing::error!("Scheduler error: {}", e);
        }
    });

    // 1b. 定期清理任务队列执行记录，防止内存膨胀
    let tq = state.task_queue.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(6 * 3600)); // 每 6 小时
        interval.tick().await; // 跳过首次立即执行
        loop {
            interval.tick().await;
            tq.cleanup_execution_records(std::time::Duration::from_secs(24 * 3600))
                .await;
        }
    });

    // 2. 启动文件监控
    let (watcher_service, mut rx) =
        cine_backend::services::watcher::WatcherService::new(db.clone());
    watcher_service.start_all().await?;

    // 监听监控信号并执行自动化任务
    tokio::spawn(async move {
        while let Some(path) = rx.recv().await {
            tracing::info!("Auto-processing directory: {}", path);
            let _state_clone = state.clone();
            let _path_clone = path.clone();
            let _file_types: Vec<String> = ["video", "audio", "image"]
                .iter()
                .map(|s| s.to_string())
                .collect();

            let _ = state
                .task_queue
                .submit(
                    cine_backend::services::task_queue::TaskType::Scan,
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
