//! 统一错误类型定义
//!
//! 提供分层的错误处理系统，支持：
//! - 结构化错误信息
//! - 错误恢复机制
//! - 上下文信息追踪
//! - 国际化错误消息

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use thiserror::Error;
use tracing::{error, warn};

/// 错误恢复策略
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryStrategy {
    /// 重试操作
    Retry { max_attempts: u32, backoff_ms: u64 },
    /// 使用备用方案
    Fallback { alternative: String },
    /// 用户手动干预
    ManualIntervention { instructions: String },
    /// 不可恢复
    Irrecoverable,
}

/// 错误上下文信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorContext {
    pub operation: String,
    pub resource: Option<String>,
    pub user_id: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// 结构化错误响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
    pub user_message: String,
    pub details: Option<serde_json::Value>,
    pub recovery_strategy: Option<RecoveryStrategy>,
    pub context: Option<ErrorContext>,
}

/// 应用错误类型
///
/// 统一的错误类型，包含：
/// - 结构化错误信息
/// - 错误分类和代码
/// - 恢复策略建议
/// - 上下文信息追踪
#[derive(Debug, Error)]
pub enum AppError {
    // ===== 数据库错误 =====
    /// 数据库连接错误
    #[error("Database connection failed: {source}")]
    DatabaseConnection {
        source: sqlx::Error,
        context: ErrorContext,
    },

    /// 数据库查询错误
    #[error("Database query failed: {source}")]
    DatabaseQuery {
        source: sqlx::Error,
        query: String,
        context: ErrorContext,
    },

    /// 数据完整性错误
    #[error("Data integrity violation: {details}")]
    DataIntegrity {
        details: String,
        context: ErrorContext,
    },

    // ===== 文件系统错误 =====
    /// 文件未找到
    #[error("File not found: {path}")]
    FileNotFound { path: String, context: ErrorContext },

    /// 文件权限错误
    #[error("File permission denied: {path}")]
    FilePermission {
        path: String,
        operation: String,
        context: ErrorContext,
    },

    /// 文件系统 I/O 错误
    #[error("File I/O error: {source}")]
    FileIo {
        source: std::io::Error,
        path: Option<String>,
        context: ErrorContext,
    },

    // ===== 网络错误 =====
    /// TMDB API 错误
    #[error("TMDB API error: {status_code} - {message}")]
    TmdbApi {
        status_code: u16,
        message: String,
        retry_after: Option<u64>,
        context: ErrorContext,
    },

    /// 网络超时
    #[error("Network timeout: {operation}")]
    NetworkTimeout {
        operation: String,
        timeout_ms: u64,
        context: ErrorContext,
    },

    /// 网络请求错误
    #[error("Network error: {source}")]
    Network {
        source: reqwest::Error,
        url: Option<String>,
        context: ErrorContext,
    },

    // ===== 验证错误 =====
    /// 输入验证失败
    #[error("Validation failed: {field} - {reason}")]
    Validation {
        field: String,
        reason: String,
        value: Option<String>,
        context: ErrorContext,
    },

    /// 文件格式不支持
    #[error("Unsupported file format: {format}")]
    UnsupportedFormat {
        format: String,
        supported_formats: Vec<String>,
        context: ErrorContext,
    },

    // ===== 业务逻辑错误 =====
    /// 任务已存在
    #[error("Task already exists: {task_id}")]
    TaskExists {
        task_id: String,
        context: ErrorContext,
    },

    /// 资源配额不足
    #[error("Resource quota exceeded: {resource} - {current}/{limit}")]
    QuotaExceeded {
        resource: String,
        current: u64,
        limit: u64,
        context: ErrorContext,
    },

    /// 操作被取消
    #[error("Operation cancelled: {operation}")]
    OperationCancelled {
        operation: String,
        reason: Option<String>,
        context: ErrorContext,
    },

    // ===== 配置错误 =====
    /// 配置无效
    #[error("Invalid configuration: {key} - {reason}")]
    ConfigInvalid {
        key: String,
        reason: String,
        context: ErrorContext,
    },

    // ===== 系统错误 =====
    /// 系统资源不足
    #[error("System resource exhausted: {resource}")]
    SystemResource {
        resource: String,
        available: u64,
        required: u64,
        context: ErrorContext,
    },

