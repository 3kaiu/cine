use axum::response::Json;
use serde::Serialize;
use std::sync::Arc;

use crate::websocket::ProgressBroadcaster;
use crate::services::cache::FileHashCache;

pub mod scan;
pub mod hash;
pub mod video;
pub mod scrape;
pub mod rename;
pub mod dedupe;

pub struct AppState {
    pub db: sqlx::SqlitePool,
    pub config: Arc<crate::config::AppConfig>,
    pub progress_broadcaster: ProgressBroadcaster,
    pub hash_cache: Arc<FileHashCache>,
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
pub use scan::*;
pub use hash::*;
pub use video::*;
pub use scrape::scrape_metadata;
pub use scrape::batch_scrape_metadata;
pub use rename::*;
pub use dedupe::{find_duplicates, find_empty_dirs, find_large_files, delete_empty_dirs};

pub mod subtitle;
pub use subtitle::find_subtitles;

pub mod file_ops;
pub use file_ops::{move_file, copy_file, batch_move_files, batch_copy_files};

pub mod trash;
pub use trash::{list_trash, move_to_trash, restore_from_trash, permanently_delete, cleanup_trash};
