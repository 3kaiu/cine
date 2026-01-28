use axum::{
    extract::{Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::business_metrics::{BusinessMetrics, UsagePatternAnalysis};

/// 获取业务指标报告
#[utoipa::path(
    get,
    path = "/api/business/metrics",
    tag = "business",
    params(
        ("period_days" = Option<u32>, Query, description = "报告周期（天），默认7天", example = 7),
    ),
    responses(
        (status = 200, description = "获取业务指标成功", body = BusinessMetrics),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_business_metrics(
    State(_state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<BusinessMetrics>, (axum::http::StatusCode, String)> {
    let period_days = params
        .get("period_days")
        .and_then(|s| s.parse().ok())
        .unwrap_or(7); // 默认7天

    let metrics = crate::services::business_metrics::BUSINESS_METRICS
        .generate_business_report(period_days)
        .await;

    Ok(Json(metrics))
}

/// 获取使用模式分析
#[utoipa::path(
    get,
    path = "/api/business/usage-patterns",
    tag = "business",
    responses(
        (status = 200, description = "获取使用模式分析成功", body = UsagePatternAnalysis),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_usage_patterns(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<UsagePatternAnalysis>, (axum::http::StatusCode, String)> {
    let analysis = crate::services::business_metrics::BUSINESS_METRICS
        .analyze_usage_patterns()
        .await;

    Ok(Json(analysis))
}

/// 设置性能基准
#[utoipa::path(
    post,
    path = "/api/business/benchmarks",
    tag = "business",
    request_body = SetBenchmarkRequest,
    responses(
        (status = 200, description = "设置性能基准成功", body = serde_json::Value),
        (status = 400, description = "请求参数错误")
    )
)]
pub async fn set_performance_benchmark(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<SetBenchmarkRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let metric_name = req.metric_name.clone();
    crate::services::business_metrics::BUSINESS_METRICS
        .set_performance_baseline(req.metric_name, req.baseline_value, req.target_value)
        .await;

    Ok(Json(serde_json::json!({
        "message": "Performance benchmark set successfully",
        "metric": metric_name
    })))
}

/// 记录业务KPI
#[utoipa::path(
    post,
    path = "/api/business/kpis",
    tag = "business",
    request_body = BusinessKPIs,
    responses(
        (status = 200, description = "记录KPI成功", body = serde_json::Value),
        (status = 400, description = "请求参数错误")
    )
)]
pub async fn record_business_kpis(
    State(_state): State<Arc<AppState>>,
    Json(kpis): Json<crate::services::business_metrics::BusinessKPIs>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    crate::services::business_metrics::BUSINESS_METRICS
        .record_business_kpis(kpis)
        .await;

    Ok(Json(serde_json::json!({
        "message": "Business KPIs recorded successfully"
    })))
}

/// 获取业务仪表盘数据
#[utoipa::path(
    get,
    path = "/api/business/dashboard",
    tag = "business",
    responses(
        (status = 200, description = "获取业务仪表盘数据成功", body = BusinessDashboard),
        (status = 500, description = "服务器内部错误")
    )
)]
pub async fn get_business_dashboard(
    State(state): State<Arc<AppState>>,
) -> Result<Json<BusinessDashboard>, (axum::http::StatusCode, String)> {
    // 获取最近7天的业务指标
    let business_metrics = crate::services::business_metrics::BUSINESS_METRICS
        .generate_business_report(7)
        .await;

    // 获取使用模式分析
    let usage_patterns = crate::services::business_metrics::BUSINESS_METRICS
        .analyze_usage_patterns()
        .await;

    // 获取系统健康状态
    let system_health =
        crate::handlers::performance_monitor::get_system_health(State(state.clone()))
            .await
            .map(|Json(health)| health)
            .unwrap_or_else(|_| crate::handlers::performance_monitor::SystemHealth {
                status: crate::handlers::performance_monitor::HealthStatus::Unhealthy,
                health_score: 0.0,
                timestamp: chrono::Utc::now(),
                resource_stats: None,
                queue_stats: None,
                checks: vec![],
            });

    // 获取性能趋势
    let performance_trends = crate::services::metrics::ENHANCED_METRICS
        .get_all_trends(3600)
        .await;

    let recommendations = generate_recommendations(&business_metrics, &usage_patterns);
    let dashboard = BusinessDashboard {
        business_metrics,
        usage_patterns,
        system_health,
        performance_trends,
        recommendations,
    };

    Ok(Json(dashboard))
}

/// 生成业务建议
fn generate_recommendations(
    metrics: &BusinessMetrics,
    patterns: &UsagePatternAnalysis,
) -> Vec<BusinessRecommendation> {
    let mut recommendations = Vec::new();

    // 基于用户参与度生成建议
    if metrics.user_engagement.bounce_rate > 0.5 {
        recommendations.push(BusinessRecommendation {
            priority: RecommendationPriority::High,
            category: "User Engagement".to_string(),
            title: "High Bounce Rate Detected".to_string(),
            description: format!("{}% of users leave after a single operation. Consider improving onboarding experience.", (metrics.user_engagement.bounce_rate * 100.0) as i32),
            action_items: vec![
                "Add welcome tutorial".to_string(),
                "Improve first-time user experience".to_string(),
                "Add progress indicators for long operations".to_string(),
            ],
        });
    }

    // 基于操作成功率生成建议
    for (operation_type, success_rate) in &metrics.operation_metrics.success_rate_by_type {
        if *success_rate < 0.8 {
            recommendations.push(BusinessRecommendation {
                priority: RecommendationPriority::Medium,
                category: "Operation Reliability".to_string(),
                title: format!("Low Success Rate for {}", operation_type),
                description: format!("{} operation has {:.1}% success rate. Investigate and fix common failure causes.", operation_type, success_rate * 100.0),
                action_items: vec![
                    format!("Analyze {} failure patterns", operation_type),
                    "Improve error handling".to_string(),
                    "Add retry mechanisms".to_string(),
                ],
            });
        }
    }

    // 基于功能采用率生成建议
    let low_adoption_features: Vec<_> = metrics
        .user_engagement
        .feature_adoption_rates
        .iter()
        .filter(|(_, rate)| **rate < 0.3)
        .collect();

    for (feature, rate) in low_adoption_features {
        recommendations.push(BusinessRecommendation {
            priority: RecommendationPriority::Low,
            category: "Feature Adoption".to_string(),
            title: format!("Low Adoption Rate for {}", feature),
            description: format!("Only {:.1}% of users use {} feature. Consider improving discoverability or usability.", rate * 100.0, feature),
            action_items: vec![
                format!("Improve {} feature visibility", feature),
                "Add feature usage hints".to_string(),
                format!("Conduct user research on {} usability", feature),
            ],
        });
    }

    // 基于使用模式生成建议
    if patterns.common_operation_sequences.len() > 0 {
        let top_sequence = &patterns.common_operation_sequences[0];
        recommendations.push(BusinessRecommendation {
            priority: RecommendationPriority::Medium,
            category: "Workflow Optimization".to_string(),
            title: "Popular Operation Sequence Detected".to_string(),
            description: format!(
                "Users frequently perform: {}. Consider creating a streamlined workflow.",
                top_sequence.0
            ),
            action_items: vec![
                "Create batch operation for common sequences".to_string(),
                "Add workflow shortcuts".to_string(),
                "Consider automation for repetitive tasks".to_string(),
            ],
        });
    }

    recommendations
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct BusinessDashboard {
    pub business_metrics: BusinessMetrics,
    pub usage_patterns: UsagePatternAnalysis,
    pub system_health: crate::handlers::performance_monitor::SystemHealth,
    pub performance_trends: Vec<crate::services::metrics::PerformanceTrend>,
    pub recommendations: Vec<BusinessRecommendation>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct BusinessRecommendation {
    pub priority: RecommendationPriority,
    pub category: String,
    pub title: String,
    pub description: String,
    pub action_items: Vec<String>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub enum RecommendationPriority {
    Low,
    Medium,
    High,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct SetBenchmarkRequest {
    pub metric_name: String,
    pub baseline_value: f64,
    pub target_value: f64,
}
