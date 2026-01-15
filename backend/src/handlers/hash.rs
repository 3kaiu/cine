use crate::handlers::AppState;
use crate::services::hasher;
use axum::{
    extract::{Path, State},
    response::Json,
};
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
pub struct HashResponse {
    pub task_id: String,
    pub message: String,
}

pub async fn calculate_hash(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<HashResponse>, (axum::http::StatusCode, String)> {
    // 提交到任务队列
    let state_clone = state.clone();
    let file_id_clone = file_id.clone();
    let hash_cache = Some(state_clone.hash_cache.clone());

    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Hash,
            Some(format!("计算哈希: {}", file_id)),
            move |ctx| async move {
                hasher::calculate_file_hash(&state_clone.db, &file_id_clone, ctx, hash_cache)
                    .await?;
                Ok(None)
            },
        )
        .await;

    Ok(Json(HashResponse {
        task_id,
        message: "Hash calculation task submitted to queue".to_string(),
    }))
}
