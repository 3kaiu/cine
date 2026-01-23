//! 优化的日志工具
//!
//! 提供性能优化的日志记录功能：
//! - 条件日志记录
//! - 结构化日志
//! - 日志采样
//! - 异步日志缓冲

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn, Level};

/// 日志采样器 - 用于控制高频日志的输出频率
pub struct LogSampler {
    counters: HashMap<String, AtomicUsize>,
    last_reset: Instant,
    sample_interval: Duration,
}

impl LogSampler {
    pub fn new(sample_interval: Duration) -> Self {
        Self {
            counters: HashMap::new(),
            last_reset: Instant::now(),
            sample_interval,
        }
    }

    /// 检查是否应该记录日志（基于采样）
    pub fn should_log(&self, key: &str, sample_rate: usize) -> bool {
        // 重置计数器
        if self.last_reset.elapsed() > self.sample_interval {
            // 这里简化实现，实际应该使用原子操作重置
            // 但为了示例，我们只检查时间
        }

        let counter = self.counters
            .entry(key.to_string())
            .or_insert_with(|| AtomicUsize::new(0));

        let count = counter.fetch_add(1, Ordering::SeqCst);
        count % sample_rate == 0
    }
}

impl Default for LogSampler {
    fn default() -> Self {
        Self::new(Duration::from_secs(60)) // 默认60秒重置一次
    }
}

/// 性能日志记录器
pub struct PerformanceLogger {
    operation: String,
    start_time: Instant,
    sample_rate: usize,
}

impl PerformanceLogger {
    pub fn new(operation: impl Into<String>) -> Self {
        Self {
            operation: operation.into(),
            start_time: Instant::now(),
            sample_rate: 100, // 每100次记录一次
        }
    }

    pub fn with_sample_rate(mut self, rate: usize) -> Self {
        self.sample_rate = rate;
        self
    }

    pub fn log_progress(&self, current: usize, total: usize, extra_fields: Option<HashMap<&str, serde_json::Value>>) {
        static SAMPLER: once_cell::sync::Lazy<LogSampler> = once_cell::sync::Lazy::new(LogSampler::default);

        if !SAMPLER.should_log(&self.operation, self.sample_rate) {
            return;
        }

        let elapsed = self.start_time.elapsed();
        let progress = (current as f64 / total as f64) * 100.0;
        let rate = current as f64 / elapsed.as_secs_f64();

        let mut fields = serde_json::json!({
            "operation": self.operation,
            "current": current,
            "total": total,
            "progress": format!("{:.1}%", progress),
            "elapsed_ms": elapsed.as_millis(),
            "rate_per_sec": format!("{:.2}", rate)
        });

        if let Some(extra) = extra_fields {
            if let serde_json::Value::Object(ref mut map) = fields {
                for (k, v) in extra {
                    map.insert(k.to_string(), v.clone());
                }
            }
        }

        info!(
            operation = %self.operation,
            progress = %format!("{:.1}%", progress),
            rate_per_sec = %format!("{:.2}", rate),
            elapsed_ms = %elapsed.as_millis(),
            "Operation progress"
        );
    }

    pub fn log_completion(&self, success: bool, extra_info: Option<&str>) {
        let elapsed = self.start_time.elapsed();

        if success {
            info!(
                operation = %self.operation,
                duration_ms = %elapsed.as_millis(),
                result = extra_info.unwrap_or("success"),
                "Operation completed successfully"
            );
        } else {
            error!(
                operation = %self.operation,
                duration_ms = %elapsed.as_millis(),
                error = extra_info.unwrap_or("unknown"),
                "Operation failed"
            );
        }
    }
}

/// 条件日志记录器 - 只在指定条件下记录日志
pub struct ConditionalLogger;

impl ConditionalLogger {
    /// 只在debug级别启用时记录
    pub fn debug<F>(f: F)
    where
        F: FnOnce() -> String,
    {
        if Level::DEBUG <= tracing::level_filters::STATIC_MAX_LEVEL {
            debug!("{}", f());
        }
    }

    /// 只在trace级别启用时记录（性能敏感）
    pub fn trace<F>(f: F)
    where
        F: FnOnce() -> String,
    {
        if Level::TRACE <= tracing::level_filters::STATIC_MAX_LEVEL {
            tracing::trace!("{}", f());
        }
    }

