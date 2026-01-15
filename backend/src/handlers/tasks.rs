// 任务管理 API 端点

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::services::task_queue::TaskInfo;
use crate::AppState;

/// API 响应包装
#[derive(Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn err(error: impl Into<String>) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            error: Some(error.into()),
        }
    }
}

/// 任务列表响应
#[derive(Serialize)]
pub struct TaskListResponse {
    pub tasks: Vec<TaskInfo>,
    pub total: usize,
    pub active: usize,
}

/// 任务操作响应（用于提交任务等）
#[derive(Serialize)]
pub struct TaskActionResponse {
    pub task_id: String,
    pub status: String,
    pub message: String,
}

/// 获取所有任务列表
pub async fn list_tasks(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let tasks = state.task_queue.list_tasks().await;
    let active = state.task_queue.active_count().await;
    let total = tasks.len();

    Json(ApiResponse::ok(TaskListResponse {
        tasks,
        total,
        active,
    }))
}

/// 获取单个任务详情
pub async fn get_task(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
) -> impl IntoResponse {
    match state.task_queue.get_status(&task_id).await {
        Some(info) => Json(ApiResponse::ok(info)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::<()>::err(format!("任务不存在: {}", task_id))),
        )
            .into_response(),
    }
}

/// 暂停任务
pub async fn pause_task(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
) -> impl IntoResponse {
    match state.task_queue.pause(&task_id).await {
        Ok(()) => Json(ApiResponse::ok("任务已暂停")).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

/// 恢复任务
pub async fn resume_task(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
) -> impl IntoResponse {
    match state.task_queue.resume(&task_id).await {
        Ok(()) => Json(ApiResponse::ok("任务已恢复")).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

/// 取消任务
pub async fn cancel_task(
    State(state): State<Arc<AppState>>,
    Path(task_id): Path<String>,
) -> impl IntoResponse {
    match state.task_queue.cancel(&task_id).await {
        Ok(()) => Json(ApiResponse::ok("任务已取消")).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::err(e.to_string())),
        )
            .into_response(),
    }
}

/// 清理已完成的任务
pub async fn cleanup_tasks(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    state.task_queue.cleanup_finished().await;
    Json(ApiResponse::ok("已清理完成的任务"))
}

/// 创建任务路由
pub fn task_routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_tasks))
        .route("/:id", get(get_task))
        .route("/:id/pause", post(pause_task))
        .route("/:id/resume", post(resume_task))
        .route("/:id", delete(cancel_task))
        .route("/cleanup", post(cleanup_tasks))
}
