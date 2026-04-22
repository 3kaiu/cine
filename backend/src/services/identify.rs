use std::collections::HashMap;

use anyhow::Context;
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use strsim::jaro_winkler;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::config::AppConfig;
use crate::models::MediaFile;
use crate::services::scraper;

const PARSE_VERSION: &str = "identify-v1";
const AUTO_THRESHOLD: f64 = 0.82;
const REVIEW_THRESHOLD: f64 = 0.55;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RuntimeSettings {
    pub tmdb_api_key: Option<String>,
    pub bgm_api_key: Option<String>,
    pub cloudflare_account_id: Option<String>,
    pub cloudflare_api_token: Option<String>,
    pub cloudflare_ai_model: String,
    pub cloudflare_ai_base_url: Option<String>,
    pub ai_mode: String,
    pub ai_budget_mode: String,
    pub ai_daily_budget: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ParsedTitle {
    pub title: String,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub is_special: bool,
    pub special_type: Option<String>,
    pub confidence: f64,
    pub parser_provider: String,
    pub ai_disabled_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct IdentifyCandidate {
    pub provider: String,
    pub external_id: String,
    pub media_type: String,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<u32>,
    pub score: f64,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct IdentifyPreview {
    pub file_id: String,
    pub file_name: String,
    pub parse: ParsedTitle,
    pub candidates: Vec<IdentifyCandidate>,
    pub recommended: Option<IdentifyCandidate>,
    pub needs_review: bool,
    pub ai_used: bool,
    pub budget_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ApplySelection {
    pub file_id: String,
    pub provider: String,
    pub external_id: String,
    pub media_type: String,
    pub lock_match: bool,
    pub download_images: bool,
    pub generate_nfo: bool,
}

pub async fn preview_files(
    db: &SqlitePool,
    client: &Client,
    config: &AppConfig,
    file_ids: &[String],
    allow_ai: bool,
) -> anyhow::Result<Vec<IdentifyPreview>> {
    let mut results = Vec::new();

    for file_id in file_ids {
        if let Some(file) =
            sqlx::query_as::<_, crate::models::MediaFile>("SELECT * FROM media_files WHERE id = ?")
                .bind(file_id)
                .fetch_optional(db)
                .await?
        {
            results.push(preview_file(db, client, config, &file, allow_ai).await?);
        }
    }

    Ok(results)
}

pub async fn apply_selections(
    db: &SqlitePool,
    client: &Client,
    config: &AppConfig,
    selections: &[ApplySelection],
) -> anyhow::Result<Vec<(String, Value)>> {
    let mut applied = Vec::new();

    for selection in selections {
        let metadata = apply_selection(db, client, config, selection).await?;
        applied.push((selection.file_id.clone(), metadata));
    }

    Ok(applied)
}

pub async fn load_runtime_settings(
    db: &SqlitePool,
    config: &AppConfig,
) -> anyhow::Result<RuntimeSettings> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as("SELECT key, value FROM settings")
        .fetch_all(db)
        .await
        .unwrap_or_default();
    let map: HashMap<String, String> = rows
        .into_iter()
        .map(|(key, value)| (key, value.unwrap_or_default()))
        .collect();

    Ok(RuntimeSettings {
        tmdb_api_key: string_setting(&map, "tmdb_api_key").or_else(|| config.tmdb_api_key.clone()),
        bgm_api_key: string_setting(&map, "bgm_api_key"),
        cloudflare_account_id: string_setting(&map, "cloudflare_account_id"),
        cloudflare_api_token: string_setting(&map, "cloudflare_api_token"),
        cloudflare_ai_model: string_setting(&map, "cloudflare_ai_model")
            .unwrap_or_else(|| "@cf/meta/llama-3.1-8b-instruct".to_string()),
        cloudflare_ai_base_url: string_setting(&map, "cloudflare_ai_base_url"),
        ai_mode: string_setting(&map, "ai_mode").unwrap_or_else(|| "assist".to_string()),
        ai_budget_mode: string_setting(&map, "ai_budget_mode")
            .unwrap_or_else(|| "strict_free".to_string()),
        ai_daily_budget: map
            .get("ai_daily_budget")
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(100),
    })
}

pub async fn preview_file(
    db: &SqlitePool,
    client: &Client,
    config: &AppConfig,
    file: &MediaFile,
    allow_ai: bool,
) -> anyhow::Result<IdentifyPreview> {
    let settings = load_runtime_settings(db, config).await?;
    let budget_ok = can_use_ai(db, &settings).await?;
    let mut parsed = parse_with_rules(file);
    let mut ai_used = false;
    let mut budget_state = if budget_ok {
        "available".to_string()
    } else {
        "strict_free_exhausted".to_string()
    };

    let mut candidates = query_candidates(client, &settings, &parsed).await?;
    let low_confidence = parsed.confidence < AUTO_THRESHOLD || candidates.is_empty();
    let ai_enabled = allow_ai && settings.ai_mode != "disabled" && budget_ok;

    if low_confidence && ai_enabled {
        if let Some(ai_parsed) = parse_with_cloudflare_ai(client, &settings, &file.name).await? {
            ai_used = true;
            record_ai_usage(db, &settings, &file.name).await?;
            parsed = ai_parsed;
            candidates = query_candidates(client, &settings, &parsed).await?;
        }
    } else if low_confidence && allow_ai && !budget_ok {
        parsed.ai_disabled_reason = Some("strict_free_budget_exhausted".to_string());
        budget_state = "degraded".to_string();
    }

    let recommended = rank_candidates(&parsed, &candidates).into_iter().next();
    let needs_review = recommended
        .as_ref()
        .map(|candidate| candidate.score < AUTO_THRESHOLD || parsed.confidence < REVIEW_THRESHOLD)
        .unwrap_or(true);

    Ok(IdentifyPreview {
        file_id: file.id.clone(),
        file_name: file.name.clone(),
        parse: parsed,
        candidates,
        recommended,
        needs_review,
        ai_used,
        budget_state,
    })
}

pub async fn apply_selection(
    db: &SqlitePool,
    client: &Client,
    config: &AppConfig,
    selection: &ApplySelection,
) -> anyhow::Result<Value> {
    let file: MediaFile = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(&selection.file_id)
        .fetch_one(db)
        .await?;
    let settings = load_runtime_settings(db, config).await?;
    let parsed = if file.detected_title.is_some()
        || file.detected_year.is_some()
        || file.detected_season.is_some()
        || file.detected_episode.is_some()
    {
        ParsedTitle {
            title: file.detected_title.clone().unwrap_or_default(),
            year: file.detected_year.map(|value| value as u32),
            season: file.detected_season.map(|value| value as u32),
            episode: file.detected_episode.map(|value| value as u32),
            is_special: false,
            special_type: None,
            confidence: file.confidence_score.unwrap_or(0.0),
            parser_provider: file
                .parser_provider
                .clone()
                .unwrap_or_else(|| "stored".to_string()),
            ai_disabled_reason: file.ai_disabled_reason.clone(),
        }
    } else {
        parse_with_rules(&file)
    };
    let mut details = fetch_provider_details(
        client,
        &settings,
        &selection.provider,
        &selection.external_id,
        &selection.media_type,
    )
    .await?;
    merge_detected_context(&mut details, &parsed);
    if selection.provider == "tmdb" && selection.media_type == "tv" {
        let _ = enrich_tmdb_tv_metadata(
            client,
            settings.tmdb_api_key.as_deref().unwrap_or_default(),
            &selection.external_id,
            &mut details,
        )
        .await;
    }

    let tmdb_id = if selection.provider == "tmdb" {
        selection.external_id.parse::<u32>().ok()
    } else {
        None
    };

    let metadata_json = serde_json::to_string(&details).unwrap_or_default();
    sqlx::query(
        "UPDATE media_files
         SET metadata = ?, tmdb_id = ?, detected_title = ?, detected_year = ?, detected_season = ?, detected_episode = ?,
             parser_provider = COALESCE(parser_provider, ?), parse_version = ?, confidence_score = ?, review_state = ?,
             match_provider = ?, match_external_id = ?, locked_match_provider = ?, locked_match_external_id = ?, ai_disabled_reason = NULL, updated_at = ?
         WHERE id = ?",
    )
    .bind(metadata_json)
    .bind(tmdb_id)
    .bind(details.get("title").and_then(Value::as_str).or_else(|| details.get("name").and_then(Value::as_str)))
    .bind(details.get("year").and_then(Value::as_i64).map(|v| v as i32))
    .bind(details.get("season_number").and_then(Value::as_i64).map(|v| v as i32))
    .bind(details.get("episode_number").and_then(Value::as_i64).map(|v| v as i32))
    .bind("manual_apply")
    .bind(PARSE_VERSION)
    .bind(1.0_f64)
    .bind("applied")
    .bind(&selection.provider)
    .bind(&selection.external_id)
    .bind(selection.lock_match.then_some(selection.provider.as_str()))
    .bind(selection.lock_match.then_some(selection.external_id.as_str()))
    .bind(Utc::now())
    .bind(&selection.file_id)
    .execute(db)
    .await?;

    if selection.download_images {
        let poster_url = details.get("poster_url").and_then(Value::as_str);
        let backdrop_url = details.get("backdrop_url").and_then(Value::as_str);
        let _ =
            crate::services::poster::download_media_images(&file.path, poster_url, backdrop_url)
                .await;
    }

    if selection.generate_nfo {
        let media_type = if selection.media_type == "tv" {
            "tvshow"
        } else {
            "movie"
        };
        let _ = crate::services::nfo::generate_nfo_file(&file.path, &details, media_type).await;
    }

    Ok(details)
}

fn parse_with_rules(file: &MediaFile) -> ParsedTitle {
    let (title, year, season, episode) = scraper::parse_filename(&file.name);
    let name_lower = file.name.to_ascii_lowercase();
    let special_type = if name_lower.contains("ova") {
        Some("ova".to_string())
    } else if name_lower.contains("special") || name_lower.contains(".sp") {
        Some("special".to_string())
    } else {
        None
    };
    let confidence = if !title.is_empty() {
        if season.is_some() || episode.is_some() {
            0.78
        } else {
            0.88
        }
    } else {
        0.2
    };

    ParsedTitle {
        title,
        year,
        season,
        episode,
        is_special: special_type.is_some(),
        special_type,
        confidence,
        parser_provider: "rules".to_string(),
        ai_disabled_reason: None,
    }
}

async fn query_candidates(
    client: &Client,
    settings: &RuntimeSettings,
    parsed: &ParsedTitle,
) -> anyhow::Result<Vec<IdentifyCandidate>> {
    if parsed.title.trim().is_empty() {
        return Ok(Vec::new());
    }

    let is_tv = parsed.season.is_some() || parsed.episode.is_some();
    let mut candidates = Vec::new();

    if let Some(api_key) = settings.tmdb_api_key.as_deref() {
        let tmdb_candidates = if is_tv {
            scraper::search_tv_tmdb(client, &parsed.title, parsed.year, api_key)
                .await?
                .into_iter()
                .map(|show| IdentifyCandidate {
                    provider: "tmdb".to_string(),
                    external_id: show.tmdb_id.unwrap_or_default().to_string(),
                    media_type: "tv".to_string(),
                    title: show.name.clone(),
                    original_title: show.original_name.clone(),
                    year: show
                        .first_air_date
                        .as_deref()
                        .and_then(|s| s.split('-').next())
                        .and_then(|s| s.parse::<u32>().ok()),
                    score: 0.0,
                    overview: show.overview.clone(),
                    poster_url: show.poster_url.clone(),
                    backdrop_url: show.backdrop_url.clone(),
                    metadata: serde_json::to_value(show).unwrap_or_default(),
                })
                .collect::<Vec<_>>()
        } else {
            scraper::search_movie_tmdb(client, &parsed.title, parsed.year, api_key)
                .await?
                .into_iter()
                .map(|movie| IdentifyCandidate {
                    provider: "tmdb".to_string(),
                    external_id: movie.tmdb_id.unwrap_or_default().to_string(),
                    media_type: "movie".to_string(),
                    title: movie.title.clone(),
                    original_title: movie.original_title.clone(),
                    year: movie.year,
                    score: 0.0,
                    overview: movie.overview.clone(),
                    poster_url: movie.poster_url.clone(),
                    backdrop_url: movie.backdrop_url.clone(),
                    metadata: serde_json::to_value(movie).unwrap_or_default(),
                })
                .collect::<Vec<_>>()
        };
        candidates.extend(tmdb_candidates);
    }

    candidates.extend(search_bangumi(client, settings, parsed, is_tv).await?);
    Ok(rank_candidates(parsed, &candidates))
}

fn rank_candidates(
    parsed: &ParsedTitle,
    candidates: &[IdentifyCandidate],
) -> Vec<IdentifyCandidate> {
    let mut ranked = candidates.to_vec();
    let normalized_query = normalize_title(&parsed.title);
    for candidate in &mut ranked {
        let title_score = jaro_winkler(&normalized_query, &normalize_title(&candidate.title));
        let alt_score = candidate
            .original_title
            .as_deref()
            .map(|value| jaro_winkler(&normalized_query, &normalize_title(value)))
            .unwrap_or(0.0);
        let best = title_score.max(alt_score);
        let year_bonus = match (parsed.year, candidate.year) {
            (Some(lhs), Some(rhs)) if lhs == rhs => 0.12,
            (Some(_), Some(_)) => -0.05,
            _ => 0.0,
        };
        candidate.score = (best + year_bonus).clamp(0.0, 1.0);
    }
    ranked.sort_by(|lhs, rhs| rhs.score.total_cmp(&lhs.score));
    ranked
}

async fn search_bangumi(
    client: &Client,
    settings: &RuntimeSettings,
    parsed: &ParsedTitle,
    is_tv: bool,
) -> anyhow::Result<Vec<IdentifyCandidate>> {
    let query = urlencoding::encode(&parsed.title);
    let mut request = client
        .get(format!(
            "{}/search/subject/{}?type={}",
            scraper::bangumi_api_base_url(),
            query,
            if is_tv { 2 } else { 1 }
        ))
        .header("User-Agent", "cine/1.2");
    if let Some(token) = settings.bgm_api_key.as_deref() {
        request = request.bearer_auth(token);
    }
    let payload: Value = request.send().await?.json().await?;
    let items = payload
        .get("list")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Ok(items
        .into_iter()
        .take(8)
        .map(|item| IdentifyCandidate {
            provider: "bgm".to_string(),
            external_id: item
                .get("id")
                .and_then(Value::as_i64)
                .unwrap_or_default()
                .to_string(),
            media_type: if is_tv {
                "tv".to_string()
            } else {
                "movie".to_string()
            },
            title: item
                .get("name_cn")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .or_else(|| item.get("name").and_then(Value::as_str))
                .unwrap_or("Unknown")
                .to_string(),
            original_title: item.get("name").and_then(Value::as_str).map(str::to_string),
            year: item
                .get("date")
                .and_then(Value::as_str)
                .and_then(|value| value.split('-').next())
                .and_then(|value| value.parse::<u32>().ok()),
            score: 0.0,
            overview: item
                .get("summary")
                .and_then(Value::as_str)
                .map(str::to_string),
            poster_url: item
                .get("images")
                .and_then(|images| images.get("large"))
                .and_then(Value::as_str)
                .map(str::to_string),
            backdrop_url: None,
            metadata: item,
        })
        .collect())
}

async fn parse_with_cloudflare_ai(
    client: &Client,
    settings: &RuntimeSettings,
    filename: &str,
) -> anyhow::Result<Option<ParsedTitle>> {
    if settings.ai_mode == "disabled" {
        return Ok(None);
    }
    let account_id = match settings.cloudflare_account_id.as_deref() {
        Some(value) if !value.is_empty() => value,
        _ => return Ok(None),
    };
    let token = match settings.cloudflare_api_token.as_deref() {
        Some(value) if !value.is_empty() => value,
        _ => return Ok(None),
    };
    let base = settings.cloudflare_ai_base_url.clone().unwrap_or_else(|| {
        format!("https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1")
    });
    let payload = json!({
        "model": settings.cloudflare_ai_model,
        "response_format": { "type": "json_object" },
        "messages": [
            {
                "role": "system",
                "content": "Extract a JSON object with title, year, season, episode, is_special, special_type, confidence. Use only information present in the filename. Return JSON only."
            },
            { "role": "user", "content": filename }
        ]
    });
    let response: Value = client
        .post(format!("{base}/chat/completions"))
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await?
        .json()
        .await
        .context("failed to parse Cloudflare AI response")?;
    let content = response
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str);

    let Some(content) = content else {
        return Ok(None);
    };
    let data: Value = serde_json::from_str(content.trim()).unwrap_or_default();
    let title = data
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if title.is_empty() {
        return Ok(None);
    }

    Ok(Some(ParsedTitle {
        title,
        year: data
            .get("year")
            .and_then(Value::as_u64)
            .map(|value| value as u32),
        season: data
            .get("season")
            .and_then(Value::as_u64)
            .map(|value| value as u32),
        episode: data
            .get("episode")
            .and_then(Value::as_u64)
            .map(|value| value as u32),
        is_special: data
            .get("is_special")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        special_type: data
            .get("special_type")
            .and_then(Value::as_str)
            .map(str::to_string),
        confidence: data
            .get("confidence")
            .and_then(Value::as_f64)
            .unwrap_or(0.72),
        parser_provider: "cloudflare_ai".to_string(),
        ai_disabled_reason: None,
    }))
}

async fn can_use_ai(db: &SqlitePool, settings: &RuntimeSettings) -> anyhow::Result<bool> {
    if settings.ai_budget_mode != "strict_free" {
        return Ok(true);
    }
    let today = Utc::now().date_naive().to_string();
    let used: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ai_usage_logs WHERE provider = 'cloudflare' AND date(created_at) = date(?)",
    )
    .bind(today)
    .fetch_one(db)
    .await
    .unwrap_or(0);
    Ok((used as usize) < settings.ai_daily_budget)
}

async fn record_ai_usage(
    db: &SqlitePool,
    settings: &RuntimeSettings,
    request_key: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO ai_usage_logs (id, provider, model, request_key, created_at) VALUES (?, 'cloudflare', ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&settings.cloudflare_ai_model)
    .bind(request_key)
    .bind(Utc::now())
    .execute(db)
    .await?;
    Ok(())
}

async fn fetch_provider_details(
    client: &Client,
    settings: &RuntimeSettings,
    provider: &str,
    external_id: &str,
    media_type: &str,
) -> anyhow::Result<Value> {
    match provider {
        "tmdb" => fetch_tmdb_details(client, settings, external_id, media_type).await,
        "bgm" => fetch_bangumi_details(client, settings, external_id, media_type).await,
        _ => Err(anyhow::anyhow!("unsupported provider: {provider}")),
    }
}

async fn fetch_tmdb_details(
    client: &Client,
    settings: &RuntimeSettings,
    external_id: &str,
    media_type: &str,
) -> anyhow::Result<Value> {
    let api_key = settings
        .tmdb_api_key
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("TMDB API key not configured"))?;
    let endpoint = if media_type == "tv" { "tv" } else { "movie" };
    let url = format!(
        "{}/{endpoint}/{external_id}?api_key={api_key}&language=zh-CN",
        scraper::tmdb_api_base_url()
    );
    let payload: Value = client.get(url).send().await?.json().await?;
    Ok(tmdb_details_from_payload(&payload, media_type))
}

