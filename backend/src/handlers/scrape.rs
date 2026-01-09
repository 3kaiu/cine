use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::{quality, scraper, video};
use chrono::Utc;

#[derive(Deserialize)]
pub struct ScrapeRequest {
    pub file_id: String,
    pub source: Option<String>, // tmdb, douban
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

#[derive(Serialize)]
pub struct BatchScrapeResponse {
    pub results: Vec<serde_json::Value>,
    pub errors: Vec<String>,
}

pub async fn batch_scrape_metadata(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchScrapeRequest>,
) -> Result<Json<BatchScrapeResponse>, (axum::http::StatusCode, String)> {
    let source = req.source.as_deref().unwrap_or("tmdb");
    let auto_match = req.auto_match.unwrap_or(true);
    let _download_poster = req.download_poster.unwrap_or(false);
    let _generate_nfo = req.generate_nfo.unwrap_or(false);

    // 获取要刮削的文件列表
    let mut files = Vec::new();
    for file_id in req.file_ids {
        let file =
            sqlx::query_as::<_, crate::models::MediaFile>("SELECT * FROM media_files WHERE id = ?")
                .bind(&file_id)
                .fetch_optional(&state.db)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if let Some(f) = file {
            files.push(f);
        }
    }

    if files.is_empty() {
        return Ok(Json(BatchScrapeResponse {
            results: Vec::new(),
            errors: Vec::new(),
        }));
    }

    // 调用批量刮削服务（并行处理）
    let scrape_results = scraper::batch_scrape_metadata(
        &state.http_client,
        &files,
        source,
        auto_match,
        &state.config,
        req.download_poster.unwrap_or(false),
        req.generate_nfo.unwrap_or(false),
        5, // 并发数
    )
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut final_results = Vec::new();
    let mut errors = Vec::new();

    for (file_id, result) in scrape_results {
        match result {
            Ok(metadata) => {
                // 为每个成功的刮削保存到数据库
                let file = files.iter().find(|f| f.id == file_id).unwrap();

                let tmdb_id = metadata
                    .get("tmdb_id")
                    .and_then(|v| v.as_u64())
                    .map(|v| v as u32);
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
                .execute(&state.db)
                .await;

                final_results.push(serde_json::json!({
                    "file_id": file_id,
                    "metadata": metadata,
                    "quality_score": quality_score,
                }));
            }
            Err(e) => {
                errors.push(format!("{}: {}", file_id, e));
            }
        }
    }

    Ok(Json(BatchScrapeResponse {
        results: final_results,
        errors,
    }))
}
