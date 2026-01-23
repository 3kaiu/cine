use axum::{
    extract::State,
    response::Json,
};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::smart_cache::CacheMetrics;

/// 获取缓存性能统计信息
#[utoipa::path(
    get,
    path = "/api/cache/stats",
    tag = "cache",
    responses(
        (status = 200, description = "获取缓存统计成功", body = Vec<CacheMetrics>),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_cache_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<CacheMetrics>>, (axum::http::StatusCode, String)> {
    // 注意：这里需要将智能缓存管理器添加到AppState中
    // 暂时返回空的统计信息

    // let stats = state.smart_cache.get_all_metrics().await;
    // Ok(Json(stats))

    // 暂时返回空的数组
    Ok(Json(vec![]))
}

/// 手动触发缓存预热
#[utoipa::path(
    post,
    path = "/api/cache/warmup",
    tag = "cache",
    request_body = WarmupRequest,
    responses(
        (status = 200, description = "缓存预热任务已启动", body = serde_json::Value),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn trigger_cache_warmup(
    State(state): State<Arc<AppState>>,
    Json(req): Json<WarmupRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // 这里应该调用智能缓存管理器的预热方法
    // let task_id = state.smart_cache.warmup_cache(&req.cache_type, &state.db).await?;

    Ok(Json(serde_json::json!({
        "message": "Cache warmup started",
        "cache_type": req.cache_type,
        "task_id": "placeholder" // 实际应该是真实的task_id
    })))
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct WarmupRequest {
    pub cache_type: String,
    pub strategy: Option<String>,
}