async fn fetch_bangumi_details(
    client: &Client,
    settings: &RuntimeSettings,
    external_id: &str,
    media_type: &str,
) -> anyhow::Result<Value> {
    let mut request = client
        .get(format!(
            "{}/v0/subjects/{external_id}",
            scraper::bangumi_api_base_url()
        ))
        .header("User-Agent", "cine/1.2");
    if let Some(token) = settings.bgm_api_key.as_deref() {
        request = request.bearer_auth(token);
    }
    let payload: Value = request.send().await?.json().await?;
    Ok(bangumi_details_from_payload(&payload, media_type))
}

async fn enrich_tmdb_tv_metadata(
    client: &Client,
    api_key: &str,
    external_id: &str,
    metadata: &mut Value,
) -> anyhow::Result<()> {
    let Some(tmdb_id) = metadata.get("tmdb_id").and_then(Value::as_u64) else {
        return Ok(());
    };

    let season_number = metadata.get("season_number").and_then(Value::as_u64);
    let episode_number = metadata.get("episode_number").and_then(Value::as_u64);

    if season_number.is_none() || episode_number.is_none() {
        let seasons = client
            .get(format!(
                "{}/tv/{tmdb_id}?api_key={api_key}&append_to_response=season/1",
                scraper::tmdb_api_base_url()
            ))
            .send()
            .await?;
        let seasons_payload: Value = seasons.json().await.unwrap_or_default();
        if let Some(object) = metadata.as_object_mut() {
            object.insert(
                "season_count".to_string(),
                seasons_payload
                    .get("number_of_seasons")
                    .cloned()
                    .unwrap_or(Value::Null),
            );
            object.insert(
                "episode_count".to_string(),
                seasons_payload
                    .get("number_of_episodes")
                    .cloned()
                    .unwrap_or(Value::Null),
            );
        }
        return Ok(());
    }

    let season_number = season_number.unwrap();
    let episode_number = episode_number.unwrap();
    let episode_url = format!(
        "{}/tv/{external_id}/season/{season_number}/episode/{episode_number}?api_key={api_key}&language=zh-CN",
        scraper::tmdb_api_base_url()
    );
    let episode_payload: Value = client.get(episode_url).send().await?.json().await?;

    if let Some(object) = metadata.as_object_mut() {
        object.insert("season_number".to_string(), json!(season_number));
        object.insert("episode_number".to_string(), json!(episode_number));
        object.insert(
            "episode_title".to_string(),
            episode_payload.get("name").cloned().unwrap_or(Value::Null),
        );
        object.insert(
            "episode_overview".to_string(),
            episode_payload
                .get("overview")
                .cloned()
                .unwrap_or(Value::Null),
        );
        object.insert(
            "episode_air_date".to_string(),
            episode_payload
                .get("air_date")
                .cloned()
                .unwrap_or(Value::Null),
        );
        object.insert(
            "episode_still_url".to_string(),
            episode_payload
                .get("still_path")
                .and_then(Value::as_str)
                .map(|path| Value::String(format!("https://image.tmdb.org/t/p/w780{path}")))
                .unwrap_or(Value::Null),
        );
        object.insert(
            "season_name".to_string(),
            episode_payload
                .get("season_number")
                .map(|_| Value::String(format!("Season {}", season_number)))
                .unwrap_or(Value::Null),
        );
    }

    Ok(())
}

