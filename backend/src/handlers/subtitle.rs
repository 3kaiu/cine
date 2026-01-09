use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::error::{AppError, AppResult};
use crate::handlers::AppState;
use crate::services::subtitle;

#[derive(Deserialize)]
pub struct SubtitleQuery {
    pub subtitle_dir: Option<String>,
}

#[derive(Serialize)]
pub struct SubtitleResponse {
    pub subtitles: Vec<subtitle::SubtitleInfo>,
    pub total: usize,
}

pub async fn find_subtitles(
    State(_state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
    Query(query): Query<SubtitleQuery>,
) -> AppResult<Json<SubtitleResponse>> {
    // 从数据库获取文件信息
    let file =
        sqlx::query_as::<_, crate::models::MediaFile>("SELECT * FROM media_files WHERE id = ?")
            .bind(&file_id)
            .fetch_optional(&_state.db)
            .await
            .map_err(AppError::Database)?;

    let file = file.ok_or_else(|| AppError::FileNotFound(file_id))?;

    let subtitles = subtitle::find_matching_subtitles(&file.path, query.subtitle_dir.as_deref())
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(SubtitleResponse {
        total: subtitles.len(),
        subtitles,
    }))
}

pub async fn search_remote_subtitles(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> AppResult<Json<Vec<subtitle::SubtitleSearchResult>>> {
    let file =
        sqlx::query_as::<_, crate::models::MediaFile>("SELECT * FROM media_files WHERE id = ?")
            .bind(&file_id)
            .fetch_optional(&state.db)
            .await
            .map_err(AppError::Database)?;

    let file = file.ok_or_else(|| AppError::FileNotFound(file_id))?;

    let results = subtitle::search_subtitles_remote(&file.name)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(results))
}

pub async fn download_remote_subtitle(
    State(_state): State<Arc<AppState>>,
    Path(_file_id): Path<String>,
) -> AppResult<Json<String>> {
    // 这里将集成具体的下载逻辑
    Err(AppError::Internal(
        "Subtitle downloading is currently pending API integration.".to_string(),
    ))
}
