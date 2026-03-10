// 任务管理 API 端点

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::services::task_queue::TaskInfo;
use crate::AppState;
use utoipa::{IntoParams, ToSchema};

/// API 响应包装
#[derive(Serialize, ToSchema)]
#[aliases(TaskListApiResponse = ApiResponse<TaskListResponse>, TaskInfoApiResponse = ApiResponse<TaskInfo>, StringApiResponse = ApiResponse<String>, TaskActionApiResponse = ApiResponse<TaskActionResponse>)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
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

/// 任务列表查询参数
#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct TaskListQuery {
    /// 页码，从 1 开始
    pub page: Option<u32>,
    /// 每页数量，默认 50，最大 200
    pub page_size: Option<u32>,
}

/// 任务列表响应
#[derive(Serialize, ToSchema)]
pub struct TaskListResponse {
    pub tasks: Vec<TaskInfo>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub active: usize,
}

/// 任务操作响应（用于提交任务等）
#[derive(Serialize, ToSchema)]
pub struct TaskActionResponse {
    pub task_id: String,
    pub status: String,
    pub message: String,
}

/// 获取任务列表（分页）
#[utoipa::path(
    get,
    path = "/api/tasks",
    tag = "tasks",
    params(TaskListQuery),
    responses(
        (status = 200, description = "获取任务列表成功", body = TaskListApiResponse)
    )
)]
pub async fn list_tasks(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TaskListQuery>,
) -> impl IntoResponse {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).min(200).max(1);
    let offset = ((page - 1) * page_size) as usize;
    let limit = page_size as usize;

    let (tasks, total) = state.task_queue.list_tasks(limit, offset).await;
    let active = state.task_queue.active_count().await;

    Json(ApiResponse::ok(TaskListResponse {
        tasks,
        total,
        page,
        page_size,
        active,
    }))
}

/// 获取单个任务详情
#[utoipa::path(
    get,
    path = "/api/tasks/{id}",
    tag = "tasks",
    params(
        ("id" = String, Path, description = "任务 ID")
    ),
    responses(
        (status = 200, description = "获取任务详情成功", body = TaskInfoApiResponse),
        (status = 404, description = "任务不存在")
    )
)]
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
#[utoipa::path(
    post,
    path = "/api/tasks/{id}/pause",
    tag = "tasks",
    params(
        ("id" = String, Path, description = "任务 ID")
    ),
    responses(
        (status = 200, description = "任务暂停成功", body = StringApiResponse),
        (status = 400, description = "请求失败")
    )
)]
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
#[utoipa::path(
    post,
    path = "/api/tasks/{id}/resume",
    tag = "tasks",
    params(
        ("id" = String, Path, description = "任务 ID")
    ),
    responses(
        (status = 200, description = "任务恢复成功", body = StringApiResponse),
        (status = 400, description = "请求失败")
    )
)]
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
#[utoipa::path(
    delete,
    path = "/api/tasks/{id}",
    tag = "tasks",
    params(
        ("id" = String, Path, description = "任务 ID")
    ),
    responses(
        (status = 200, description = "任务取消成功", body = StringApiResponse),
        (status = 400, description = "请求失败")
    )
)]
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
#[utoipa::path(
    post,
    path = "/api/tasks/cleanup",
    tag = "tasks",
    responses(
        (status = 200, description = "清理成功", body = StringApiResponse)
    )
)]
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