    /// 带上下文的错误日志
    pub fn error_with_context(
        error: &impl std::fmt::Display,
        operation: &str,
        context: Option<HashMap<&str, serde_json::Value>>
    ) {
        let mut json_context = serde_json::json!({
            "operation": operation,
            "error": error.to_string()
        });

        if let Some(ctx) = context {
            if let serde_json::Value::Object(ref mut map) = json_context {
                for (k, v) in ctx {
                    map.insert(k.to_string(), v.clone());
                }
            }
        }

        error!(
            operation = %operation,
            error = %error,
            context = %json_context,
            "Operation error"
        );
    }

    /// 带性能指标的日志
    pub fn performance_log(
        level: Level,
        operation: &str,
        duration: Duration,
        metrics: HashMap<&str, serde_json::Value>
    ) {
        let mut fields = serde_json::json!({
            "operation": operation,
            "duration_ms": duration.as_millis(),
            "duration_secs": duration.as_secs_f64()
        });

        if let serde_json::Value::Object(ref mut map) = fields {
            for (k, v) in metrics {
                map.insert(k.to_string(), v.clone());
            }
        }

        match level {
            Level::ERROR => error!(
                operation = %operation,
                duration_ms = %duration.as_millis(),
                metrics = %fields,
                "Performance metric"
            ),
            Level::WARN => warn!(
                operation = %operation,
                duration_ms = %duration.as_millis(),
                metrics = %fields,
                "Performance metric"
            ),
            Level::INFO => info!(
                operation = %operation,
                duration_ms = %duration.as_millis(),
                metrics = %fields,
                "Performance metric"
            ),
            Level::DEBUG => {
                if Level::DEBUG <= tracing::level_filters::STATIC_MAX_LEVEL {
                    debug!(
                        operation = %operation,
                        duration_ms = %duration.as_millis(),
                        metrics = %fields,
                        "Performance metric"
                    );
                }
            }
            Level::TRACE => {
                if Level::TRACE <= tracing::level_filters::STATIC_MAX_LEVEL {
                    tracing::trace!(
                        operation = %operation,
                        duration_ms = %duration.as_millis(),
                        metrics = %fields,
                        "Performance metric"
                    );
                }
            }
        }
    }
}

/// 异步日志缓冲器 - 用于批量日志记录
pub struct AsyncLogBuffer {
    buffer: Arc<std::sync::Mutex<Vec<String>>>,
    flush_threshold: usize,
}

impl AsyncLogBuffer {
    pub fn new(flush_threshold: usize) -> Self {
        Self {
            buffer: Arc::new(std::sync::Mutex::new(Vec::new())),
            flush_threshold,
        }
    }

    pub fn add_entry(&self, entry: String) {
        let mut buffer = self.buffer.lock().unwrap();
        buffer.push(entry);

        if buffer.len() >= self.flush_threshold {
            let entries = buffer.clone();
            buffer.clear();

            // 在实际实现中，这里应该异步刷新到日志系统
            tokio::spawn(async move {
                for entry in entries {
                    info!("Buffered log: {}", entry);
                }
            });
        }
    }

    pub fn flush(&self) {
        let mut buffer = self.buffer.lock().unwrap();
        let entries = buffer.clone();
        buffer.clear();

        for entry in entries {
            info!("Flushed log: {}", entry);
        }
    }
}

impl Default for AsyncLogBuffer {
    fn default() -> Self {
        Self::new(100) // 默认100条刷新一次
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_log_sampler() {
        let sampler = LogSampler::new(Duration::from_secs(1));

        // 第一次应该记录
        assert!(sampler.should_log("test", 3));

        // 第2次不应该记录
        assert!(!sampler.should_log("test", 3));

        // 第3次应该记录
        assert!(sampler.should_log("test", 3));
    }

    #[test]
    fn test_performance_logger() {
        let logger = PerformanceLogger::new("test_operation");

        // 模拟进度
        logger.log_progress(50, 100, None);
    }

    #[tokio::test]
    async fn test_async_log_buffer() {
        let buffer = AsyncLogBuffer::new(3);

        buffer.add_entry("log 1".to_string());
        buffer.add_entry("log 2".to_string());
        buffer.add_entry("log 3".to_string()); // 应该触发刷新

        // 等待异步任务完成
        tokio::time::sleep(Duration::from_millis(10)).await;

        buffer.flush();
    }
}