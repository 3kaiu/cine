use axum::{
    extract::{Path, State},
    response::Json,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

use crate::handlers::AppState;
use crate::services::trash;

#[derive(Serialize, ToSchema)]
pub struct TrashListResponse {
    pub items: Vec<trash::TrashItem>,
    pub total: usize,
}

#[derive(Deserialize, ToSchema)]
pub struct RestoreRequest {
    pub target_path: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct RestoreResponse {
    pub restored_path: String,
    pub message: String,
}

#[derive(Deserialize, ToSchema)]
pub struct BatchTrashRequest {
    pub file_ids: Vec<String>,
}

#[derive(Serialize, ToSchema)]
pub struct BatchTrashResponse {
    pub results: Vec<TrashResult>,
}

#[derive(Serialize, ToSchema)]
pub struct TrashResult {
    pub file_id: String,
    pub success: bool,
    pub error: Option<String>,
}

pub async fn list_trash(
    State(state): State<Arc<AppState>>,
) -> Result<Json<TrashListResponse>, (axum::http::StatusCode, String)> {
    // 从配置获取回收站目录
    let trash_dir = state
        .config
        .hash_cache_dir
        .parent()
        .unwrap_or_else(|| std::path::Path::new("./data"))
        .join("trash");

    let trash_config = trash::TrashConfig::new(trash_dir);
    let items = trash::list_trash(&state.db, &trash_config)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(TrashListResponse {
        total: items.len(),
        items,
    }))
}

pub async fn move_to_trash(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<trash::TrashItem>, (axum::http::StatusCode, String)> {
    let trash_dir = state
        .config
        .hash_cache_dir
        .parent()
        .unwrap_or_else(|| std::path::Path::new("./data"))
        .join("trash");

    let trash_config = trash::TrashConfig::new(trash_dir);
    let item = trash::move_to_trash(&state.db, &file_id, &trash_config)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(item))
}

pub async fn restore_from_trash(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
    Json(req): Json<RestoreRequest>,
) -> Result<Json<RestoreResponse>, (axum::http::StatusCode, String)> {
    let restored_path = trash::restore_from_trash(&state.db, &file_id, req.target_path.as_deref())
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(RestoreResponse {
        restored_path: restored_path.clone(),
        message: format!("File restored to: {}", restored_path),
    }))
}

pub async fn permanently_delete(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    trash::permanently_delete(&state.db, &file_id)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "message": "File permanently deleted"
    })))
}

/// 批量移动文件到回收站
#[utoipa::path(
    post,
    path = "/api/files/batch-trash",
    tag = "trash",
    request_body = BatchTrashRequest,
    responses(
        (status = 200, description = "批量删除到回收站成功", body = BatchTrashResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn batch_move_to_trash(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchTrashRequest>,
) -> Result<Json<BatchTrashResponse>, (axum::http::StatusCode, String)> {
    if req.file_ids.is_empty() {
        return Ok(Json(BatchTrashResponse {
            results: Vec::new(),
        }));
    }

    let trash_dir = state
        .config
        .hash_cache_dir
        .parent()
        .unwrap_or_else(|| std::path::Path::new("./data"))
        .join("trash");

    let trash_config = trash::TrashConfig::new(trash_dir);

    // 并行处理批量删除
    let max_concurrent = 4;
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(max_concurrent));

    let results: Vec<TrashResult> = futures::stream::iter(req.file_ids.into_iter())
        .map(|file_id: String| {
            let semaphore = semaphore.clone();
            let db = state.db.clone();
            let trash_config = &trash_config;

            async move {
                let _permit = semaphore.acquire().await.unwrap();

                match trash::move_to_trash(&db, &file_id, trash_config).await {
                    Ok(_) => TrashResult {
                        file_id,
                        success: true,
                        error: None,
                    },
                    Err(e) => TrashResult {
                        file_id,
                        success: false,
                        error: Some(e.to_string()),
                    },
                }
            }
        })
        .buffer_unordered(max_concurrent)
        .collect()
        .await;

    Ok(Json(BatchTrashResponse { results }))
}

pub async fn cleanup_trash(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let trash_dir = state
        .config
        .hash_cache_dir
        .parent()
        .unwrap_or_else(|| std::path::Path::new("./data"))
        .join("trash");

    let trash_config = trash::TrashConfig::new(trash_dir);
    let deleted_count = trash::cleanup_trash(&state.db, &trash_config)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "deleted_count": deleted_count,
        "message": format!("Cleaned up {} expired files", deleted_count)
    })))
}
