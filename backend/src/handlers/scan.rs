use crate::handlers::AppState;
use crate::models::*;
use axum::{
    extract::{Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

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
    let directory = req.directory.clone();
    let recursive = req.recursive.unwrap_or(true);
    let file_types = req
        .file_types
        .clone()
        .unwrap_or_else(|| vec!["video".to_string(), "audio".to_string()]);

    // 提交到任务队列
    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Scan,
            Some(format!("手动扫描: {}", directory)),
            serde_json::json!({
                "directory": directory,
                "recursive": recursive,
                "file_types": file_types
            }),
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(ScanResponse {
        task_id,
        message: format!("Scan task created for {}", directory),
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
    pub name: Option<String>,
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

    if let Some(ref name) = query.name {
        builder.push(" AND name LIKE ");
        builder.push_bind(format!("%{}%", name));
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

    if let Some(ref name) = query.name {
        count_builder.push(" AND name LIKE ");
        count_builder.push_bind(format!("%{}%", name));
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