fn string_setting(map: &HashMap<String, String>, key: &str) -> Option<String> {
    map.get(key)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn merge_detected_context(details: &mut Value, parsed: &ParsedTitle) {
    if let Some(object) = details.as_object_mut() {
        if parsed.year.is_some() && object.get("year").is_none() {
            object.insert("year".to_string(), json!(parsed.year));
        }
        if parsed.season.is_some() {
            object.insert("season_number".to_string(), json!(parsed.season));
        }
        if parsed.episode.is_some() {
            object.insert("episode_number".to_string(), json!(parsed.episode));
        }
        if parsed.is_special {
            object.insert("is_special".to_string(), json!(true));
        }
        if parsed.special_type.is_some() {
            object.insert("special_type".to_string(), json!(parsed.special_type));
        }
    }
}

fn normalize_title(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

fn tmdb_details_from_payload(payload: &Value, media_type: &str) -> Value {
    let year = payload
        .get("release_date")
        .or_else(|| payload.get("first_air_date"))
        .and_then(Value::as_str)
        .and_then(|value| value.split('-').next())
        .and_then(|value| value.parse::<u32>().ok());

    json!({
        "provider": "tmdb",
        "tmdb_id": payload.get("id").and_then(Value::as_u64),
        "title": payload.get("title").or_else(|| payload.get("name")).and_then(Value::as_str),
        "original_title": payload.get("original_title").or_else(|| payload.get("original_name")).and_then(Value::as_str),
        "overview": payload.get("overview").and_then(Value::as_str),
        "poster_url": payload.get("poster_path").and_then(Value::as_str).map(|path| format!("https://image.tmdb.org/t/p/w500{path}")),
        "backdrop_url": payload.get("backdrop_path").and_then(Value::as_str).map(|path| format!("https://image.tmdb.org/t/p/w1280{path}")),
        "rating": payload.get("vote_average").and_then(Value::as_f64),
        "release_date": payload.get("release_date").or_else(|| payload.get("first_air_date")).and_then(Value::as_str),
        "year": year,
        "media_type": media_type,
    })
}

fn bangumi_details_from_payload(payload: &Value, media_type: &str) -> Value {
    let year = payload
        .get("date")
        .and_then(Value::as_str)
        .and_then(|value| value.split('-').next())
        .and_then(|value| value.parse::<u32>().ok());

    json!({
        "provider": "bgm",
        "bgm_id": payload.get("id").and_then(Value::as_i64),
        "title": payload.get("name_cn").or_else(|| payload.get("name")).and_then(Value::as_str),
        "original_title": payload.get("name").and_then(Value::as_str),
        "overview": payload.get("summary").and_then(Value::as_str),
        "poster_url": payload.get("images").and_then(|images| images.get("large")).and_then(Value::as_str),
        "backdrop_url": Value::Null,
        "rating": payload.get("rating").and_then(|rating| rating.get("score")).and_then(Value::as_f64),
        "release_date": payload.get("date").and_then(Value::as_str),
        "year": year,
        "media_type": media_type,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        bangumi_details_from_payload, merge_detected_context, normalize_title, parse_with_rules,
        rank_candidates, tmdb_details_from_payload, IdentifyCandidate, ParsedTitle, AUTO_THRESHOLD,
    };
    use crate::models::MediaFile;
    use chrono::Utc;
    use serde_json::json;

    fn make_file(name: &str) -> MediaFile {
        MediaFile {
            id: "file-1".to_string(),
            path: format!("/library/{name}"),
            name: name.to_string(),
            size: 1024,
            file_type: "video".to_string(),
            hash_xxhash: None,
            hash_md5: None,
            tmdb_id: None,
            quality_score: None,
            video_info: None,
            metadata: None,
            detected_title: None,
            detected_year: None,
            detected_season: None,
            detected_episode: None,
            parser_provider: None,
            parse_version: None,
            confidence_score: None,
            review_state: None,
            match_provider: None,
            match_external_id: None,
            locked_match_provider: None,
            locked_match_external_id: None,
            ai_disabled_reason: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_modified: Utc::now(),
        }
    }

    #[test]
    fn normalize_title_removes_noise() {
        assert_eq!(
            normalize_title("Dungeon.Meshi [1080p]"),
            "dungeonmeshi1080p"
        );
    }

    #[test]
    fn parse_with_rules_marks_episode_for_review_bias() {
        let parsed = parse_with_rules(&make_file("The.Last.of.Us.S01E03.2160p.mkv"));

        assert_eq!(parsed.season, Some(1));
        assert_eq!(parsed.episode, Some(3));
        assert_eq!(parsed.parser_provider, "rules");
        assert!(parsed.confidence < AUTO_THRESHOLD);
    }

    #[test]
    fn parse_with_rules_marks_specials() {
        let parsed = parse_with_rules(&make_file("Frieren.Special.E01.mkv"));

        assert!(parsed.is_special);
        assert_eq!(parsed.special_type.as_deref(), Some("special"));
    }

    #[test]
    fn ranking_prefers_exact_title_and_year() {
        let parsed = ParsedTitle {
            title: "Dungeon Meshi".to_string(),
            year: Some(2024),
            season: Some(1),
            episode: Some(1),
            is_special: false,
            special_type: None,
            confidence: 0.8,
            parser_provider: "rules".to_string(),
            ai_disabled_reason: None,
        };

        let ranked = rank_candidates(
            &parsed,
            &[
                IdentifyCandidate {
                    provider: "tmdb".to_string(),
                    external_id: "1".to_string(),
                    media_type: "tv".to_string(),
                    title: "Dungeon Meshi".to_string(),
                    original_title: Some("Delicious in Dungeon".to_string()),
                    year: Some(2024),
                    score: 0.0,
                    overview: None,
                    poster_url: None,
                    backdrop_url: None,
                    metadata: json!({}),
                },
                IdentifyCandidate {
                    provider: "tmdb".to_string(),
                    external_id: "2".to_string(),
                    media_type: "tv".to_string(),
                    title: "Some Other Show".to_string(),
                    original_title: None,
                    year: Some(2023),
                    score: 0.0,
                    overview: None,
                    poster_url: None,
                    backdrop_url: None,
                    metadata: json!({}),
                },
            ],
        );

        assert_eq!(ranked[0].external_id, "1");
        assert!(ranked[0].score > ranked[1].score);
    }

    #[test]
    fn tmdb_details_payload_maps_movie_fields() {
        let metadata = tmdb_details_from_payload(
            &json!({
                "id": 438631,
                "title": "Dune",
                "original_title": "Dune",
                "overview": "Paul Atreides begins his journey.",
                "poster_path": "/dune.jpg",
                "backdrop_path": "/dune-bg.jpg",
                "vote_average": 8.2,
                "release_date": "2021-10-22"
            }),
            "movie",
        );

        assert_eq!(metadata["provider"], "tmdb");
        assert_eq!(metadata["tmdb_id"], 438631);
        assert_eq!(metadata["title"], "Dune");
        assert_eq!(metadata["year"], 2021);
        assert_eq!(metadata["media_type"], "movie");
    }

    #[test]
    fn bangumi_details_payload_prefers_name_cn() {
        let metadata = bangumi_details_from_payload(
            &json!({
                "id": 123,
                "name": "Sousou no Frieren",
                "name_cn": "葬送的芙莉莲",
                "summary": "A long journey after the demon king.",
                "date": "2023-09-29",
                "images": {
                    "large": "https://bgm.test/frieren.jpg"
                },
                "rating": {
                    "score": 8.9
                }
            }),
            "tv",
        );

        assert_eq!(metadata["provider"], "bgm");
        assert_eq!(metadata["bgm_id"], 123);
        assert_eq!(metadata["title"], "葬送的芙莉莲");
        assert_eq!(metadata["original_title"], "Sousou no Frieren");
        assert_eq!(metadata["year"], 2023);
    }

    #[test]
    fn merge_detected_context_enriches_episode_metadata() {
        let mut metadata = json!({
            "title": "Frieren"
        });
        let parsed = ParsedTitle {
            title: "Frieren".to_string(),
            year: Some(2023),
            season: Some(1),
            episode: Some(3),
            is_special: true,
            special_type: Some("special".to_string()),
            confidence: 0.78,
            parser_provider: "rules".to_string(),
            ai_disabled_reason: None,
        };

        merge_detected_context(&mut metadata, &parsed);

        assert_eq!(metadata["year"], 2023);
        assert_eq!(metadata["season_number"], 1);
        assert_eq!(metadata["episode_number"], 3);
        assert_eq!(metadata["is_special"], true);
        assert_eq!(metadata["special_type"], "special");
    }
}
