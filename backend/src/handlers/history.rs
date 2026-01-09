use crate::handlers::AppState;
use crate::services::history;
use axum::{extract::State, response::Json};
use std::sync::Arc;

/// 获取扫描历史摘要
pub async fn list_scan_history(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<crate::models::ScanHistory>>, (axum::http::StatusCode, String)> {
    let history = history::get_all_history(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(history))
}
