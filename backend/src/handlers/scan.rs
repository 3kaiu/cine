use crate::handlers::AppState;
use crate::models::*;
use crate::services::library_service::{FileListQuery as LibraryFileListQuery, LibraryService};
use axum::{
    extract::{Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::{IntoParams, ToSchema};

#[derive(Deserialize, ToSchema)]
pub struct ScanRequest {
    pub directory: String,
    pub recursive: Option<bool>,
    pub file_types: Option<Vec<String>>, // video, audio, image, document
}

#[derive(Serialize, ToSchema)]
pub struct ScanResponse {
    pub task_id: String,
    pub message: String,
}

/// 扫描目录
#[utoipa::path(
    post,
    path = "/api/scan",
    tag = "scan",
    request_body = ScanRequest,
    responses(
        (status = 200, description = "扫描任务创建成功", body = ScanResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn scan_directory(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ScanRequest>,
) -> Result<Json<ScanResponse>, (axum::http::StatusCode, String)> {
    let directory = req.directory.clone();
    let recursive = req.recursive.unwrap_or(true);
    let file_types = req
        .file_types
        .clone()
        .unwrap_or_else(|| vec!["video".to_string(), "audio".to_string()]);

    // 通过 LibraryService 提交到任务队列
    let service = LibraryService::new(state.db.clone(), state.task_queue.clone());
    let task_id = service
        .submit_scan_task(
            directory.clone(),
            recursive,
            file_types,
            Some(format!("手动扫描: {}", directory)),
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(ScanResponse {
        task_id,
        message: format!("Scan task created for {}", directory),
    }))
}

#[derive(Serialize, ToSchema)]
pub struct FileListResponse {
    pub files: Vec<MediaFile>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

#[derive(Deserialize, IntoParams)]
pub struct FileListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub file_type: Option<String>,
    pub name: Option<String>,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
}

/// 获取文件列表
#[utoipa::path(
    get,
    path = "/api/files",
    tag = "scan",
    params(
        FileListQuery
    ),
    responses(
        (status = 200, description = "获取文件列表成功", body = FileListResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn list_files(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FileListQuery>,
) -> Result<Json<FileListResponse>, (axum::http::StatusCode, String)> {
    let service = LibraryService::new(state.db.clone(), state.task_queue.clone());
    let resp = service
        .list_files(LibraryFileListQuery {
            page: query.page,
            page_size: query.page_size,
            file_type: query.file_type,
            name: query.name,
            min_size: query.min_size,
            max_size: query.max_size,
        })
        .await?;

    Ok(Json(FileListResponse {
        files: resp.files,
        total: resp.total,
        page: resp.page,
        page_size: resp.page_size,
    }))
}
