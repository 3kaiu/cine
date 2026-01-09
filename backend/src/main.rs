use axum::{
    http::Method,
    routing::{delete, get, post},
    Router,
};
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber;

mod config;
mod error;
mod handlers;
mod models;
mod services;
mod utils;
mod websocket;

use config::AppConfig;
use handlers::*;
use websocket::ws_handler;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cine=debug,axum=info".into()),
        )
        .init();

    // 加载配置
    let config = AppConfig::load()?;
    let config = Arc::new(config);

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

    // 构建应用状态
    let app_state = handlers::AppState {
        db: db.clone(),
        config: config.clone(),
        progress_broadcaster: websocket::ProgressBroadcaster::new(),
        hash_cache: Arc::new(crate::services::cache::FileHashCache::new()),
        http_client: reqwest::Client::new(), // 复用 HTTP 客户端
    };
    let app_state = Arc::new(app_state);

    // CORS 配置
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    // 构建路由
    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/scan", post(scan_directory))
        .route("/api/files", get(list_files))
        .route("/api/files/:id/hash", post(calculate_hash))
        .route("/api/files/:id/info", get(get_video_info))
        .route("/api/files/:id/subtitles", get(find_subtitles))
        .route("/api/scrape", post(scrape_metadata))
        .route("/api/scrape/batch", post(batch_scrape_metadata))
        .route("/api/rename", post(batch_rename))
        .route("/api/dedupe", post(find_duplicates))
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
        .route("/ws", get(ws_handler))
        .layer(ServiceBuilder::new().layer(cors))
        .with_state(app_state);

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
