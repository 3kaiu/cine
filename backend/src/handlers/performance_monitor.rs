use axum::{
    extract::{Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::collections::HashMap;

use crate::handlers::AppState;
use crate::services::metrics::{EnhancedMetricsCollector, PerformanceTrend, ResourceStats, PerformanceAnomaly};

/// 获取性能趋势分析
#[utoipa::path(
    get,
    path = "/api/monitoring/trends",
    tag = "monitoring",
    params(
        ("time_range_seconds" = Option<u64>, Query, description = "时间范围（秒），默认3600", example = 3600),
    ),
    responses(
        (status = 200, description = "获取性能趋势成功", body = Vec<PerformanceTrend>),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_performance_trends(
    State(_state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<PerformanceTrend>>, (axum::http::StatusCode, String)> {
    let time_range_seconds = params
        .get("time_range_seconds")
        .and_then(|s| s.parse().ok())
        .unwrap_or(3600); // 默认1小时

    let trends = crate::services::metrics::ENHANCED_METRICS
        .get_all_trends(time_range_seconds)
        .await;

    Ok(Json(trends))
}

/// 获取资源使用历史
#[utoipa::path(
    get,
    path = "/api/monitoring/resources",
    tag = "monitoring",
    params(
        ("limit" = Option<usize>, Query, description = "返回记录数量，默认100", example = 100),
    ),
    responses(
        (status = 200, description = "获取资源历史成功", body = Vec<ResourceStats>),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_resource_history(
    State(_state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<ResourceStats>>, (axum::http::StatusCode, String)> {
    let limit = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(100);

    let history = crate::services::metrics::ENHANCED_METRICS
        .get_resource_history(limit)
        .await;

    Ok(Json(history))
}

/// 获取性能异常
#[utoipa::path(
    get,
    path = "/api/monitoring/anomalies",
    tag = "monitoring",
    params(
        ("limit" = Option<usize>, Query, description = "返回记录数量，默认50", example = 50),
    ),
    responses(
        (status = 200, description = "获取异常列表成功", body = Vec<PerformanceAnomaly>),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_performance_anomalies(
    State(_state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<PerformanceAnomaly>>, (axum::http::StatusCode, String)> {
    let limit = params
        .get("limit")
        .and_then(|s| s.parse().ok())
        .unwrap_or(50);

    let anomalies = crate::services::metrics::ENHANCED_METRICS
        .get_anomalies(limit)
        .await;

    Ok(Json(anomalies))
}

/// 获取系统健康状态
#[utoipa::path(
    get,
    path = "/api/monitoring/health",
    tag = "monitoring",
    responses(
        (status = 200, description = "系统健康状态", body = SystemHealth),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_system_health(
    State(state): State<Arc<AppState>>,
) -> Result<Json<SystemHealth>, (axum::http::StatusCode, String)> {
    // 获取最新的资源统计
    let resource_stats = crate::services::metrics::ENHANCED_METRICS
        .get_resource_history(1)
        .await
        .first()
        .cloned();

    // 获取队列统计
    let queue_stats = state.task_queue.get_stats().await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 计算健康分数 (0.0-1.0, 1.0为最佳)
    let mut health_score = 1.0;

    // CPU使用率影响健康分数
    if let Some(stats) = &resource_stats {
        if stats.cpu_usage_percent > 90.0 {
            health_score *= 0.5; // CPU过载
        } else if stats.cpu_usage_percent > 70.0 {
            health_score *= 0.8; // CPU高负载
        }

        // 内存使用率影响健康分数
        let memory_usage_ratio = stats.memory_usage_bytes as f64 / stats.memory_total_bytes as f64;
        if memory_usage_ratio > 0.9 {
            health_score *= 0.5; // 内存严重不足
        } else if memory_usage_ratio > 0.8 {
            health_score *= 0.8; // 内存不足
        }
    }

    // 队列积压影响健康分数
    if queue_stats.pending_tasks > 10 {
        health_score *= 0.7; // 队列积压
    }

    // 失败率影响健康分数
    let total_tasks = queue_stats.completed_tasks + queue_stats.failed_tasks;
    if total_tasks > 0 {
        let failure_rate = queue_stats.failed_tasks as f64 / total_tasks as f64;
        if failure_rate > 0.1 {
            health_score *= 0.6; // 高失败率
        } else if failure_rate > 0.05 {
            health_score *= 0.9; // 一般失败率
        }
    }

    // 确定健康状态
    let status = if health_score >= 0.9 {
        HealthStatus::Healthy
    } else if health_score >= 0.7 {
        HealthStatus::Warning
    } else if health_score >= 0.5 {
        HealthStatus::Critical
    } else {
        HealthStatus::Unhealthy
    };

    let health = SystemHealth {
        status,
        health_score,
        timestamp: chrono::Utc::now(),
        resource_stats,
        queue_stats: Some(queue_stats),
        checks: vec![
            HealthCheck {
                name: "CPU Usage".to_string(),
                status: if resource_stats.as_ref().map_or(true, |s| s.cpu_usage_percent < 80.0) {
                    HealthStatus::Healthy
                } else {
                    HealthStatus::Warning
                },
                message: resource_stats.as_ref().map_or(
                    "CPU stats unavailable".to_string(),
                    |s| format!("CPU usage: {:.1}%", s.cpu_usage_percent)
                ),
            },
            HealthCheck {
                name: "Memory Usage".to_string(),
                status: if resource_stats.as_ref().map_or(true, |s| {
                    let ratio = s.memory_usage_bytes as f64 / s.memory_total_bytes as f64;
                    ratio < 0.85
                }) {
                    HealthStatus::Healthy
                } else {
                    HealthStatus::Warning
                },
                message: resource_stats.as_ref().map_or(
                    "Memory stats unavailable".to_string(),
                    |s| format!("Memory usage: {} / {} bytes",
                        s.memory_usage_bytes, s.memory_total_bytes)
                ),
            },
            HealthCheck {
                name: "Queue Health".to_string(),
                status: if queue_stats.pending_tasks < 5 {
                    HealthStatus::Healthy
                } else {
                    HealthStatus::Warning
                },
                message: format!("Pending tasks: {}", queue_stats.pending_tasks),
            },
        ],
    };

    Ok(Json(health))
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct SystemHealth {
    pub status: HealthStatus,
    pub health_score: f64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub resource_stats: Option<ResourceStats>,
    pub queue_stats: Option<crate::services::task_queue::QueueStats>,
    pub checks: Vec<HealthCheck>,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub enum HealthStatus {
    Healthy,
    Warning,
    Critical,
    Unhealthy,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct HealthCheck {
    pub name: String,
    pub status: HealthStatus,
    pub message: String,
}

/// 获取详细的Prometheus指标
#[utoipa::path(
    get,
    path = "/api/monitoring/metrics",
    tag = "monitoring",
    responses(
        (status = 200, description = "Prometheus格式指标", body = String),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_detailed_metrics(
    State(_state): State<Arc<AppState>>,
) -> Result<String, (axum::http::StatusCode, String)> {
    let metrics = crate::services::metrics::ENHANCED_METRICS.prometheus_metrics();

    // 设置正确的Content-Type头
    Ok(metrics)
}