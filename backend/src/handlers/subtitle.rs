use axum::{
    extract::{State, Path, Query},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::subtitle;
use crate::error::{AppError, AppResult};

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
    let file = sqlx::query_as::<_, crate::models::MediaFile>(
        "SELECT * FROM media_files WHERE id = ?"
    )
    .bind(&file_id)
    .fetch_optional(&_state.db)
    .await
    .map_err(AppError::Database)?;

    let file = file.ok_or_else(|| AppError::FileNotFound(file_id))?;

    let subtitles = subtitle::find_matching_subtitles(
        &file.path,
        query.subtitle_dir.as_deref(),
    ).map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(SubtitleResponse {
        total: subtitles.len(),
        subtitles,
    }))
}
