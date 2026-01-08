use axum::{
    extract::{State, Path},
    response::Json,
};
use serde::Serialize;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::models::VideoInfo;
use crate::services::video;

#[derive(Serialize)]
pub struct VideoInfoResponse {
    pub info: Option<VideoInfo>,
    pub error: Option<String>,
}

pub async fn get_video_info(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<VideoInfoResponse>, (axum::http::StatusCode, String)> {
    // 从数据库获取文件信息
    let file = sqlx::query_as::<_, crate::models::MediaFile>(
        "SELECT * FROM media_files WHERE id = ?"
    )
    .bind(&file_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let file = match file {
        Some(f) => f,
        None => {
            return Ok(Json(VideoInfoResponse {
                info: None,
                error: Some("File not found".to_string()),
            }));
        }
    };

    // 提取视频信息
    match video::extract_video_info(&file.path).await {
        Ok(info) => Ok(Json(VideoInfoResponse {
            info: Some(info),
            error: None,
        })),
        Err(e) => Ok(Json(VideoInfoResponse {
            info: None,
            error: Some(e.to_string()),
        })),
    }
}
