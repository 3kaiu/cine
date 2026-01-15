use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::{quality, scraper, video};
use chrono::Utc;

#[derive(Deserialize)]
pub struct ScrapeRequest {
    pub file_id: String,
    pub source: Option<String>, // tmdb
    pub auto_match: Option<bool>,
}

#[derive(Serialize)]
pub struct ScrapeResponse {
    pub metadata: Option<serde_json::Value>,
    pub error: Option<String>,
}

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

    let source = req.source.as_deref().unwrap_or("tmdb");
    let auto_match = req.auto_match.unwrap_or(true);

    // 执行刮削（使用共享 HTTP 客户端）
    match scraper::scrape_metadata(&state.http_client, &file, source, auto_match, &state.config)
        .await
    {
        Ok(metadata) => {
            // 解析 TMDB ID
            let tmdb_id = metadata
                .get("tmdb_id")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);

            // 执行视频质量分析
            let video_info = video::extract_video_info(&file.path).await.ok();
            let quality_score = video_info
                .as_ref()
                .map(|info| quality::calculate_quality_score(info));

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

#[derive(Deserialize)]
pub struct BatchScrapeRequest {
    pub file_ids: Vec<String>,
    pub source: Option<String>,
    pub auto_match: Option<bool>,
    pub download_poster: Option<bool>,
    pub generate_nfo: Option<bool>,
}

pub async fn batch_scrape_metadata(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchScrapeRequest>,
) -> Result<Json<crate::handlers::tasks::TaskActionResponse>, (axum::http::StatusCode, String)> {
    let source = req.source.clone().unwrap_or_else(|| "tmdb".to_string());
    let auto_match = req.auto_match.unwrap_or(true);
    let download_poster = req.download_poster.unwrap_or(false);
    let generate_nfo = req.generate_nfo.unwrap_or(false);

    // 获取要刮削的文件列表
    let mut files = Vec::new();
    for file_id in &req.file_ids {
        let file =
            sqlx::query_as::<_, crate::models::MediaFile>("SELECT * FROM media_files WHERE id = ?")
                .bind(file_id)
                .fetch_optional(&state.db)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if let Some(f) = file {
            files.push(f);
        }
    }

    if files.is_empty() {
        return Err((axum::http::StatusCode::BAD_REQUEST, "No files found to scrape".to_string()));
    }

    let state_clone = state.clone();
    let files_count = files.len();

    // 提交到任务队列
    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Scrape,
            Some(format!("批量刮削 {} 个文件", files_count)),
            move |ctx| async move {
                let scrape_results = scraper::batch_scrape_metadata(
                    &state_clone.http_client,
                    &files,
                    &source,
                    auto_match,
                    &state_clone.config,
                    download_poster,
                    generate_nfo,
                    5, // 并发数
                    ctx,
                )
                .await?;

                for (file_id, result) in scrape_results {
                    if let Ok(metadata) = result {
                        // 为每个成功的刮削保存到数据库
                        let file = files.iter().find(|f| f.id == file_id).unwrap();

                        let tmdb_id = metadata
                            .get("tmdb_id")
                            .and_then(|v| v.as_u64())
                            .map(|v| v as u32);
                        
                        // 执行视频质量分析
                        let video_info = video::extract_video_info(&file.path).await.ok();
                        let quality_score = video_info
                            .as_ref()
                            .map(|info| quality::calculate_quality_score(info));

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
                        .bind(&file_id)
                        .execute(&state_clone.db)
                        .await;
                    }
                }
                Ok(None)
            },
        )
        .await;

    Ok(Json(crate::handlers::tasks::TaskActionResponse {
        task_id,
        status: "submitted".to_string(),
        message: format!("Batch scrape task submitted for {} files", files_count),
    }))
}
