//! 统一错误类型定义

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// 应用错误类型
///
/// 统一的错误类型，自动转换为 HTTP 响应。
/// 所有变量均为公开 API 的一部分，用于不同场景的错误处理。
#[derive(Debug, Error)]
pub enum AppError {
    /// 数据库错误
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    /// 文件 I/O 错误
    #[error("File I/O error: {0}")]
    FileIo(#[from] std::io::Error),

    /// 网络请求错误
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    /// JSON 序列化/反序列化错误
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// 文件未找到
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// 目录未找到
    #[error("Directory not found: {0}")]
    #[allow(dead_code)]
    DirectoryNotFound(String),

    /// 配置错误
    #[error("Configuration error: {0}")]
    #[allow(dead_code)]
    Config(String),

    /// 验证错误
    #[error("Validation error: {0}")]
    #[allow(dead_code)]
    Validation(String),

    /// 业务逻辑错误
    #[error("Business error: {0}")]
    #[allow(dead_code)]
    Business(String),

    /// 未授权
    #[error("Unauthorized: {0}")]
    #[allow(dead_code)]
    Unauthorized(String),

    /// 内部服务器错误
    #[error("Internal server error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Database(e) => {
                tracing::error!("Database error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "数据库操作失败".to_string(),
                )
            }
            AppError::FileIo(e) => {
                tracing::error!("File I/O error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("文件操作失败: {}", e),
                )
            }
            AppError::Network(e) => {
                tracing::error!("Network error: {}", e);
                (StatusCode::BAD_GATEWAY, "网络请求失败".to_string())
            }
            AppError::Json(e) => {
                tracing::error!("JSON error: {}", e);
                (StatusCode::BAD_REQUEST, "数据格式错误".to_string())
            }
            AppError::FileNotFound(path) => {
                (StatusCode::NOT_FOUND, format!("文件未找到: {}", path))
            }
            AppError::DirectoryNotFound(path) => {
                (StatusCode::NOT_FOUND, format!("目录未找到: {}", path))
            }
            AppError::Config(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("配置错误: {}", msg),
            ),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, format!("验证失败: {}", msg)),
            AppError::Business(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, format!("未授权: {}", msg)),
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "内部服务器错误".to_string(),
                )
            }
        };

        let body = Json(json!({
            "error": error_message,
            "code": status.as_u16(),
        }));

        (status, body).into_response()
    }
}

/// Result 类型别名
pub type AppResult<T> = Result<T, AppError>;
