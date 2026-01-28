use once_cell::sync::Lazy;
use prometheus::{Counter, Gauge, Histogram, HistogramOpts, Opts, Registry};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;
use tokio::sync::RwLock;

/// 性能指标数据点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricDataPoint {
    pub timestamp: u64,
    pub value: f64,
    pub labels: HashMap<String, String>,
}

/// 性能趋势分析
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceTrend {
    pub metric_name: String,
    pub time_range: String,
    pub average: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub min: f64,
    pub max: f64,
    pub trend: TrendDirection,
    pub data_points: Vec<MetricDataPoint>,
}

/// 趋势方向
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TrendDirection {
    Improving,
    Degrading,
    Stable,
    Unknown,
}

/// 资源使用统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceStats {
    pub timestamp: u64,
    pub cpu_usage_percent: f64,
    pub memory_usage_bytes: u64,
    pub memory_total_bytes: u64,
    pub disk_usage_bytes: u64,
    pub disk_total_bytes: u64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
}

/// 性能异常检测
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceAnomaly {
    pub timestamp: u64,
    pub metric_name: String,
    pub expected_value: f64,
    pub actual_value: f64,
    pub severity: AnomalySeverity,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AnomalySeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// 增强的指标收集器
pub struct EnhancedMetricsCollector {
    registry: Registry,
    metrics: Arc<RwLock<HashMap<String, Box<dyn prometheus::core::Collector>>>>,
    time_series_data: Arc<RwLock<HashMap<String, Vec<MetricDataPoint>>>>,
    resource_history: Arc<RwLock<Vec<ResourceStats>>>,
    anomalies: Arc<RwLock<Vec<PerformanceAnomaly>>>,
    system: Arc<RwLock<System>>,
    collection_interval: Duration,
}

impl EnhancedMetricsCollector {
    pub fn new(collection_interval: Duration) -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        Self {
            registry: Registry::new(),
            metrics: Arc::new(RwLock::new(HashMap::new())),
            time_series_data: Arc::new(RwLock::new(HashMap::new())),
            resource_history: Arc::new(RwLock::new(Vec::new())),
            anomalies: Arc::new(RwLock::new(Vec::new())),
            system: Arc::new(RwLock::new(system)),
            collection_interval,
        }
    }

    /// 注册基础指标
    pub async fn register_basic_metrics(&self) -> anyhow::Result<()> {
        // HTTP请求指标
        self.register_histogram(
            "cine_http_request_duration_seconds",
            "HTTP request duration in seconds",
            &["method", "endpoint", "status"],
            vec![
                0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
            ],
        )
        .await?;

        // 数据库查询指标
        self.register_histogram(
            "cine_db_query_duration_seconds",
            "Database query duration in seconds",
            &["operation", "table"],
            vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1.0],
        )
        .await?;

        // 任务执行指标
        self.register_histogram(
            "cine_task_execution_duration_seconds",
            "Task execution duration in seconds",
            &["task_type"],
            vec![0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 300.0, 600.0],
        )
        .await?;

        // 缓存性能指标
        self.register_counter(
            "cine_cache_requests_total",
            "Total cache requests",
            &["cache_type", "operation"],
        )
        .await?;

        self.register_gauge("cine_cache_hit_rate", "Cache hit rate", &["cache_type"])
            .await?;

        // 资源使用指标
        self.register_gauge("cine_cpu_usage_percent", "CPU usage percentage", &[])
            .await?;
        self.register_gauge("cine_memory_usage_bytes", "Memory usage in bytes", &[])
            .await?;
        self.register_gauge("cine_disk_usage_bytes", "Disk usage in bytes", &[])
            .await?;

        // 业务指标
        self.register_counter(
            "cine_files_processed_total",
            "Total files processed",
            &["operation"],
        )
        .await?;

        self.register_gauge(
            "cine_active_connections",
            "Number of active connections",
            &[],
        )
        .await?;

        Ok(())
    }

    /// 注册直方图指标
    pub async fn register_histogram(
        &self,
        name: &str,
        help: &str,
        labels: &[&str],
        buckets: Vec<f64>,
    ) -> anyhow::Result<()> {
        let histogram = Histogram::with_opts(HistogramOpts::new(name, help).buckets(buckets))?;

        let labeled_histogram = if labels.is_empty() {
            histogram
        } else {
            // 对于有标签的指标，我们需要创建未标签的版本
            // 实际使用时会通过labels动态创建
            histogram
        };

        self.registry
            .register(Box::new(labeled_histogram.clone()))?;
        self.metrics
            .write()
            .await
            .insert(name.to_string(), Box::new(labeled_histogram));

        Ok(())
    }

    /// 注册计数器指标
    pub async fn register_counter(
        &self,
        name: &str,
        help: &str,
        labels: &[&str],
    ) -> anyhow::Result<()> {
        let counter = Counter::with_opts(Opts::new(name, help))?;
        let labeled_counter = if labels.is_empty() { counter } else { counter };

        self.registry.register(Box::new(labeled_counter.clone()))?;
        self.metrics
            .write()
            .await
            .insert(name.to_string(), Box::new(labeled_counter));

        Ok(())
    }

    /// 注册仪表盘指标
    pub async fn register_gauge(
        &self,
        name: &str,
        help: &str,
        labels: &[&str],
    ) -> anyhow::Result<()> {
        let gauge = Gauge::with_opts(Opts::new(name, help))?;
        let labeled_gauge = if labels.is_empty() { gauge } else { gauge };

        self.registry.register(Box::new(labeled_gauge.clone()))?;
        self.metrics
            .write()
            .await
            .insert(name.to_string(), Box::new(labeled_gauge));

        Ok(())
    }

    /// 记录指标值
    pub async fn record_metric(&self, name: &str, value: f64, labels: HashMap<String, String>) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let data_point = MetricDataPoint {
            timestamp,
            value,
            labels,
        };

        // 存储时间序列数据
        self.time_series_data
            .write()
            .await
            .entry(name.to_string())
            .or_insert_with(Vec::new)
            .push(data_point);
    }

    /// 收集系统资源统计
    pub async fn collect_resource_stats(&self) -> ResourceStats {
        let mut system = self.system.write().await;
        system.refresh_all();

        let cpu_usage = system.cpus().iter().map(|cpu| cpu.cpu_usage()).sum::<f32>()
            / system.cpus().len() as f32;
        let memory_usage = system.used_memory();
        let memory_total = system.total_memory();

        // 磁盘使用情况（简化实现）
        let disk_usage = 0; // 需要实现
        let disk_total = 0; // 需要实现

        // 网络统计（简化实现）
        let network_rx = 0; // 需要实现
        let network_tx = 0; // 需要实现

        let stats = ResourceStats {
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            cpu_usage_percent: cpu_usage as f64,
            memory_usage_bytes: memory_usage,
            memory_total_bytes: memory_total,
            disk_usage_bytes: disk_usage,
            disk_total_bytes: disk_total,
            network_rx_bytes: network_rx,
            network_tx_bytes: network_tx,
        };

        // 存储历史数据
        self.resource_history.write().await.push(stats.clone());

        // 只保留最近24小时的数据
        let cutoff = SystemTime::now() - Duration::from_secs(24 * 3600);
        let cutoff_timestamp = cutoff.duration_since(UNIX_EPOCH).unwrap().as_secs();

        self.resource_history
            .write()
            .await
            .retain(|stat| stat.timestamp >= cutoff_timestamp);

        stats
    }

    /// 分析性能趋势
    pub async fn analyze_performance_trend(
        &self,
        metric_name: &str,
        time_range_seconds: u64,
    ) -> Option<PerformanceTrend> {
        let cutoff = SystemTime::now() - Duration::from_secs(time_range_seconds);
        let cutoff_timestamp = cutoff.duration_since(UNIX_EPOCH).unwrap().as_secs();

        let data = self
            .time_series_data
            .read()
            .await
            .get(metric_name)?
            .iter()
            .filter(|dp| dp.timestamp >= cutoff_timestamp)
            .map(|dp| dp.value)
            .collect::<Vec<f64>>();

        if data.is_empty() {
            return None;
        }

        let mut sorted_data = data.clone();
        sorted_data.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let len = sorted_data.len();
        let average = data.iter().sum::<f64>() / len as f64;
        let p50 = sorted_data[len / 2];
        let p95 = sorted_data[(len as f64 * 0.95) as usize];
        let p99 = sorted_data[(len as f64 * 0.99) as usize];
        let min = sorted_data[0];
        let max = sorted_data[len - 1];

        // 计算趋势（基于最近数据与整体数据的比较）
        let recent_count = (len / 4).max(1); // 最近25%的数据
        let recent_avg = data.iter().rev().take(recent_count).sum::<f64>() / recent_count as f64;
        let trend = if recent_avg < average * 0.95 {
            TrendDirection::Improving
        } else if recent_avg > average * 1.05 {
            TrendDirection::Degrading
        } else {
            TrendDirection::Stable
        };

        let data_points = self
            .time_series_data
            .read()
            .await
            .get(metric_name)?
            .iter()
            .filter(|dp| dp.timestamp >= cutoff_timestamp)
            .cloned()
            .collect();

        Some(PerformanceTrend {
            metric_name: metric_name.to_string(),
            time_range: format!("{}s", time_range_seconds),
            average,
            p50,
            p95,
            p99,
            min,
            max,
            trend,
            data_points,
        })
    }

    /// 检测性能异常
    pub async fn detect_anomalies(&self, metric_name: &str) -> Vec<PerformanceAnomaly> {
        let trend = match self.analyze_performance_trend(metric_name, 3600).await {
            // 1小时
            Some(t) => t,
            None => return Vec::new(),
        };

        let mut anomalies = Vec::new();

        // 检查P99异常
        if let Some(latest) = trend.data_points.last() {
            let threshold_high = trend.p95 * 2.0; // P95的2倍作为异常阈值
            let threshold_low = trend.p50 * 0.5; // P50的0.5倍作为异常阈值

            if latest.value > threshold_high {
                anomalies.push(PerformanceAnomaly {
                    timestamp: latest.timestamp,
                    metric_name: metric_name.to_string(),
                    expected_value: trend.p95,
                    actual_value: latest.value,
                    severity: AnomalySeverity::High,
                    description: format!(
                        "{} 超出正常范围: {:.2} > {:.2}",
                        metric_name, latest.value, threshold_high
                    ),
                });
            } else if latest.value < threshold_low {
                anomalies.push(PerformanceAnomaly {
                    timestamp: latest.timestamp,
                    metric_name: metric_name.to_string(),
                    expected_value: trend.p50,
                    actual_value: latest.value,
                    severity: AnomalySeverity::Medium,
                    description: format!(
                        "{} 低于正常范围: {:.2} < {:.2}",
                        metric_name, latest.value, threshold_low
                    ),
                });
            }
        }

        // 存储异常记录
        for anomaly in &anomalies {
            self.anomalies.write().await.push(anomaly.clone());
        }

        anomalies
    }

    /// 获取所有性能趋势
    pub async fn get_all_trends(&self, time_range_seconds: u64) -> Vec<PerformanceTrend> {
        let metric_names = self
            .time_series_data
            .read()
            .await
            .keys()
            .cloned()
            .collect::<Vec<_>>();

        let mut trends = Vec::new();
        for metric_name in metric_names {
            if let Some(trend) = self
                .analyze_performance_trend(&metric_name, time_range_seconds)
                .await
            {
                trends.push(trend);
            }
        }

        trends
    }

    /// 获取资源使用历史
    pub async fn get_resource_history(&self, limit: usize) -> Vec<ResourceStats> {
        self.resource_history
            .read()
            .await
            .iter()
            .rev()
            .take(limit)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    }

    /// 获取检测到的异常
    pub async fn get_anomalies(&self, limit: usize) -> Vec<PerformanceAnomaly> {
        self.anomalies
            .read()
            .await
            .iter()
            .rev()
            .take(limit)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    }

    /// 获取Prometheus格式的指标
    pub fn prometheus_metrics(&self) -> String {
        use prometheus::Encoder;
        let encoder = prometheus::TextEncoder::new();
        let metric_families = self.registry.gather();
        encoder
            .encode_to_string(&metric_families)
            .unwrap_or_default()
    }

    /// 启动后台监控任务
    pub async fn start_monitoring(&self) {
        let collector = Arc::new(self.clone());

        // 定期收集资源统计
        tokio::spawn({
            let collector = collector.clone();
            async move {
                let mut interval = tokio::time::interval(Duration::from_secs(30));
                loop {
                    interval.tick().await;
                    let _ = collector.collect_resource_stats().await;
                }
            }
        });

        // 定期检测异常
        tokio::spawn({
            let collector = collector.clone();
            async move {
                let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5分钟
                loop {
                    interval.tick().await;

                    // 检测关键指标的异常
                    let metrics_to_check = vec![
                        "cine_http_request_duration_seconds",
                        "cine_db_query_duration_seconds",
                        "cine_task_execution_duration_seconds",
                    ];

                    for metric in metrics_to_check {
                        let anomalies = collector.detect_anomalies(metric).await;
                        if !anomalies.is_empty() {
                            tracing::warn!(
                                "Detected {} anomalies for metric {}",
                                anomalies.len(),
                                metric
                            );
                        }
                    }
                }
            }
        });
    }
}

