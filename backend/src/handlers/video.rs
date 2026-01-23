use axum::{
    extract::{State, Path},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

use crate::handlers::AppState;
use crate::models::VideoInfo;
use crate::services::video;

#[derive(Serialize, ToSchema)]
pub struct VideoInfoResponse {
    pub info: Option<VideoInfo>,
    pub error: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct BatchVideoInfoRequest {
    pub file_ids: Vec<String>,
}

#[derive(Serialize, ToSchema)]
pub struct BatchVideoInfoResponse {
    pub results: Vec<VideoInfoResult>,
}

#[derive(Serialize, ToSchema)]
pub struct VideoInfoResult {
    pub file_id: String,
    pub info: Option<VideoInfo>,
    pub error: Option<String>,
}

/// 获取单个文件的视频信息
#[utoipa::path(
    get,
    path = "/api/files/{file_id}/info",
    tag = "video",
    params(
        ("file_id" = String, Path, description = "文件ID")
    ),
    responses(
        (status = 200, description = "获取视频信息成功", body = VideoInfoResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_video_info(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<VideoInfoResponse>, (axum::http::StatusCode, String)> {
    // 从数据库获取文件信息（只查询需要的字段）
    let file = crate::queries::get_file_detail_by_id(&state.db, &file_id)
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

/// 批量获取视频信息
#[utoipa::path(
    post,
    path = "/api/files/batch-info",
    tag = "video",
    request_body = BatchVideoInfoRequest,
    responses(
        (status = 200, description = "批量获取视频信息成功", body = BatchVideoInfoResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn batch_get_video_info(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchVideoInfoRequest>,
) -> Result<Json<BatchVideoInfoResponse>, (axum::http::StatusCode, String)> {
    if req.file_ids.is_empty() {
        return Ok(Json(BatchVideoInfoResponse {
            results: Vec::new(),
        }));
    }

    // 批量从数据库获取文件信息
    let placeholders = vec!["?"; req.file_ids.len()].join(",");
    let query = format!("SELECT * FROM media_files WHERE id IN ({})", placeholders);

    let mut query_builder = sqlx::query_as::<_, crate::models::MediaFile>(&query);
    for file_id in &req.file_ids {
        query_builder = query_builder.bind(file_id);
    }

    let files = query_builder
        .fetch_all(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 创建文件ID到文件信息的映射
    let file_map: std::collections::HashMap<String, crate::models::MediaFile> =
        files.into_iter().map(|f| (f.id.clone(), f)).collect();

    // 并行提取视频信息（限制并发数避免资源耗尽）
    let max_concurrent = 4; // 限制并发数
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(max_concurrent));

    let results: Vec<VideoInfoResult> = futures::stream::iter(req.file_ids.into_iter())
        .map(|file_id| {
            let semaphore = semaphore.clone();
            let file_map = &file_map;

            async move {
                let _permit = semaphore.acquire().await.unwrap();

                let result = if let Some(file) = file_map.get(&file_id) {
                    match video::extract_video_info(&file.path).await {
                        Ok(info) => VideoInfoResult {
                            file_id,
                            info: Some(info),
                            error: None,
                        },
                        Err(e) => VideoInfoResult {
                            file_id,
                            info: None,
                            error: Some(e.to_string()),
                        },
                    }
                } else {
                    VideoInfoResult {
                        file_id,
                        info: None,
                        error: Some("File not found".to_string()),
                    }
                };

                result
            }
        })
        .buffer_unordered(max_concurrent)
        .collect()
        .await;

    Ok(Json(BatchVideoInfoResponse { results }))
}
