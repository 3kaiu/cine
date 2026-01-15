use axum::{
    extract::{Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::{IntoParams, ToSchema};

use crate::handlers::AppState;
use crate::services::{dedupe, empty_dirs};

#[derive(Serialize, ToSchema)]
pub struct DuplicateResponse {
    pub groups: Vec<crate::models::DuplicateGroup>,
    pub total_duplicates: u64,
    pub total_wasted_space: i64,
}

/// 查找重复文件
#[utoipa::path(
    post,
    path = "/api/dedupe",
    tag = "dedupe",
    responses(
        (status = 200, description = "重复文件查找成功", body = DuplicateResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn find_duplicates(
    State(state): State<Arc<AppState>>,
) -> Result<Json<DuplicateResponse>, (axum::http::StatusCode, String)> {
    let groups = dedupe::find_duplicates(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total_duplicates = groups.iter().map(|g| g.files.len() as u64 - 1).sum();
    let total_wasted_space = groups
        .iter()
        .map(|g| g.total_size - (g.total_size / g.files.len() as i64))
        .sum();

    Ok(Json(DuplicateResponse {
        groups,
        total_duplicates,
        total_wasted_space,
    }))
}

#[derive(Deserialize, IntoParams)]
pub struct EmptyDirsQuery {
    pub directory: Option<String>,
    pub recursive: Option<bool>,
    pub category: Option<String>, // cache, build, system, other
}

#[derive(Serialize, ToSchema)]
pub struct EmptyDirsResponse {
    pub dirs: Vec<empty_dirs::EmptyDirInfo>,
    pub total: usize,
    pub by_category: std::collections::HashMap<String, usize>,
}

/// 查找空目录
#[utoipa::path(
    get,
    path = "/api/empty-dirs",
    tag = "scan",
    params(
        EmptyDirsQuery
    ),
    responses(
        (status = 200, description = "获取空目录成功", body = EmptyDirsResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn find_empty_dirs(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<EmptyDirsQuery>,
) -> Result<Json<EmptyDirsResponse>, (axum::http::StatusCode, String)> {
    let directory = query.directory.unwrap_or_else(|| ".".to_string());
    let recursive = query.recursive.unwrap_or(true);

    let dirs = empty_dirs::find_empty_directories(&directory, recursive)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 按分类过滤
    let filtered_dirs: Vec<empty_dirs::EmptyDirInfo> = if let Some(ref category) = query.category {
        dirs.into_iter()
            .filter(|d| &d.category == category)
            .collect()
    } else {
        dirs
    };

    // 统计各分类数量
    let mut by_category = std::collections::HashMap::new();
    for dir in &filtered_dirs {
        *by_category.entry(dir.category.clone()).or_insert(0) += 1;
    }

    Ok(Json(EmptyDirsResponse {
        total: filtered_dirs.len(),
        dirs: filtered_dirs,
        by_category,
    }))
}

#[derive(Deserialize, ToSchema)]
pub struct DeleteEmptyDirsRequest {
    pub dirs: Vec<String>,
}

#[derive(Serialize, ToSchema)]
pub struct DeleteEmptyDirsResponse {
    pub deleted: Vec<String>,
    pub message: String,
}

/// 删除空目录
#[utoipa::path(
    post,
    path = "/api/empty-dirs/delete",
    tag = "scan",
    request_body = DeleteEmptyDirsRequest,
    responses(
        (status = 200, description = "删除空目录成功", body = DeleteEmptyDirsResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn delete_empty_dirs(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<DeleteEmptyDirsRequest>,
) -> Result<Json<DeleteEmptyDirsResponse>, (axum::http::StatusCode, String)> {
    let deleted = empty_dirs::delete_empty_directories(&req.dirs)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(DeleteEmptyDirsResponse {
        deleted: deleted.clone(),
        message: format!("Deleted {} empty directories", deleted.len()),
    }))
}

/// 查找大文件
#[utoipa::path(
    get,
    path = "/api/large-files",
    tag = "scan",
    responses(
        (status = 200, description = "获取大文件成功", body = [crate::models::MediaFile]),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn find_large_files(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<crate::models::MediaFile>>, (axum::http::StatusCode, String)> {
    let files = sqlx::query_as::<_, crate::models::MediaFile>(
        "SELECT * FROM media_files WHERE size > ? ORDER BY size DESC LIMIT 100",
    )
    .bind(10_000_000_000i64) // 10GB
    .fetch_all(&state.db)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(files))
}

/// 查找 TMDB 重复电影
#[utoipa::path(
    get,
    path = "/api/dedupe/movies",
    tag = "dedupe",
    responses(
        (status = 200, description = "获取重复电影成功", body = [crate::models::DuplicateMovieGroup]),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn find_duplicate_movies(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<crate::models::DuplicateMovieGroup>>, (axum::http::StatusCode, String)> {
    let groups = dedupe::find_duplicate_movies_by_tmdb(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(groups))
}
