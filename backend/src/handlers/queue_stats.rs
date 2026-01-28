use axum::{
    extract::State,
    response::{IntoResponse, Json},
};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::task_queue::QueueStats;

/// 获取队列统计信息
#[utoipa::path(
    get,
    path = "/api/queue/stats",
    tag = "queue",
    responses(
        (status = 200, description = "获取队列统计成功", body = QueueStats),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_queue_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<QueueStats>, (axum::http::StatusCode, String)> {
    let stats = state.task_queue.get_stats().await.map_err(|e| {
        tracing::error!("Failed to get queue stats: {}", e);
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("获取队列统计失败: {}", e),
        )
    })?;

    Ok(Json(stats))
}

/// 获取任务执行历史
#[utoipa::path(
    get,
    path = "/api/queue/history",
    tag = "queue",
    params(
        ("limit" = usize, Query, description = "返回记录数量限制", example = 50),
        ("offset" = usize, Query, description = "记录偏移量", example = 0)
    ),
    responses(
        (status = 200, description = "获取执行历史成功", body = Vec<crate::services::task_queue::TaskExecutionRecord>),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_execution_history(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> axum::response::Response {
    let limit = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(50);

    let offset = params
        .get("offset")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    match state.task_queue.get_execution_history(limit, offset).await {
        Ok(history) => Json(history).into_response(),
        Err(e) => {
            tracing::error!("Failed to get execution history: {}", e);
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                format!("获取执行历史失败: {}", e),
            )
                .into_response()
        }
    }
}
