use crate::handlers::AppState;
use crate::services::{log, renamer};
use axum::{
    extract::{Path, State},
    response::Json,
};
use std::sync::Arc;

/// 获取操作记录
pub async fn list_operation_logs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<crate::models::OperationLog>>, (axum::http::StatusCode, String)> {
    let logs = log::get_recent_logs(&state.db, 100)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(logs))
}

/// 撤销操作
pub async fn undo_operation(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<String>, (axum::http::StatusCode, String)> {
    // 目前重命名支持撤销
    renamer::undo_rename_by_log(&state.db, &id)
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;

    Ok(Json("Operation successfully undone".to_string()))
}
