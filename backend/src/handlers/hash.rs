use axum::{
    extract::{State, Path},
    response::Json,
};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;
use crate::services::hasher;

#[derive(Serialize)]
pub struct HashResponse {
    pub task_id: String,
    pub message: String,
}

pub async fn calculate_hash(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<HashResponse>, (axum::http::StatusCode, String)> {
    let task_id = Uuid::new_v4().to_string();
    let task_id_clone = task_id.clone();

    // 启动异步哈希计算任务
    let state_clone = state.clone();
    let file_id_clone = file_id.clone();
    let progress_broadcaster = Some(Arc::new(state_clone.progress_broadcaster.clone()));
    let hash_cache = Some(state_clone.hash_cache.clone());

    tokio::spawn(async move {
        if let Err(e) = hasher::calculate_file_hash(
            &state_clone.db,
            &file_id_clone,
            &task_id_clone,
            progress_broadcaster,
            hash_cache,
        ).await {
            tracing::error!("Hash task {} failed: {}", task_id_clone, e);
        }
    });

    Ok(Json(HashResponse {
        task_id,
        message: "Hash calculation started".to_string(),
    }))
}
