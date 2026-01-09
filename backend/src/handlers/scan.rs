use axum::{
    extract::{Query, State},
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
    let file_types = req
        .file_types
        .unwrap_or_else(|| vec!["video".to_string(), "audio".to_string()]);

    let progress_broadcaster = Some(Arc::new(state_clone.progress_broadcaster.clone()));

    tokio::spawn(async move {
        if let Err(e) = scanner::scan_directory(
            &state_clone.db,
            &directory,
            recursive,
            &file_types,
            &task_id_clone,
            progress_broadcaster,
        )
        .await
        {
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

    // 使用 QueryBuilder 正确绑定参数
    let mut builder = sqlx::QueryBuilder::new("SELECT * FROM media_files WHERE 1=1");

    if let Some(ref file_type) = query.file_type {
        builder.push(" AND file_type = ");
        builder.push_bind(file_type);
    }

    if let Some(min_size) = query.min_size {
        builder.push(" AND size >= ");
        builder.push_bind(min_size);
    }

    if let Some(max_size) = query.max_size {
        builder.push(" AND size <= ");
        builder.push_bind(max_size);
    }

    builder.push(" ORDER BY size DESC LIMIT ");
    builder.push_bind(page_size as i64);
    builder.push(" OFFSET ");
    builder.push_bind(offset as i64);

    let files = builder
        .build_query_as::<MediaFile>()
        .fetch_all(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // COUNT 查询也应用相同的过滤条件
    let mut count_builder = sqlx::QueryBuilder::new("SELECT COUNT(*) FROM media_files WHERE 1=1");

    if let Some(ref file_type) = query.file_type {
        count_builder.push(" AND file_type = ");
        count_builder.push_bind(file_type);
    }

    if let Some(min_size) = query.min_size {
        count_builder.push(" AND size >= ");
        count_builder.push_bind(min_size);
    }

    if let Some(max_size) = query.max_size {
        count_builder.push(" AND size <= ");
        count_builder.push_bind(max_size);
    }

    let total: i64 = count_builder
        .build_query_scalar()
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
