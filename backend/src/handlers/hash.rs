use crate::handlers::AppState;
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
    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Hash,
            Some(format!("计算哈希: {}", file_id)),
            serde_json::json!({
                "file_id": file_id
            }),
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(HashResponse {
        task_id,
        message: format!("Hash calculation task created for {}", file_id),
    }))
}
