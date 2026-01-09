use crate::handlers::AppState;
use crate::models::MediaFile;
use crate::services::nfo::{read_nfo_file, save_nfo_file, MovieNfo};
use axum::{
    extract::{Path as AxumPath, State},
    response::IntoResponse,
    Json,
};
use std::path::Path;
use std::sync::Arc;

pub async fn get_nfo(
    State(state): State<Arc<AppState>>,
    AxumPath(file_id): AxumPath<String>,
) -> impl IntoResponse {
    let file: Option<MediaFile> = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(&file_id)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);

    let file = match file {
        Some(f) => f,
        None => return (axum::http::StatusCode::NOT_FOUND, "File not found").into_response(),
    };

    let nfo_path = Path::new(&file.path).with_extension("nfo");

    match read_nfo_file(nfo_path.to_str().unwrap()).await {
        Ok(nfo) => Json(nfo).into_response(),
        Err(e) => (
            axum::http::StatusCode::NOT_FOUND,
            format!("NFO not found: {}", e),
        )
            .into_response(),
    }
}

pub async fn update_nfo(
    State(state): State<Arc<AppState>>,
    AxumPath(file_id): AxumPath<String>,
    Json(nfo): Json<MovieNfo>,
) -> impl IntoResponse {
    let file: Option<MediaFile> = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(&file_id)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);

    let file = match file {
        Some(f) => f,
        None => return (axum::http::StatusCode::NOT_FOUND, "File not found").into_response(),
    };

    let nfo_path = Path::new(&file.path).with_extension("nfo");

    match save_nfo_file(nfo_path.to_str().unwrap(), &nfo).await {
        Ok(_) => (axum::http::StatusCode::OK, "Updated").into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}
