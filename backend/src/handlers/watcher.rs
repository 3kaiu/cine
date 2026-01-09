use crate::handlers::AppState;
use crate::models::WatchFolder;
use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

pub async fn list_watch_folders(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let result: Result<Vec<WatchFolder>, _> = sqlx::query_as("SELECT * FROM watch_folders")
        .fetch_all(&state.db)
        .await;

    match result {
        Ok(folders) => Json(folders).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn add_watch_folder(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let path = payload.get("path").and_then(|p| p.as_str()).unwrap_or("");
    let auto_scrape = payload
        .get("auto_scrape")
        .and_then(|p| p.as_bool())
        .unwrap_or(true);
    let auto_rename = payload
        .get("auto_rename")
        .and_then(|p| p.as_bool())
        .unwrap_or(false);

    if path.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, "Path is required").into_response();
    }

    let id = Uuid::new_v4().to_string();
    let result = sqlx::query(
        "INSERT INTO watch_folders (id, path, auto_scrape, auto_rename) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(path)
    .bind(auto_scrape)
    .bind(auto_rename)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(id).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn delete_watch_folder(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let result = sqlx::query("DELETE FROM watch_folders WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => (axum::http::StatusCode::OK, "Deleted").into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
