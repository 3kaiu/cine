use std::sync::Arc;

use axum::{extract::State, response::Json};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::handlers::AppState;
use crate::services::identify::{self, ApplySelection, IdentifyPreview};

#[derive(Debug, Deserialize, ToSchema)]
pub struct IdentifyPreviewRequest {
    pub file_id: Option<String>,
    pub file_ids: Option<Vec<String>>,
    pub allow_ai: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct IdentifyPreviewResponse {
    pub results: Vec<IdentifyPreview>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct IdentifyApplyItem {
    pub file_id: String,
    pub provider: String,
    pub external_id: String,
    pub media_type: String,
    pub lock_match: Option<bool>,
    pub download_images: Option<bool>,
    pub generate_nfo: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct IdentifyApplyRequest {
    pub selections: Vec<IdentifyApplyItem>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct IdentifyApplyResult {
    pub file_id: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct IdentifyApplyResponse {
    pub applied: Vec<IdentifyApplyResult>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct IdentifyTaskResponse {
    pub task_id: String,
    pub status: String,
    pub message: String,
}

#[utoipa::path(
    post,
    path = "/api/identify/preview",
    tag = "identify",
    request_body = IdentifyPreviewRequest,
    responses(
        (status = 200, description = "识别预览成功", body = IdentifyPreviewResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn preview_identify(
    State(state): State<Arc<AppState>>,
    Json(req): Json<IdentifyPreviewRequest>,
) -> Result<Json<IdentifyPreviewResponse>, (axum::http::StatusCode, String)> {
    let allow_ai = req.allow_ai.unwrap_or(true);
    let mut file_ids = req.file_ids.unwrap_or_default();
    if let Some(file_id) = req.file_id {
        file_ids.push(file_id);
    }
    let results = identify::preview_files(
        &state.db,
        &state.http_client,
        &state.config,
        &file_ids,
        allow_ai,
    )
    .await
    .map_err(internal_error)?;

    Ok(Json(IdentifyPreviewResponse { results }))
}

#[utoipa::path(
    post,
    path = "/api/identify/apply",
    tag = "identify",
    request_body = IdentifyApplyRequest,
    responses(
        (status = 200, description = "应用识别结果成功", body = IdentifyApplyResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn apply_identify(
    State(state): State<Arc<AppState>>,
    Json(req): Json<IdentifyApplyRequest>,
) -> Result<Json<IdentifyApplyResponse>, (axum::http::StatusCode, String)> {
    let selections = req
        .selections
        .into_iter()
        .map(|item| ApplySelection {
            file_id: item.file_id,
            provider: item.provider,
            external_id: item.external_id,
            media_type: item.media_type,
            lock_match: item.lock_match.unwrap_or(false),
            download_images: item.download_images.unwrap_or(false),
            generate_nfo: item.generate_nfo.unwrap_or(false),
        })
        .collect::<Vec<_>>();
    let applied =
        identify::apply_selections(&state.db, &state.http_client, &state.config, &selections)
            .await
            .map_err(internal_error)?
            .into_iter()
            .map(|(file_id, metadata)| IdentifyApplyResult { file_id, metadata })
            .collect();

    Ok(Json(IdentifyApplyResponse { applied }))
}

#[utoipa::path(
    post,
    path = "/api/identify/preview/batch",
    tag = "identify",
    request_body = IdentifyPreviewRequest,
    responses(
        (status = 200, description = "批量识别预览任务已提交", body = IdentifyTaskResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn preview_identify_batch(
    State(state): State<Arc<AppState>>,
    Json(req): Json<IdentifyPreviewRequest>,
) -> Result<Json<IdentifyTaskResponse>, (axum::http::StatusCode, String)> {
    let mut file_ids = req.file_ids.unwrap_or_default();
    if let Some(file_id) = req.file_id {
        file_ids.push(file_id);
    }

    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Scrape,
            Some(format!("批量识别预览 {} 个文件", file_ids.len())),
            serde_json::json!({
                "operation": "identify_preview",
                "file_ids": file_ids,
                "allow_ai": req.allow_ai.unwrap_or(true)
            }),
        )
        .await
        .map_err(internal_error)?;

    Ok(Json(IdentifyTaskResponse {
        task_id,
        status: "submitted".to_string(),
        message: "Identify preview task created".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/identify/apply/batch",
    tag = "identify",
    request_body = IdentifyApplyRequest,
    responses(
        (status = 200, description = "批量应用识别任务已提交", body = IdentifyTaskResponse),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn apply_identify_batch(
    State(state): State<Arc<AppState>>,
    Json(req): Json<IdentifyApplyRequest>,
) -> Result<Json<IdentifyTaskResponse>, (axum::http::StatusCode, String)> {
    let count = req.selections.len();
    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Scrape,
            Some(format!("批量应用识别结果 {} 项", count)),
            serde_json::json!({
                "operation": "identify_apply",
                "selections": req.selections
            }),
        )
        .await
        .map_err(internal_error)?;

    Ok(Json(IdentifyTaskResponse {
        task_id,
        status: "submitted".to_string(),
        message: "Identify apply task created".to_string(),
    }))
}

fn internal_error<E: std::fmt::Display>(err: E) -> (axum::http::StatusCode, String) {
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        err.to_string(),
    )
}