impl Clone for EnhancedMetricsCollector {
    fn clone(&self) -> Self {
        Self {
            registry: Registry::new(), // 克隆时创建新的registry
            metrics: self.metrics.clone(),
            time_series_data: self.time_series_data.clone(),
            resource_history: self.resource_history.clone(),
            anomalies: self.anomalies.clone(),
            system: self.system.clone(),
            collection_interval: self.collection_interval,
        }
    }
}

// 全局增强指标收集器
pub static ENHANCED_METRICS: Lazy<EnhancedMetricsCollector> =
    Lazy::new(|| EnhancedMetricsCollector::new(Duration::from_secs(30)));

// 兼容性：保留原有METRICS结构
pub struct Metrics {
    pub active_tasks: Gauge,
    pub hash_throughput_bytes: Counter,
    pub scan_duration_seconds: Histogram,
    pub scrape_requests_total: Counter,
}

pub static REGISTRY: Lazy<Registry> = Lazy::new(|| Registry::new());

pub static METRICS: Lazy<Metrics> = Lazy::new(|| {
    // 初始化增强指标收集器
    tokio::spawn(async {
        ENHANCED_METRICS.register_basic_metrics().await.unwrap();
        ENHANCED_METRICS.start_monitoring().await;
    });

    let active_tasks = Gauge::with_opts(Opts::new(
        "cine_active_tasks",
        "Number of currently active tasks",
    ))
    .unwrap();
    let hash_throughput_bytes = Counter::with_opts(Opts::new(
        "cine_hash_throughput_bytes",
        "Total bytes hashed",
    ))
    .unwrap();
    let scan_duration_seconds = Histogram::with_opts(HistogramOpts::new(
        "cine_scan_duration_seconds",
        "Duration of directory scans",
    ))
    .unwrap();

    let scrape_requests_total = Counter::with_opts(Opts::new(
        "cine_scrape_requests_total",
        "Total number of scrape requests",
    ))
    .unwrap();

    REGISTRY.register(Box::new(active_tasks.clone())).unwrap();
    REGISTRY
        .register(Box::new(hash_throughput_bytes.clone()))
        .unwrap();
    REGISTRY
        .register(Box::new(scan_duration_seconds.clone()))
        .unwrap();
    REGISTRY
        .register(Box::new(scrape_requests_total.clone()))
        .unwrap();

    Metrics {
        active_tasks,
        hash_throughput_bytes,
        scan_duration_seconds,
        scrape_requests_total,
    }
});
