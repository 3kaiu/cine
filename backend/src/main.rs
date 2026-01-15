use axum::{
    http::Method,
    routing::{delete, get, post},
    Router,
};
use clap::{Parser, ValueEnum};
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber;
use utoipa::OpenApi;

mod config;
mod error;
mod handlers;
mod models;
mod openapi;
mod services;
mod utils;
mod websocket;

use config::AppConfig;
use handlers::*;
// use websocket::ws_handler;

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
        .synchronous(SqliteSynchronous::Normal);

    let db = sqlx::SqlitePool::connect_with(options).await?;

    // 运行数据库迁移
    sqlx::migrate!()
        .run(&db)
        .await
        .map_err(|e| anyhow::anyhow!("Migration failed: {}", e))?;

    // 初始化缓存
    let hash_cache = Arc::new(crate::services::cache::FileHashCache::new());

    // 初始化任务队列并注册执行器
    let task_queue = Arc::new(crate::services::task_queue::TaskQueue::new(db.clone(), 4));

    // 初始化分布式服务
    let distributed = Arc::new(crate::services::distributed::DistributedService::new(
        task_queue.clone(),
    ));

    // 初始化插件管理器
    let plugin_manager = Arc::new(crate::services::plugin::PluginManager::new("plugins"));

    // 异步加载插件 (后台运行，不阻塞启动)
    let pm = plugin_manager.clone();
    tokio::spawn(async move {
        if let Err(e) = pm.load_plugins().await {
            tracing::error!("Failed to load plugins: {}", e);
        }
    });

    task_queue.register_executor(
        crate::services::task_queue::TaskType::Scan,
        Arc::new(crate::services::task_executors::ScanExecutor { db: db.clone() }),
    );
    task_queue.register_executor(
        crate::services::task_queue::TaskType::Hash,
        Arc::new(crate::services::task_executors::HashExecutor {
            db: db.clone(),
            hash_cache: hash_cache.clone(),
        }),
    );
    task_queue.register_executor(
        crate::services::task_queue::TaskType::Scrape,
        Arc::new(crate::services::task_executors::ScrapeExecutor {
            db: db.clone(),
            http_client: reqwest::Client::new(),
            config: config.clone(),
        }),
    );
    task_queue.register_executor(
        crate::services::task_queue::TaskType::Rename,
        Arc::new(crate::services::task_executors::RenameExecutor { db: db.clone() }),
    );

    match cli.mode {
        RunMode::Master => {
            // 构建应用状态
            let app_state = handlers::AppState {
                db: db.clone(),
                config: config.clone(),
                progress_broadcaster: websocket::ProgressBroadcaster::new(),
                hash_cache,
                http_client: reqwest::Client::new(),
                task_queue,
                distributed,
                plugin_manager: plugin_manager.clone(),
            };
            let app_state = Arc::new(app_state);

            // 启动后台服务
            start_background_services(db.clone(), app_state.clone()).await?;

            // CORS 配置
            let cors = CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
                .allow_headers(Any);

            // 构建路由
            let app = Router::new()
                .route("/api/health", get(health_check))
                .route("/api/metrics", get(crate::handlers::metrics::get_dashboard_metrics))
                .route("/metrics", get(crate::handlers::metrics::get_metrics))
                // .route("/api/ws", get(crate::websocket::ws_handler))
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
                .route("/api/files/:id/hash", post(calculate_hash))
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
                .nest("/api/tasks", crate::handlers::tasks::task_routes())
                .merge(
                    utoipa_swagger_ui::SwaggerUi::new("/swagger-ui")
                        .url("/api-docs/openapi.json", openapi::ApiDoc::openapi()),
                )
                .layer(ServiceBuilder::new().layer(cors))
                .with_state(app_state);

            let addr = format!("0.0.0.0:{}", config.port);
            tracing::info!("Cine Master starting on {}", addr);

            let listener = tokio::net::TcpListener::bind(&addr).await?;
            axum::serve(listener, app).await?;
        }
        RunMode::Worker => {
            tracing::info!("Cine Worker starting...");
            let worker = crate::services::distributed::WorkerService::new(
                cli.node_id,
                cli.master_url,
                task_queue,
                vec![
                    crate::services::task_queue::TaskType::Hash,
                    crate::services::task_queue::TaskType::Scrape,
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
    let scheduler = crate::services::scheduler::SchedulerService::new(db.clone()).await?;
    tokio::spawn(async move {
        if let Err(e) = scheduler.start().await {
            tracing::error!("Scheduler error: {}", e);
        }
    });

    // 2. 启动文件监控
    let (watcher_service, mut rx) = crate::services::watcher::WatcherService::new(db.clone());
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
                    crate::services::task_queue::TaskType::Scan,
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
