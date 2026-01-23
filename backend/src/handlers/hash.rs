use crate::handlers::AppState;
use axum::{
    extract::{Path, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct HashResponse {
    pub task_id: String,
    pub message: String,
}

#[derive(Deserialize, ToSchema)]
pub struct BatchHashRequest {
    pub file_ids: Vec<String>,
}

/// 计算单个文件的哈希
#[utoipa::path(
    post,
    path = "/api/files/{file_id}/hash",
    tag = "hash",
    params(
        ("file_id" = String, Path, description = "文件ID")
    ),
    responses(
        (status = 200, description = "哈希计算任务已创建", body = HashResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
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

/// 批量计算文件哈希
#[utoipa::path(
    post,
    path = "/api/files/batch-hash",
    tag = "hash",
    request_body = BatchHashRequest,
    responses(
        (status = 200, description = "批量哈希计算任务已创建", body = HashResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn batch_calculate_hash(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchHashRequest>,
) -> Result<Json<HashResponse>, (axum::http::StatusCode, String)> {
    if req.file_ids.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "File IDs list cannot be empty".to_string(),
        ));
    }

    // 提交批量哈希任务
    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Custom("batch_hash".to_string()),
            Some(format!("批量计算哈希: {} 个文件", req.file_ids.len())),
            serde_json::json!({
                "file_ids": req.file_ids,
                "max_concurrent": 4,  // 默认并发数
            }),
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(HashResponse {
        task_id,
        message: format!("Batch hash calculation task created for {} files", req.file_ids.len()),
    }))
}
