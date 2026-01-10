use crate::handlers::AppState;
use crate::models::Setting;
use axum::{
    extract::{Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct GetSettingsQuery {
    pub category: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SettingsResponse {
    pub settings: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub settings: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct UpdateSettingsResponse {
    pub message: String,
    pub updated: Vec<String>,
}

pub async fn get_settings(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<GetSettingsQuery>,
) -> Result<Json<SettingsResponse>, (axum::http::StatusCode, String)> {
    // TODO: Implement actual database query
    // For now, return default values
    let mut settings = HashMap::new();

    if let Some(category) = query.category {
        match category.as_str() {
            "basic" => {
                settings.insert("tmdb_api_key".to_string(), "".to_string());
                settings.insert("default_dir".to_string(), "/".to_string());
                settings.insert("auto_monitor".to_string(), "1".to_string());
            }
            "scheduler" => {
                settings.insert("daily_cleanup".to_string(), "1".to_string());
                settings.insert("weekly_quality_update".to_string(), "1".to_string());
            }
            _ => {}
        }
    } else {
        settings.insert("tmdb_api_key".to_string(), "".to_string());
        settings.insert("default_dir".to_string(), "/".to_string());
        settings.insert("auto_monitor".to_string(), "1".to_string());
        settings.insert("daily_cleanup".to_string(), "1".to_string());
        settings.insert("weekly_quality_update".to_string(), "1".to_string());
    }

    Ok(Json(SettingsResponse { settings }))
}

pub async fn update_settings(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<Json<UpdateSettingsResponse>, (axum::http::StatusCode, String)> {
    // TODO: Implement actual database update
    let updated: Vec<String> = req.settings.keys().cloned().collect();

    Ok(Json(UpdateSettingsResponse {
        message: format!("Updated {} settings", updated.len()),
        updated,
    }))
}
