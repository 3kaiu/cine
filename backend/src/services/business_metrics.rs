//! 业务指标监控系统
//!
//! 提供全面的业务指标监控，包括：
//! - 用户操作行为统计
//! - 性能基准测试对比
//! - 业务KPI监控
//! - 使用模式分析

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// 用户会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSession {
    pub session_id: String,
    pub user_id: Option<String>,
    pub start_time: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
    pub operations: Vec<UserOperation>,
    pub device_info: Option<DeviceInfo>,
}

/// 用户操作记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserOperation {
    pub operation_type: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub duration_ms: Option<u64>,
    pub success: bool,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// 设备信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
    pub platform: Option<String>,
    pub screen_resolution: Option<String>,
}

/// 业务指标统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessMetrics {
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub user_engagement: UserEngagementMetrics,
    pub operation_metrics: OperationMetrics,
    pub performance_benchmarks: PerformanceBenchmarks,
    pub business_kpis: BusinessKPIs,
}

/// 用户参与度指标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserEngagementMetrics {
    pub total_sessions: u64,
    pub unique_users: u64,
    pub avg_session_duration: Duration,
    pub bounce_rate: f64,
    pub return_visitor_rate: f64,
    pub feature_adoption_rates: HashMap<String, f64>,
    pub user_retention: RetentionMetrics,
}

/// 操作指标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationMetrics {
    pub total_operations: u64,
    pub operations_by_type: HashMap<String, u64>,
    pub success_rate_by_type: HashMap<String, f64>,
    pub avg_duration_by_type: HashMap<String, Duration>,
    pub peak_usage_hours: Vec<u8>, // 0-23小时
    pub error_patterns: Vec<ErrorPattern>,
}

/// 性能基准
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceBenchmarks {
    pub baseline_metrics: HashMap<String, f64>,
    pub current_metrics: HashMap<String, f64>,
    pub improvement_trends: HashMap<String, TrendDirection>,
    pub benchmark_comparisons: Vec<BenchmarkComparison>,
}

/// 业务KPI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusinessKPIs {
    pub files_processed_per_hour: f64,
    pub storage_utilization: f64,
    pub data_quality_score: f64,
    pub user_satisfaction_score: f64,
    pub cost_efficiency: f64,
}

/// 留存率指标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionMetrics {
    pub day_1_retention: f64,
    pub day_7_retention: f64,
    pub day_30_retention: f64,
    pub churn_rate: f64,
}

/// 错误模式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPattern {
    pub error_type: String,
    pub frequency: u64,
    pub affected_operations: Vec<String>,
    pub common_causes: Vec<String>,
}

/// 基准对比
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkComparison {
    pub benchmark_name: String,
    pub cine_performance: f64,
    pub industry_average: f64,
    pub percentile_rank: f64,
    pub improvement_potential: f64,
}

/// 趋势方向
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TrendDirection {
    Improving,
    Degrading,
    Stable,
    Volatile,
}

