use axum::{
    extract::State,
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::scraper;

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
    let file = sqlx::query_as::<_, crate::models::MediaFile>(
        "SELECT * FROM media_files WHERE id = ?"
    )
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

    // 执行刮削
    match scraper::scrape_metadata(&file, source, auto_match, &state.config).await {
        Ok(metadata) => Ok(Json(ScrapeResponse {
            metadata: Some(metadata),
            error: None,
        })),
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

    let mut results = Vec::new();
    let mut errors = Vec::new();

    for file_id in req.file_ids {
        let file = sqlx::query_as::<_, crate::models::MediaFile>(
            "SELECT * FROM media_files WHERE id = ?"
        )
        .bind(&file_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        match file {
            Some(f) => {
                match scraper::scrape_metadata(&f, source, auto_match, &state.config).await {
                    Ok(metadata) => {
                        results.push(serde_json::json!({
                            "file_id": file_id,
                            "metadata": metadata,
                        }));
                    }
                    Err(e) => {
                        errors.push(format!("{}: {}", file_id, e));
                    }
                }
            }
            None => {
                errors.push(format!("{}: File not found", file_id));
            }
        }
    }

    Ok(Json(BatchScrapeResponse {
        results,
        errors,
    }))
}
