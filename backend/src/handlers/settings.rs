use crate::handlers::AppState;
use axum::{
    extract::{Query, State},
    response::Json,
};
use reqwest::StatusCode as ReqwestStatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use utoipa::ToSchema;

#[derive(Debug, Deserialize)]
pub struct GetSettingsQuery {
    pub category: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SettingsResponse {
    pub settings: HashMap<String, String>,
    pub masked_settings: HashMap<String, String>,
    pub configured_keys: Vec<String>,
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

#[derive(Debug, Deserialize, ToSchema)]
pub struct SettingsHealthCheckRequest {
    pub provider: String,
    #[serde(default)]
    pub settings: HashMap<String, String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SettingsHealthCheckResponse {
    pub provider: String,
    pub ok: bool,
    pub message: String,
    pub details: HashMap<String, String>,
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

    let configured_keys = settings
        .iter()
        .filter(|(key, value)| is_sensitive_key(key) && !value.is_empty())
        .map(|(key, _)| key.clone())
        .collect::<Vec<_>>();
    let masked_settings = settings
        .iter()
        .map(|(key, value)| {
            let masked = if is_sensitive_key(key) {
                mask_sensitive_value(value)
            } else {
                value.clone()
            };
            (key.clone(), masked)
        })
        .collect();
    let sanitized_settings = settings
        .into_iter()
        .map(|(key, value)| {
            if is_sensitive_key(&key) {
                (key, String::new())
            } else {
                (key, value)
            }
        })
        .collect();

    Ok(Json(SettingsResponse {
        settings: sanitized_settings,
        masked_settings,
        configured_keys,
    }))
}

fn get_default_settings() -> Vec<(&'static str, &'static str)> {
    vec![
        ("tmdb_api_key", ""),
        ("bgm_api_key", ""),
        ("tmdb_language", "zh-CN"),
        ("scan_concurrency", "4"),
        ("default_dir", "/"),
        ("auto_monitor", "1"),
        ("daily_cleanup", "1"),
        ("weekly_quality_update", "1"),
        ("cloudflare_account_id", ""),
        ("cloudflare_api_token", ""),
        ("cloudflare_ai_model", "@cf/meta/llama-3.1-8b-instruct"),
        ("cloudflare_ai_base_url", ""),
        ("ai_mode", "assist"),
        ("ai_budget_mode", "strict_free"),
        ("ai_daily_budget", "100"),
    ]
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<Json<UpdateSettingsResponse>, (axum::http::StatusCode, String)> {
    let mut updated = Vec::new();

    for (key, value) in req.settings {
        if is_sensitive_key(&key) && value.is_empty() {
            continue;
        }
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

#[utoipa::path(
    post,
    path = "/api/settings/health-check",
    tag = "settings",
    request_body = SettingsHealthCheckRequest,
    responses(
        (status = 200, description = "配置检查结果", body = SettingsHealthCheckResponse),
        (status = 400, description = "请求参数错误"),
        (status = 500, description = "检查失败")
    )
)]
pub async fn health_check_settings(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SettingsHealthCheckRequest>,
) -> Result<Json<SettingsHealthCheckResponse>, (axum::http::StatusCode, String)> {
    let stored_rows: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT key, value FROM settings")
            .fetch_all(&state.db)
            .await
            .map_err(internal_error)?;
    let mut settings = HashMap::new();
    for (key, value) in get_default_settings() {
        settings.insert(key.to_string(), value.to_string());
    }
    for (key, value) in stored_rows {
        settings.insert(key, value.unwrap_or_default());
    }
    for (key, value) in req.settings {
        settings.insert(key, value);
    }
    if let Some(tmdb_api_key) = state.config.tmdb_api_key.clone() {
        settings
            .entry("tmdb_api_key".to_string())
            .or_insert(tmdb_api_key);
    }

    let provider = req.provider.trim().to_lowercase();
    let response = match provider.as_str() {
        "tmdb" => check_tmdb(&state.http_client, &settings).await,
        "bangumi" => check_bangumi(&state.http_client, &settings).await,
        "cloudflare" | "cloudflare_ai" => check_cloudflare_ai(&state.http_client, &settings).await,
        _ => {
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                format!("unsupported provider: {}", provider),
            ))
        }
    }?;

    Ok(Json(response))
}

fn is_sensitive_key(key: &str) -> bool {
    matches!(
        key,
        "tmdb_api_key" | "bgm_api_key" | "cloudflare_api_token" | "cloudflare_account_id"
    )
}

fn mask_sensitive_value(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    if value.len() <= 6 {
        return "******".to_string();
    }
    format!("{}{}", &value[..3], "*".repeat(value.len() - 3))
}

fn internal_error(err: sqlx::Error) -> (axum::http::StatusCode, String) {
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        err.to_string(),
    )
}

fn string_setting(settings: &HashMap<String, String>, key: &str) -> Option<String> {
    settings
        .get(key)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn check_tmdb(
    client: &reqwest::Client,
    settings: &HashMap<String, String>,
) -> Result<SettingsHealthCheckResponse, (axum::http::StatusCode, String)> {
    let api_key = string_setting(settings, "tmdb_api_key").ok_or((
        axum::http::StatusCode::BAD_REQUEST,
        "tmdb_api_key is required".to_string(),
    ))?;
    let base_url = string_setting(settings, "tmdb_api_base_url")
        .unwrap_or_else(crate::services::scraper::tmdb_api_base_url);
    let url = format!(
        "{}/configuration?api_key={}",
        base_url.trim_end_matches('/'),
        api_key
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(http_error("TMDb request failed"))?;
    let payload: Value = parse_json_response(response, "TMDb").await?;

    let mut details = HashMap::new();
    details.insert("base_url".to_string(), base_url);
    details.insert(
        "images_secure_base_url".to_string(),
        payload
            .get("images")
            .and_then(|images| images.get("secure_base_url"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    );

    Ok(SettingsHealthCheckResponse {
        provider: "tmdb".to_string(),
        ok: true,
        message: "TMDb API 连接正常".to_string(),
        details,
    })
}

async fn check_bangumi(
    client: &reqwest::Client,
    settings: &HashMap<String, String>,
) -> Result<SettingsHealthCheckResponse, (axum::http::StatusCode, String)> {
    let api_key = string_setting(settings, "bgm_api_key").ok_or((
        axum::http::StatusCode::BAD_REQUEST,
        "bgm_api_key is required".to_string(),
    ))?;
    let base_url = string_setting(settings, "bangumi_api_base_url")
        .unwrap_or_else(crate::services::scraper::bangumi_api_base_url);
    let url = format!("{}/v0/me", base_url.trim_end_matches('/'));

    let response = client
        .get(&url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(http_error("Bangumi request failed"))?;
    let payload: Value = parse_json_response(response, "Bangumi").await?;

    let mut details = HashMap::new();
    details.insert("base_url".to_string(), base_url);
    details.insert(
        "nickname".to_string(),
        payload
            .get("nickname")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    );

    Ok(SettingsHealthCheckResponse {
        provider: "bangumi".to_string(),
        ok: true,
        message: "Bangumi API 连接正常".to_string(),
        details,
    })
}

async fn check_cloudflare_ai(
    client: &reqwest::Client,
    settings: &HashMap<String, String>,
) -> Result<SettingsHealthCheckResponse, (axum::http::StatusCode, String)> {
    let account_id = string_setting(settings, "cloudflare_account_id").ok_or((
        axum::http::StatusCode::BAD_REQUEST,
        "cloudflare_account_id is required".to_string(),
    ))?;
    let token = string_setting(settings, "cloudflare_api_token").ok_or((
        axum::http::StatusCode::BAD_REQUEST,
        "cloudflare_api_token is required".to_string(),
    ))?;
    let model = string_setting(settings, "cloudflare_ai_model")
        .unwrap_or_else(|| "@cf/meta/llama-3.1-8b-instruct".to_string());
    let base_url = string_setting(settings, "cloudflare_ai_base_url").unwrap_or_else(|| {
        format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/ai/v1",
            account_id
        )
    });
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let payload = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": "Reply with OK only." },
            { "role": "user", "content": "health check" }
        ],
        "max_tokens": 8
    });

    let response = client
        .post(&url)
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(http_error("Cloudflare AI request failed"))?;
    let payload: Value = parse_json_response(response, "Cloudflare AI").await?;
    let content = payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let mut details = HashMap::new();
    details.insert("base_url".to_string(), base_url);
    details.insert(
        "model".to_string(),
        settings
            .get("cloudflare_ai_model")
            .cloned()
            .unwrap_or_else(|| "@cf/meta/llama-3.1-8b-instruct".to_string()),
    );
    details.insert("reply".to_string(), content);

    Ok(SettingsHealthCheckResponse {
        provider: "cloudflare_ai".to_string(),
        ok: true,
        message: "Cloudflare Workers AI 连接正常".to_string(),
        details,
    })
}

fn http_error(
    prefix: &'static str,
) -> impl Fn(reqwest::Error) -> (axum::http::StatusCode, String) + Send + Sync + 'static {
    move |err| {
        (
            axum::http::StatusCode::BAD_GATEWAY,
            format!("{prefix}: {err}"),
        )
    }
}

async fn parse_json_response(
    response: reqwest::Response,
    provider: &str,
) -> Result<Value, (axum::http::StatusCode, String)> {
    let status = response.status();
    let text = response
        .text()
        .await
        .unwrap_or_else(|_| format!("{provider} returned unreadable response"));

    if status != ReqwestStatusCode::OK {
        return Err((
            axum::http::StatusCode::BAD_GATEWAY,
            format!("{provider} returned {status}: {text}"),
        ));
    }

    serde_json::from_str::<Value>(&text).map_err(|err| {
        (
            axum::http::StatusCode::BAD_GATEWAY,
            format!("{provider} returned invalid JSON: {err}"),
        )
    })
}
