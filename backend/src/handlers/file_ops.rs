use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

use crate::handlers::AppState;
use crate::services::file_ops;

#[derive(Deserialize, ToSchema)]
pub struct MoveFileRequest {
    pub file_id: String,
    pub target_dir: String,
}

#[derive(Deserialize, ToSchema)]
pub struct CopyFileRequest {
    pub file_id: String,
    pub target_dir: String,
}

#[derive(Deserialize, ToSchema)]
pub struct BatchMoveRequest {
    pub file_ids: Vec<String>,
    pub target_dir: String,
}

#[derive(Deserialize, ToSchema)]
pub struct BatchCopyRequest {
    pub file_ids: Vec<String>,
    pub target_dir: String,
}

#[derive(Serialize, ToSchema)]
pub struct FileOperationResponse {
    pub result: file_ops::FileOperationResult,
}

#[derive(Serialize, ToSchema)]
pub struct BatchFileOperationResponse {
    pub results: Vec<file_ops::FileOperationResult>,
    pub total: usize,
    pub success: usize,
    pub failed: usize,
}

/// 移动文件
#[utoipa::path(
    post,
    path = "/api/files/move",
    tag = "file_ops",
    request_body = MoveFileRequest,
    responses(
        (status = 200, description = "移动文件成功", body = FileOperationResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn move_file(
    State(state): State<Arc<AppState>>,
    Json(req): Json<MoveFileRequest>,
) -> Result<Json<FileOperationResponse>, (axum::http::StatusCode, String)> {
    let result = file_ops::move_file(&state.db, &req.file_id, &req.target_dir)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(FileOperationResponse { result }))
}

/// 复制文件
#[utoipa::path(
    post,
    path = "/api/files/copy",
    tag = "file_ops",
    request_body = CopyFileRequest,
    responses(
        (status = 200, description = "复制文件成功", body = FileOperationResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn copy_file(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CopyFileRequest>,
) -> Result<Json<FileOperationResponse>, (axum::http::StatusCode, String)> {
    let result = file_ops::copy_file(&state.db, &req.file_id, &req.target_dir)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(FileOperationResponse { result }))
}

/// 批量移动文件
#[utoipa::path(
    post,
    path = "/api/files/batch-move",
    tag = "file_ops",
    request_body = BatchMoveRequest,
    responses(
        (status = 200, description = "批量移动文件成功", body = BatchFileOperationResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn batch_move_files(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchMoveRequest>,
) -> Result<Json<BatchFileOperationResponse>, (axum::http::StatusCode, String)> {
    let results = file_ops::move_files_batch(&state.db, &req.file_ids, &req.target_dir)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let success = results.iter().filter(|r| r.success).count();
    let failed = results.len() - success;

    Ok(Json(BatchFileOperationResponse {
        total: results.len(),
        success,
        failed,
        results,
    }))
}

/// 批量复制文件
#[utoipa::path(
    post,
    path = "/api/files/batch-copy",
    tag = "file_ops",
    request_body = BatchCopyRequest,
    responses(
        (status = 200, description = "批量复制文件成功", body = BatchFileOperationResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn batch_copy_files(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchCopyRequest>,
) -> Result<Json<BatchFileOperationResponse>, (axum::http::StatusCode, String)> {
    let results = file_ops::copy_files_batch(&state.db, &req.file_ids, &req.target_dir)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let success = results.iter().filter(|r| r.success).count();
    let failed = results.len() - success;

    Ok(Json(BatchFileOperationResponse {
        total: results.len(),
        success,
        failed,
        results,
    }))
}
