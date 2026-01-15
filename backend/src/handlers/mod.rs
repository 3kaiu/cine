use axum::response::Json;
use serde::Serialize;
use std::sync::Arc;

use crate::services::cache::FileHashCache;
use crate::services::task_queue::TaskQueue;
use crate::websocket::ProgressBroadcaster;

pub mod dedupe;
pub mod hash;
pub mod nfo;
pub mod rename;
pub mod scan;
pub mod scrape;
pub mod tasks;
pub mod video;
pub mod watcher;

pub struct AppState {
    pub db: sqlx::SqlitePool,
    pub config: Arc<crate::config::AppConfig>,
    pub progress_broadcaster: ProgressBroadcaster,
    pub hash_cache: Arc<FileHashCache>,
    pub http_client: reqwest::Client, // 复用 HTTP 客户端连接池
    pub task_queue: Arc<TaskQueue>,   // 任务队列
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

// 重新导出各个 handler
pub use dedupe::{
    delete_empty_dirs, find_duplicate_movies, find_duplicates, find_empty_dirs, find_large_files,
};
pub use hash::*;
pub use nfo::*;
pub use rename::*;
pub use scan::*;
pub use scrape::batch_scrape_metadata;
pub use scrape::scrape_metadata;
pub use tasks::task_routes;
pub use video::*;
pub use watcher::*;

pub mod subtitle;
pub use subtitle::*;

pub mod file_ops;
pub use file_ops::{batch_copy_files, batch_move_files, copy_file, move_file};

pub mod trash;
pub use trash::{cleanup_trash, list_trash, move_to_trash, permanently_delete, restore_from_trash};

pub mod log;
pub use log::{list_operation_logs, undo_operation};

pub mod history;
pub use history::list_scan_history;

pub mod settings;
pub use settings::{get_settings, update_settings};
