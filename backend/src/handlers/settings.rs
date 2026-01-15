use crate::handlers::AppState;
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
    State(state): State<Arc<AppState>>,
    Query(query): Query<GetSettingsQuery>,
) -> Result<Json<SettingsResponse>, (axum::http::StatusCode, String)> {
    // 1. 获取所有设置
    let db_settings = sqlx::query_as::<_, crate::models::Setting>("SELECT * FROM settings")
        .fetch_all(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 2. 转换为 HashMap
    let mut settings: HashMap<String, String> = db_settings
        .into_iter()
        .map(|s| (s.key, s.value.unwrap_or_default()))
        .collect();

    // 3. 填充默认值 (如果 DB 中不存在)
    let defaults = get_default_settings();
    for (key, value) in defaults {
        settings.entry(key.to_string()).or_insert(value.to_string());
    }

    // 4. 按分类过滤 (可选)
    if let Some(category) = query.category {
        // 这里简化处理：假设 key 的前缀或已知列表对应分类
        // 实际更复杂的做法是在 DB 中通过 category 字段筛选
        // 或者在 defaults 中维护 key -> category 的映射
        // 下面仅示例：如果 category 是 "tmdb"，只返回 tmdb_ 开头的配置
        if category == "tmdb" {
            settings.retain(|k, _| k.starts_with("tmdb_"));
        }
        // 其他分类逻辑根据实际需求添加
    }

    Ok(Json(SettingsResponse { settings }))
}

fn get_default_settings() -> Vec<(&'static str, &'static str)> {
    vec![
        ("tmdb_api_key", ""),
        ("tmdb_language", "zh-CN"),
        ("scan_concurrency", "4"),
        ("default_dir", "/"),
        ("auto_monitor", "1"),
        ("daily_cleanup", "1"),
        ("weekly_check", "1"),
    ]
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<Json<UpdateSettingsResponse>, (axum::http::StatusCode, String)> {
    let mut updated = Vec::new();

    for (key, value) in req.settings {
        // 使用 UPSERT 逻辑 (SQLite ON CONFLICT)
        // 注意：category 这里暂时没有从前端传，可以默认 'general' 或者根据 key 推断
        let category = "general";

        sqlx::query(
            "INSERT INTO settings (id, category, key, value, updated_at) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(category)
        .bind(&key)
        .bind(&value)
        .bind(chrono::Utc::now())
        .bind(&value) // update value
        .bind(chrono::Utc::now()) // update time
        .execute(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        updated.push(key);
    }

    Ok(Json(UpdateSettingsResponse {
        message: format!("Updated {} settings", updated.len()),
        updated,
    }))
}