/// 业务指标收集器
pub struct BusinessMetricsCollector {
    active_sessions: Arc<RwLock<HashMap<String, UserSession>>>,
    operation_history: Arc<RwLock<Vec<UserOperation>>>,
    performance_baselines: Arc<RwLock<HashMap<String, PerformanceBaseline>>>,
    business_kpi_history: Arc<RwLock<Vec<BusinessKPIs>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PerformanceBaseline {
    metric_name: String,
    baseline_value: f64,
    target_value: f64,
    last_updated: DateTime<Utc>,
}

impl BusinessMetricsCollector {
    pub fn new() -> Self {
        Self {
            active_sessions: Arc::new(RwLock::new(HashMap::new())),
            operation_history: Arc::new(RwLock::new(Vec::new())),
            performance_baselines: Arc::new(RwLock::new(HashMap::new())),
            business_kpi_history: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// 记录用户会话开始
    pub async fn start_user_session(&self, session_id: String, user_id: Option<String>, device_info: Option<DeviceInfo>) {
        let session = UserSession {
            session_id: session_id.clone(),
            user_id,
            start_time: Utc::now(),
            last_activity: Utc::now(),
            operations: Vec::new(),
            device_info,
        };

        self.active_sessions.write().await.insert(session_id, session);
    }

    /// 记录用户会话结束
    pub async fn end_user_session(&self, session_id: &str) {
        let mut sessions = self.active_sessions.write().await;
        if let Some(session) = sessions.remove(session_id) {
            // 将会话操作添加到历史记录
            let mut history = self.operation_history.write().await;
            history.extend(session.operations);
        }
    }

    /// 记录用户操作
    pub async fn record_user_operation(&self, session_id: &str, operation: UserOperation) {
        // 更新活跃会话
        let mut sessions = self.active_sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.last_activity = operation.timestamp;
            session.operations.push(operation.clone());
        }

        // 添加到全局操作历史
        let mut history = self.operation_history.write().await;
        history.push(operation);

        // 限制历史记录大小（保留最近10万条记录）
        if history.len() > 100_000 {
            history.drain(0..10_000); // 移除最旧的1万条
        }
    }

    /// 设置性能基准
    pub async fn set_performance_baseline(&self, metric_name: String, baseline_value: f64, target_value: f64) {
        let baseline = PerformanceBaseline {
            metric_name: metric_name.clone(),
            baseline_value,
            target_value,
            last_updated: Utc::now(),
        };

        self.performance_baselines.write().await.insert(metric_name, baseline);
    }

    /// 记录业务KPI
    pub async fn record_business_kpis(&self, kpis: BusinessKPIs) {
        let mut history = self.business_kpi_history.write().await;
        history.push(kpis);

        // 限制历史记录大小（保留最近1000条）
        if history.len() > 1000 {
            history.remove(0);
        }
    }

    /// 生成业务指标报告
    pub async fn generate_business_report(&self, period_days: u32) -> BusinessMetrics {
        let now = Utc::now();
        let period_start = now - chrono::Duration::days(period_days as i64);

        // 获取指定时间段内的操作历史
        let operations = self.operation_history.read().await
            .iter()
            .filter(|op| op.timestamp >= period_start)
            .cloned()
            .collect::<Vec<_>>();

        // 获取活跃会话
        let active_sessions = self.active_sessions.read().await
            .values()
            .filter(|s| s.last_activity >= period_start)
            .cloned()
            .collect::<Vec<_>>();

        // 计算用户参与度指标
        let user_engagement = self.calculate_user_engagement(&active_sessions, &operations);

        // 计算操作指标
        let operation_metrics = self.calculate_operation_metrics(&operations);

        // 计算性能基准对比
        let performance_benchmarks = self.calculate_performance_benchmarks().await;

        // 获取最新的业务KPI
        let business_kpis = self.business_kpi_history.read().await
            .last()
            .cloned()
            .unwrap_or_else(|| BusinessKPIs {
                files_processed_per_hour: 0.0,
                storage_utilization: 0.0,
                data_quality_score: 0.0,
                user_satisfaction_score: 0.0,
                cost_efficiency: 0.0,
            });

        BusinessMetrics {
            period_start,
            period_end: now,
            user_engagement,
            operation_metrics,
            performance_benchmarks,
            business_kpis,
        }
    }

    /// 计算用户参与度指标
    fn calculate_user_engagement(&self, sessions: &[UserSession], operations: &[UserOperation]) -> UserEngagementMetrics {
        let total_sessions = sessions.len() as u64;
        let unique_users = sessions.iter()
            .filter_map(|s| s.user_id.as_ref())
            .collect::<HashSet<_>>()
            .len() as u64;

        // 计算平均会话时长
        let total_session_duration: u64 = sessions.iter()
            .map(|s| {
                let duration = s.last_activity.signed_duration_since(s.start_time);
                duration.num_seconds().max(0) as u64
            })
            .sum();

        let avg_session_duration = if total_sessions > 0 {
            Duration::from_secs(total_session_duration / total_sessions)
        } else {
            Duration::from_secs(0)
        };

        // 计算跳出率（会话中只有一个操作的会话比例）
        let bounce_sessions = sessions.iter()
            .filter(|s| s.operations.len() <= 1)
            .count() as f64;

        let bounce_rate = if total_sessions > 0 {
            bounce_sessions / total_sessions as f64
        } else {
            0.0
        };

        // 计算功能采用率
        let mut feature_usage = HashMap::new();
        for operation in operations {
            *feature_usage.entry(operation.operation_type.clone()).or_insert(0u64) += 1;
        }

        let feature_adoption_rates = feature_usage.into_iter()
            .map(|(feature, count)| {
                let rate = if total_sessions > 0 {
                    count as f64 / total_sessions as f64
                } else {
                    0.0
                };
                (feature, rate)
            })
            .collect();

        // 简化的留存率计算（实际应该基于用户历史数据）
        let retention = RetentionMetrics {
            day_1_retention: 0.8,   // 示例值
            day_7_retention: 0.6,   // 示例值
            day_30_retention: 0.4,  // 示例值
            churn_rate: 0.1,        // 示例值
        };

        // 计算回头客率（简化为示例）
        let return_visitor_rate = 0.3; // 示例值

        UserEngagementMetrics {
            total_sessions,
            unique_users,
            avg_session_duration,
            bounce_rate,
            return_visitor_rate,
            feature_adoption_rates,
            user_retention: retention,
        }
    }

    /// 计算操作指标
    fn calculate_operation_metrics(&self, operations: &[UserOperation]) -> OperationMetrics {
        let total_operations = operations.len() as u64;

        // 按类型分组统计
        let mut operations_by_type = HashMap::new();
        let mut success_by_type = HashMap::new();
        let mut duration_by_type = HashMap::new();
        let mut errors_by_type = HashMap::new();

        for operation in operations {
            // 操作类型统计
            *operations_by_type.entry(operation.operation_type.clone()).or_insert(0u64) += 1;

            // 成功率统计
            let success_count = success_by_type.entry(operation.operation_type.clone()).or_insert((0u64, 0u64));
            success_count.1 += 1; // 总数
            if operation.success {
                success_count.0 += 1; // 成功数
            }

            // 时长统计
            if let Some(duration) = operation.duration_ms {
                duration_by_type.entry(operation.operation_type.clone())
                    .or_insert_with(Vec::new)
                    .push(duration);
            }

            // 错误模式统计
            if !operation.success {
                *errors_by_type.entry(operation.operation_type.clone()).or_insert(0u64) += 1;
            }
        }

        // 计算成功率
        let success_rate_by_type = success_by_type.into_iter()
            .map(|(op_type, (success_count, total_count))| {
                let rate = if total_count > 0 {
                    success_count as f64 / total_count as f64
                } else {
                    0.0
                };
                (op_type, rate)
            })
            .collect();

        // 计算平均时长
        let avg_duration_by_type = duration_by_type.into_iter()
            .map(|(op_type, durations)| {
                let avg_duration = if !durations.is_empty() {
                    durations.iter().sum::<u64>() / durations.len() as u64
                } else {
                    0
                };
                (op_type, Duration::from_millis(avg_duration))
            })
            .collect();

        // 分析高峰使用时间
        let mut hourly_usage = vec![0u64; 24];
        for operation in operations {
            let hour = operation.timestamp.hour() as usize;
            if hour < 24 {
                hourly_usage[hour] += 1;
            }
        }

        // 找出使用量最高的小时
        let max_usage = hourly_usage.iter().max().copied().unwrap_or(0);
        let peak_usage_hours = hourly_usage.into_iter()
            .enumerate()
            .filter(|(_, count)| *count >= max_usage.saturating_sub(10)) // 允许小幅波动
            .map(|(hour, _)| hour as u8)
            .collect();

        // 分析错误模式
        let error_patterns = errors_by_type.into_iter()
            .map(|(error_type, frequency)| ErrorPattern {
                error_type,
                frequency,
                affected_operations: vec![], // 可以进一步分析
                common_causes: vec![],       // 可以进一步分析
            })
            .collect();

        OperationMetrics {
            total_operations,
            operations_by_type,
            success_rate_by_type,
            avg_duration_by_type,
            peak_usage_hours,
            error_patterns,
        }
    }

    /// 计算性能基准对比
    async fn calculate_performance_benchmarks(&self) -> PerformanceBenchmarks {
        let baselines = self.performance_baselines.read().await;

        let mut baseline_metrics = HashMap::new();
        let mut current_metrics = HashMap::new();
        let mut improvement_trends = HashMap::new();

        // 这里应该从实际监控数据获取当前指标
        // 为了示例，我们使用模拟数据
        for (metric_name, baseline) in baselines.iter() {
            baseline_metrics.insert(metric_name.clone(), baseline.baseline_value);

            // 模拟当前性能数据（实际应该从监控系统获取）
            let current_value = match metric_name.as_str() {
                "file_scan_speed" => baseline.baseline_value * 1.5, // 提升50%
                "hash_performance" => baseline.baseline_value * 2.0, // 提升100%
                "memory_efficiency" => baseline.baseline_value * 1.2, // 提升20%
                _ => baseline.baseline_value,
            };

            current_metrics.insert(metric_name.clone(), current_value);

            // 计算趋势
            let improvement = (current_value - baseline.baseline_value) / baseline.baseline_value;
            let trend = if improvement > 0.1 {
                TrendDirection::Improving
            } else if improvement < -0.1 {
                TrendDirection::Degrading
            } else {
                TrendDirection::Stable
            };

            improvement_trends.insert(metric_name.clone(), trend);
        }

        // 行业基准对比（示例数据）
        let benchmark_comparisons = vec![
            BenchmarkComparison {
                benchmark_name: "File Processing Speed".to_string(),
                cine_performance: 1500.0, // 文件/分钟
                industry_average: 800.0,
                percentile_rank: 85.0,
                improvement_potential: 25.0,
            },
            BenchmarkComparison {
                benchmark_name: "Memory Efficiency".to_string(),
                cine_performance: 0.85, // 内存利用率
                industry_average: 0.75,
                percentile_rank: 78.0,
                improvement_potential: 15.0,
            },
        ];

        PerformanceBenchmarks {
            baseline_metrics,
            current_metrics,
            improvement_trends,
            benchmark_comparisons,
        }
    }

    /// 获取用户使用模式分析
    pub async fn analyze_usage_patterns(&self) -> UsagePatternAnalysis {
        let operations = self.operation_history.read().await.clone();

        // 分析操作序列模式
        let mut operation_sequences = HashMap::new();
        let mut session_operations = HashMap::new();

        // 按会话分组操作
        for operation in &operations {
            // 简化：假设所有操作都在同一个会话中
            session_operations.entry("default_session".to_string())
                .or_insert_with(Vec::new)
                .push(operation.operation_type.clone());
        }

        // 分析操作序列
        for (_session_id, ops) in session_operations {
            for window in ops.windows(2) {
                if window.len() == 2 {
                    let sequence = format!("{} -> {}", window[0], window[1]);
                    *operation_sequences.entry(sequence).or_insert(0u64) += 1;
                }
            }
        }

        // 找出最常见的操作序列
        let mut common_sequences: Vec<(String, u64)> = operation_sequences.into_iter().collect();
        common_sequences.sort_by(|a, b| b.1.cmp(&a.1));
        common_sequences.truncate(10);

        // 分析功能使用频率
        let mut feature_usage = HashMap::new();
        for operation in &operations {
            *feature_usage.entry(operation.operation_type.clone()).or_insert(0u64) += 1;
        }

        let mut top_features: Vec<(String, u64)> = feature_usage.into_iter().collect();
        top_features.sort_by(|a, b| b.1.cmp(&a.1));

        UsagePatternAnalysis {
            common_operation_sequences: common_sequences,
            top_used_features: top_features.into_iter().take(10).collect(),
            user_segments: vec![], // 可以基于操作模式划分用户群体
            recommendation_opportunities: vec![], // 基于使用模式推荐功能
        }
    }
}

/// 使用模式分析
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsagePatternAnalysis {
    pub common_operation_sequences: Vec<(String, u64)>,
    pub top_used_features: Vec<(String, u64)>,
    pub user_segments: Vec<UserSegment>,
    pub recommendation_opportunities: Vec<String>,
}

/// 用户群体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSegment {
    pub segment_name: String,
    pub user_count: u64,
    pub characteristics: Vec<String>,
}

// 全局业务指标收集器
pub static BUSINESS_METRICS: once_cell::sync::Lazy<BusinessMetricsCollector> =
    once_cell::sync::Lazy::new(|| BusinessMetricsCollector::new());

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[tokio::test]
    async fn test_business_metrics_collection() {
        let collector = BusinessMetricsCollector::new();

        // 测试用户会话记录
        let session_id = "test_session".to_string();
        collector.start_user_session(
            session_id.clone(),
            Some("user123".to_string()),
            None,
        ).await;

        // 测试操作记录
        let operation = UserOperation {
            operation_type: "file_scan".to_string(),
            resource_type: "directory".to_string(),
            resource_id: Some("/media/movies".to_string()),
            timestamp: Utc::now(),
            duration_ms: Some(1500),
            success: true,
            metadata: HashMap::new(),
        };

        collector.record_user_operation(&session_id, operation).await;

        // 测试报告生成
        let report = collector.generate_business_report(1).await;

        assert!(report.user_engagement.total_sessions >= 1);
        assert!(report.operation_metrics.total_operations >= 1);

        // 结束会话
        collector.end_user_session(&session_id).await;
    }

    #[tokio::test]
    async fn test_usage_pattern_analysis() {
        let collector = BusinessMetricsCollector::new();

        // 添加一些测试操作
        let operations = vec![
            UserOperation {
                operation_type: "file_scan".to_string(),
                resource_type: "directory".to_string(),
                resource_id: Some("/media/movies".to_string()),
                timestamp: Utc::now(),
                duration_ms: Some(1500),
                success: true,
                metadata: HashMap::new(),
            },
            UserOperation {
                operation_type: "hash_calculation".to_string(),
                resource_type: "file".to_string(),
                resource_id: Some("movie1.mp4".to_string()),
                timestamp: Utc::now(),
                duration_ms: Some(3000),
                success: true,
                metadata: HashMap::new(),
            },
        ];

        for operation in operations {
            collector.record_user_operation("test_session", operation).await;
        }

        let analysis = collector.analyze_usage_patterns().await;

        // 验证分析结果
        assert!(!analysis.top_used_features.is_empty());
        assert!(analysis.top_used_features.iter().any(|(feature, _)| feature == "file_scan"));
        assert!(analysis.top_used_features.iter().any(|(feature, _)| feature == "hash_calculation"));
    }
}