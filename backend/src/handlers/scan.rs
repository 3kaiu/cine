use axum::{
    extract::{State, Query},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::handlers::AppState;
use crate::models::*;
use crate::services::scanner;

#[derive(Deserialize)]
pub struct ScanRequest {
    pub directory: String,
    pub recursive: Option<bool>,
    pub file_types: Option<Vec<String>>, // video, audio, image, document
}

#[derive(Serialize)]
pub struct ScanResponse {
    pub task_id: String,
    pub message: String,
}

pub async fn scan_directory(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ScanRequest>,
) -> Result<Json<ScanResponse>, (axum::http::StatusCode, String)> {
    let task_id = Uuid::new_v4().to_string();
    let task_id_clone = task_id.clone();

    // 启动异步扫描任务
    let state_clone = state.clone();
    let directory = req.directory.clone();
    let recursive = req.recursive.unwrap_or(true);
    let file_types = req.file_types.unwrap_or_else(|| {
        vec!["video".to_string(), "audio".to_string()]
    });

    let progress_broadcaster = Some(Arc::new(state_clone.progress_broadcaster.clone()));
    
    tokio::spawn(async move {
        if let Err(e) = scanner::scan_directory(
            &state_clone.db,
            &directory,
            recursive,
            &file_types,
            &task_id_clone,
            progress_broadcaster,
        ).await {
            tracing::error!("Scan task {} failed: {}", task_id_clone, e);
        }
    });

    Ok(Json(ScanResponse {
        task_id,
        message: "Scan task started".to_string(),
    }))
}

#[derive(Serialize)]
pub struct FileListResponse {
    pub files: Vec<MediaFile>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

#[derive(Deserialize)]
pub struct FileListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub file_type: Option<String>,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
}

pub async fn list_files(
    State(state): State<Arc<AppState>>,
    Query(query): Query<FileListQuery>,
) -> Result<Json<FileListResponse>, (axum::http::StatusCode, String)> {
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(50);
    let offset = (page - 1) * page_size;

    let mut sql = "SELECT * FROM media_files WHERE 1=1".to_string();
    let mut params: Vec<String> = Vec::new();

    if let Some(file_type) = &query.file_type {
        sql.push_str(" AND file_type = ?");
        params.push(file_type.clone());
    }

    if let Some(min_size) = query.min_size {
        sql.push_str(" AND size >= ?");
        params.push(min_size.to_string());
    }

    if let Some(max_size) = query.max_size {
        sql.push_str(" AND size <= ?");
        params.push(max_size.to_string());
    }

    sql.push_str(" ORDER BY size DESC LIMIT ? OFFSET ?");
    params.push(page_size.to_string());
    params.push(offset.to_string());

    // 执行查询（简化版，实际应该使用 sqlx 的参数化查询）
    let files = sqlx::query_as::<_, MediaFile>(&sql)
        .fetch_all(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM media_files")
        .fetch_one(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(FileListResponse {
        files,
        total: total as u64,
        page,
        page_size,
    }))
}
