use axum::{
    extract::{Path, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::trash;

#[derive(Serialize)]
pub struct TrashListResponse {
    pub items: Vec<trash::TrashItem>,
    pub total: usize,
}

#[derive(Deserialize)]
pub struct RestoreRequest {
    pub target_path: Option<String>,
}

#[derive(Serialize)]
pub struct RestoreResponse {
    pub restored_path: String,
    pub message: String,
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