    /// 内部错误
    #[error("Internal error: {message}")]
    Internal {
        message: String,
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
        context: ErrorContext,
    },
}

impl AppError {
    /// 创建错误响应
    pub fn to_error_response(&self) -> ErrorResponse {
        match self {
            // 数据库错误
            AppError::DatabaseConnection { source, context } => {
                error!(
                    "Database connection failed: {} - Context: {:?}",
                    source, context
                );
                ErrorResponse {
                    code: "DATABASE_CONNECTION_ERROR".to_string(),
                    message: format!("Database connection failed: {}", source),
                    user_message: "数据库连接失败，请稍后重试".to_string(),
                    details: Some(json!({
                        "sql_state": source.to_string()
                    })),
                    recovery_strategy: Some(RecoveryStrategy::Retry {
                        max_attempts: 3,
                        backoff_ms: 1000,
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::DatabaseQuery {
                source,
                query,
                context,
            } => {
                error!(
                    "Database query failed: {} - Query: {} - Context: {:?}",
                    source, query, context
                );
                ErrorResponse {
                    code: "DATABASE_QUERY_ERROR".to_string(),
                    message: format!("Database query failed: {}", source),
                    user_message: "数据查询失败，请稍后重试".to_string(),
                    details: Some(json!({
                        "query": query,
                        "sql_state": source.to_string()
                    })),
                    recovery_strategy: Some(RecoveryStrategy::Retry {
                        max_attempts: 2,
                        backoff_ms: 500,
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::DataIntegrity { details, context } => {
                warn!(
                    "Data integrity violation: {} - Context: {:?}",
                    details, context
                );
                ErrorResponse {
                    code: "DATA_INTEGRITY_ERROR".to_string(),
                    message: format!("Data integrity violation: {}", details),
                    user_message: "数据完整性检查失败".to_string(),
                    details: Some(json!({"violation": details})),
                    recovery_strategy: Some(RecoveryStrategy::ManualIntervention {
                        instructions: "请检查数据一致性，可能需要手动修复".to_string(),
                    }),
                    context: Some(context.clone()),
                }
            }

            // 文件系统错误
            AppError::FileNotFound { path, context } => {
                warn!("File not found: {} - Context: {:?}", path, context);
                ErrorResponse {
                    code: "FILE_NOT_FOUND".to_string(),
                    message: format!("File not found: {}", path),
                    user_message: format!("文件未找到: {}", path),
                    details: Some(json!({"path": path})),
                    recovery_strategy: Some(RecoveryStrategy::ManualIntervention {
                        instructions: "请检查文件是否存在或路径是否正确".to_string(),
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::FilePermission {
                path,
                operation,
                context,
            } => {
                warn!(
                    "File permission denied: {} - Operation: {} - Context: {:?}",
                    path, operation, context
                );
                ErrorResponse {
                    code: "FILE_PERMISSION_ERROR".to_string(),
                    message: format!(
                        "Permission denied for operation '{}' on file: {}",
                        operation, path
                    ),
                    user_message: format!("文件权限不足，无法执行{}操作", operation),
                    details: Some(json!({
                        "path": path,
                        "operation": operation
                    })),
                    recovery_strategy: Some(RecoveryStrategy::ManualIntervention {
                        instructions: "请检查文件权限设置".to_string(),
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::FileIo {
                source,
                path,
                context,
            } => {
                error!(
                    "File I/O error: {} - Path: {:?} - Context: {:?}",
                    source, path, context
                );
                ErrorResponse {
                    code: "FILE_IO_ERROR".to_string(),
                    message: format!("File I/O error: {}", source),
                    user_message: "文件操作失败".to_string(),
                    details: Some(json!({
                        "io_error": source.to_string(),
                        "path": path
                    })),
                    recovery_strategy: Some(RecoveryStrategy::Retry {
                        max_attempts: 2,
                        backoff_ms: 100,
                    }),
                    context: Some(context.clone()),
                }
            }

            // 网络错误
            AppError::TmdbApi {
                status_code,
                message,
                retry_after,
                context,
            } => {
                warn!(
                    "TMDB API error: {} - {} - Context: {:?}",
                    status_code, message, context
                );
                let recovery = if *status_code == 429 {
                    Some(RecoveryStrategy::Retry {
                        max_attempts: 3,
                        backoff_ms: retry_after.unwrap_or(1000),
                    })
                } else {
                    Some(RecoveryStrategy::Retry {
                        max_attempts: 2,
                        backoff_ms: 5000,
                    })
                };

                ErrorResponse {
                    code: "TMDB_API_ERROR".to_string(),
                    message: format!("TMDB API error: {} - {}", status_code, message),
                    user_message: "元数据获取失败".to_string(),
                    details: Some(json!({
                        "status_code": status_code,
                        "api_message": message,
                        "retry_after": retry_after
                    })),
                    recovery_strategy: recovery,
                    context: Some(context.clone()),
                }
            }

            AppError::NetworkTimeout {
                operation,
                timeout_ms,
                context,
            } => {
                warn!(
                    "Network timeout: {} - Timeout: {}ms - Context: {:?}",
                    operation, timeout_ms, context
                );
                ErrorResponse {
                    code: "NETWORK_TIMEOUT".to_string(),
                    message: format!(
                        "Network timeout for operation '{}': {}ms",
                        operation, timeout_ms
                    ),
                    user_message: format!("网络请求超时: {}", operation),
                    details: Some(json!({
                        "operation": operation,
                        "timeout_ms": timeout_ms
                    })),
                    recovery_strategy: Some(RecoveryStrategy::Retry {
                        max_attempts: 3,
                        backoff_ms: 2000,
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::Network {
                source,
                url,
                context,
            } => {
                error!(
                    "Network error: {} - URL: {:?} - Context: {:?}",
                    source, url, context
                );
                ErrorResponse {
                    code: "NETWORK_ERROR".to_string(),
                    message: format!("Network error: {}", source),
                    user_message: "网络请求失败".to_string(),
                    details: Some(json!({
                        "network_error": source.to_string(),
                        "url": url
                    })),
                    recovery_strategy: Some(RecoveryStrategy::Retry {
                        max_attempts: 2,
                        backoff_ms: 1000,
                    }),
                    context: Some(context.clone()),
                }
            }

            // 验证错误
            AppError::Validation {
                field,
                reason,
                value,
                context,
            } => {
                warn!(
                    "Validation failed: {} - {} - Value: {:?} - Context: {:?}",
                    field, reason, value, context
                );
                ErrorResponse {
                    code: "VALIDATION_ERROR".to_string(),
                    message: format!("Validation failed for field '{}': {}", field, reason),
                    user_message: format!("输入验证失败: {}", reason),
                    details: Some(json!({
                        "field": field,
                        "reason": reason,
                        "value": value
                    })),
                    recovery_strategy: Some(RecoveryStrategy::ManualIntervention {
                        instructions: "请检查输入数据格式".to_string(),
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::UnsupportedFormat {
                format,
                supported_formats,
                context,
            } => {
                warn!(
                    "Unsupported format: {} - Supported: {:?} - Context: {:?}",
                    format, supported_formats, context
                );
                ErrorResponse {
                    code: "UNSUPPORTED_FORMAT".to_string(),
                    message: format!("Unsupported file format: {}", format),
                    user_message: format!("不支持的文件格式: {}", format),
                    details: Some(json!({
                        "format": format,
                        "supported_formats": supported_formats
                    })),
                    recovery_strategy: Some(RecoveryStrategy::ManualIntervention {
                        instructions: format!(
                            "请使用以下格式之一: {}",
                            supported_formats.join(", ")
                        ),
                    }),
                    context: Some(context.clone()),
                }
            }

            // 业务错误
            AppError::TaskExists { task_id, context } => {
                warn!("Task already exists: {} - Context: {:?}", task_id, context);
                ErrorResponse {
                    code: "TASK_EXISTS".to_string(),
                    message: format!("Task already exists: {}", task_id),
                    user_message: "任务已存在".to_string(),
                    details: Some(json!({"task_id": task_id})),
                    recovery_strategy: Some(RecoveryStrategy::ManualIntervention {
                        instructions: "请等待现有任务完成或取消后再重试".to_string(),
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::QuotaExceeded {
                resource,
                current,
                limit,
                context,
            } => {
                warn!(
                    "Quota exceeded: {} - {}/{} - Context: {:?}",
                    resource, current, limit, context
                );
                ErrorResponse {
                    code: "QUOTA_EXCEEDED".to_string(),
                    message: format!(
                        "Resource quota exceeded: {} - {}/{}",
                        resource, current, limit
                    ),
                    user_message: format!("资源配额不足: {}", resource),
                    details: Some(json!({
                        "resource": resource,
                        "current": current,
                        "limit": limit
                    })),
                    recovery_strategy: Some(RecoveryStrategy::ManualIntervention {
                        instructions: "请清理资源或升级配额".to_string(),
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::OperationCancelled {
                operation,
                reason,
                context,
            } => {
                warn!(
                    "Operation cancelled: {} - Reason: {:?} - Context: {:?}",
                    operation, reason, context
                );
                ErrorResponse {
                    code: "OPERATION_CANCELLED".to_string(),
                    message: format!("Operation cancelled: {}", operation),
                    user_message: format!("操作已取消: {}", operation),
                    details: Some(json!({
                        "operation": operation,
                        "reason": reason
                    })),
                    recovery_strategy: Some(RecoveryStrategy::Retry {
                        max_attempts: 1,
                        backoff_ms: 0,
                    }),
                    context: Some(context.clone()),
                }
            }

            // 配置和系统错误
            AppError::ConfigInvalid {
                key,
                reason,
                context,
            } => {
                error!(
                    "Invalid configuration: {} - {} - Context: {:?}",
                    key, reason, context
                );
                ErrorResponse {
                    code: "CONFIG_INVALID".to_string(),
                    message: format!("Invalid configuration for '{}': {}", key, reason),
                    user_message: "配置无效".to_string(),
                    details: Some(json!({
                        "key": key,
                        "reason": reason
                    })),
                    recovery_strategy: Some(RecoveryStrategy::ManualIntervention {
                        instructions: "请检查配置文件".to_string(),
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::SystemResource {
                resource,
                available,
                required,
                context,
            } => {
                error!(
                    "System resource exhausted: {} - Available: {}, Required: {} - Context: {:?}",
                    resource, available, required, context
                );
                ErrorResponse {
                    code: "SYSTEM_RESOURCE_EXHAUSTED".to_string(),
                    message: format!(
                        "System resource exhausted: {} - Available: {}, Required: {}",
                        resource, available, required
                    ),
                    user_message: format!("系统资源不足: {}", resource),
                    details: Some(json!({
                        "resource": resource,
                        "available": available,
                        "required": required
                    })),
                    recovery_strategy: Some(RecoveryStrategy::Retry {
                        max_attempts: 1,
                        backoff_ms: 5000,
                    }),
                    context: Some(context.clone()),
                }
            }

            AppError::Internal {
                message,
                source,
                context,
            } => {
                error!(
                    "Internal error: {} - Source: {:?} - Context: {:?}",
                    message, source, context
                );
                ErrorResponse {
                    code: "INTERNAL_ERROR".to_string(),
                    message: format!("Internal error: {}", message),
                    user_message: "内部服务器错误".to_string(),
                    details: source.as_ref().map(|s| json!({"source": s.to_string()})),
                    recovery_strategy: Some(RecoveryStrategy::Retry {
                        max_attempts: 1,
                        backoff_ms: 1000,
                    }),
                    context: Some(context.clone()),
                }
            }
        }
    }

    /// 获取 HTTP 状态码
    pub fn http_status(&self) -> StatusCode {
        match self {
            AppError::DatabaseConnection { .. } | AppError::DatabaseQuery { .. } => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
            AppError::DataIntegrity { .. } => StatusCode::CONFLICT,
            AppError::FileNotFound { .. } => StatusCode::NOT_FOUND,
            AppError::FilePermission { .. } => StatusCode::FORBIDDEN,
            AppError::FileIo { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::TmdbApi {
                status_code: 429, ..
            } => StatusCode::TOO_MANY_REQUESTS,
            AppError::TmdbApi { .. } => StatusCode::BAD_GATEWAY,
            AppError::NetworkTimeout { .. } | AppError::Network { .. } => StatusCode::BAD_GATEWAY,
            AppError::Validation { .. } | AppError::UnsupportedFormat { .. } => {
                StatusCode::BAD_REQUEST
            }
            AppError::TaskExists { .. } => StatusCode::CONFLICT,
            AppError::QuotaExceeded { .. } => StatusCode::INSUFFICIENT_STORAGE,
            AppError::OperationCancelled { .. } => StatusCode::REQUEST_TIMEOUT,
            AppError::ConfigInvalid { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::SystemResource { .. } => StatusCode::SERVICE_UNAVAILABLE,
            AppError::Internal { .. } => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let error_response = self.to_error_response();
        let status = self.http_status();

        let body = Json(json!({
            "error": error_response,
            "status_code": status.as_u16(),
        }));

        (status, body).into_response()
    }
}

/// Result 类型别名
pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    /// 创建带上下文的文件未找到错误
    pub fn file_not_found(path: impl Into<String>, operation: impl Into<String>) -> Self {
        let path_str = path.into();
        AppError::FileNotFound {
            path: path_str.clone(),
            context: ErrorContext {
                operation: operation.into(),
                resource: Some(path_str),
                user_id: None,
                metadata: HashMap::new(),
            },
        }
    }

    /// 创建带上下文的验证错误
    pub fn validation_error(
        field: impl Into<String>,
        reason: impl Into<String>,
        operation: impl Into<String>,
    ) -> Self {
        AppError::Validation {
            field: field.into(),
            reason: reason.into(),
            value: None,
            context: ErrorContext {
                operation: operation.into(),
                resource: None,
                user_id: None,
                metadata: HashMap::new(),
            },
        }
    }

    /// 创建带上下文的数据库查询错误
    pub fn db_query_error(
        error: sqlx::Error,
        query: impl Into<String>,
        operation: impl Into<String>,
    ) -> Self {
        AppError::DatabaseQuery {
            source: error,
            query: query.into(),
            context: ErrorContext {
                operation: operation.into(),
                resource: None,
                user_id: None,
                metadata: HashMap::new(),
            },
        }
    }

    /// 创建带上下文的系统资源错误
    pub fn system_resource_error(
        resource: impl Into<String>,
        available: u64,
        required: u64,
        operation: impl Into<String>,
    ) -> Self {
        AppError::SystemResource {
            resource: resource.into(),
            available,
            required,
            context: ErrorContext {
                operation: operation.into(),
                resource: None,
                user_id: None,
                metadata: HashMap::new(),
            },
        }
    }

    /// 添加用户ID到错误上下文
    pub fn with_user_id(mut self, user_id: impl Into<String>) -> Self {
        match &mut self {
            AppError::DatabaseConnection { context, .. }
            | AppError::DatabaseQuery { context, .. }
            | AppError::DataIntegrity { context, .. }
            | AppError::FileNotFound { context, .. }
            | AppError::FilePermission { context, .. }
            | AppError::FileIo { context, .. }
            | AppError::TmdbApi { context, .. }
            | AppError::NetworkTimeout { context, .. }
            | AppError::Network { context, .. }
            | AppError::Validation { context, .. }
            | AppError::UnsupportedFormat { context, .. }
            | AppError::TaskExists { context, .. }
            | AppError::QuotaExceeded { context, .. }
            | AppError::OperationCancelled { context, .. }
            | AppError::ConfigInvalid { context, .. }
            | AppError::SystemResource { context, .. }
            | AppError::Internal { context, .. } => {
                context.user_id = Some(user_id.into());
            }
        }
        self
    }

    /// 添加元数据到错误上下文
    pub fn with_metadata(
        mut self,
        key: impl Into<String>,
        value: impl Into<serde_json::Value>,
    ) -> Self {
        let key = key.into();
        let value = value.into();

        match &mut self {
            AppError::DatabaseConnection { context, .. }
            | AppError::DatabaseQuery { context, .. }
            | AppError::DataIntegrity { context, .. }
            | AppError::FileNotFound { context, .. }
            | AppError::FilePermission { context, .. }
            | AppError::FileIo { context, .. }
            | AppError::TmdbApi { context, .. }
            | AppError::NetworkTimeout { context, .. }
            | AppError::Network { context, .. }
            | AppError::Validation { context, .. }
            | AppError::UnsupportedFormat { context, .. }
            | AppError::TaskExists { context, .. }
            | AppError::QuotaExceeded { context, .. }
            | AppError::OperationCancelled { context, .. }
            | AppError::ConfigInvalid { context, .. }
            | AppError::SystemResource { context, .. }
            | AppError::Internal { context, .. } => {
                context.metadata.insert(key, value);
            }
        }
        self
    }
}
