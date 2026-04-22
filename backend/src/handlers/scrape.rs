use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

use crate::handlers::AppState;
use crate::services::{identify, quality, video};
use chrono::Utc;

#[derive(Deserialize, ToSchema)]
pub struct ScrapeRequest {
    pub file_id: String,
    pub tmdb_id: Option<u32>,
    pub auto_match: Option<bool>,
    pub download_images: Option<bool>,
    pub generate_nfo: Option<bool>,
}

#[derive(Serialize, ToSchema)]
pub struct ScrapeResponse {
    #[schema(value_type = Option<Object>)]
    pub metadata: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// 单文件刮削
#[utoipa::path(
    post,
    path = "/api/scrape",
    tag = "scrape",
    request_body = ScrapeRequest,
    responses(
        (status = 200, description = "刮削成功", body = ScrapeResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn scrape_metadata(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ScrapeRequest>,
) -> Result<Json<ScrapeResponse>, (axum::http::StatusCode, String)> {
    // 从数据库获取文件信息
    let file =
        sqlx::query_as::<_, crate::models::MediaFile>("SELECT * FROM media_files WHERE id = ?")
            .bind(&req.file_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let file = match file {
        Some(f) => f,
        None => {
            return Ok(Json(ScrapeResponse {
                metadata: None,
                error: Some("File not found".to_string()),
            }));
        }
    };

    let auto_match = req.auto_match.unwrap_or(true);
    let download_images = req.download_images.unwrap_or(false);
    let generate_nfo = req.generate_nfo.unwrap_or(false);

    if !auto_match {
        let preview =
            identify::preview_file(&state.db, &state.http_client, &state.config, &file, true)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let metadata = preview
            .candidates
            .into_iter()
            .map(|candidate| {
                let mut value = candidate.metadata;
                if let Some(object) = value.as_object_mut() {
                    object.insert(
                        "provider".to_string(),
                        serde_json::json!(candidate.provider),
                    );
                    object.insert(
                        "external_id".to_string(),
                        serde_json::json!(candidate.external_id),
                    );
                    object.insert(
                        "media_type".to_string(),
                        serde_json::json!(candidate.media_type),
                    );
                    object.insert("score".to_string(), serde_json::json!(candidate.score));
                }
                value
            })
            .collect::<Vec<_>>();
        return Ok(Json(ScrapeResponse {
            metadata: Some(serde_json::json!(metadata)),
            error: None,
        }));
    }

    let metadata = if let Some(tmdb_id) = req.tmdb_id {
        identify::apply_selection(
            &state.db,
            &state.http_client,
            &state.config,
            &identify::ApplySelection {
                file_id: file.id.clone(),
                provider: "tmdb".to_string(),
                external_id: tmdb_id.to_string(),
                media_type: if file.name.contains('S') || file.name.contains('E') {
                    "tv".to_string()
                } else {
                    "movie".to_string()
                },
                lock_match: false,
                download_images,
                generate_nfo,
            },
        )
        .await
    } else {
        let preview =
            identify::preview_file(&state.db, &state.http_client, &state.config, &file, true).await;
        match preview {
            Ok(preview) => {
                if let Some(recommended) = preview.recommended {
                    identify::apply_selection(
                        &state.db,
                        &state.http_client,
                        &state.config,
                        &identify::ApplySelection {
                            file_id: file.id.clone(),
                            provider: recommended.provider,
                            external_id: recommended.external_id,
                            media_type: recommended.media_type,
                            lock_match: false,
                            download_images,
                            generate_nfo,
                        },
                    )
                    .await
                } else {
                    Err(anyhow::anyhow!("No matching candidate found"))
                }
            }
            Err(err) => Err(err),
        }
    };

    match metadata {
        Ok(metadata) => {
            // 解析 TMDB ID
            let tmdb_id = metadata
                .get("tmdb_id")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);

            // 执行视频质量分析
            let video_info = video::extract_video_info(&file.path).await.ok();
            let quality_score = video_info.as_ref().map(quality::calculate_quality_score);

            // 保存到数据库
            let metadata_json = serde_json::to_string(&metadata).unwrap_or_default();
            let video_info_json = video_info
                .as_ref()
                .map(|info| serde_json::to_string(info).unwrap_or_default());

            let _ = sqlx::query(
                "UPDATE media_files SET metadata = ?, video_info = ?, tmdb_id = ?, quality_score = ?, updated_at = ? WHERE id = ?"
            )
            .bind(metadata_json)
            .bind(video_info_json)
            .bind(tmdb_id)
            .bind(quality_score)
            .bind(Utc::now())
            .bind(&file.id)
            .execute(&state.db)
            .await;

            Ok(Json(ScrapeResponse {
                metadata: Some(metadata),
                error: None,
            }))
        }
        Err(e) => Ok(Json(ScrapeResponse {
            metadata: None,
            error: Some(e.to_string()),
        })),
    }
}

#[derive(Deserialize, ToSchema)]
pub struct BatchScrapeRequest {
    pub file_ids: Vec<String>,
    pub auto_match: Option<bool>,
    #[serde(alias = "download_poster")]
    pub download_images: Option<bool>,
    pub generate_nfo: Option<bool>,
}

/// 批量刮削
#[utoipa::path(
    post,
    path = "/api/scrape/batch",
    tag = "scrape",
    request_body = BatchScrapeRequest,
    responses(
        (status = 200, description = "批量任务提交成功", body = TaskActionResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn batch_scrape_metadata(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchScrapeRequest>,
) -> Result<Json<crate::handlers::tasks::TaskActionResponse>, (axum::http::StatusCode, String)> {
    let auto_match = req.auto_match.unwrap_or(true);
    let download_images = req.download_images.unwrap_or(false);
    let generate_nfo = req.generate_nfo.unwrap_or(false);

    // 提交到任务队列
    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Scrape,
            Some(format!("批量刮削 {} 个文件", req.file_ids.len())),
            serde_json::json!({
                "file_ids": req.file_ids,
                "auto_match": auto_match,
                "download_images": download_images,
                "generate_nfo": generate_nfo
            }),
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(crate::handlers::tasks::TaskActionResponse {
        task_id,
        status: "submitted".to_string(),
        message: format!("Batch scrape task created for {} files", req.file_ids.len()),
    }))
}
