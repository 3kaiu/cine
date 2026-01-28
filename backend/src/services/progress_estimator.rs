//! 智能进度估算系统
//!
//! 提供精确的实时进度反馈，包括：
//! - 基于历史数据的性能预测
//! - 自适应进度更新频率
//! - 多阶段任务进度分解
//! - 异常情况的进度修正

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// 任务阶段定义
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum TaskStage {
    Initialization,
    Processing,
    Finalization,
    Cleanup,
}

/// 进度估算配置
#[derive(Debug, Clone)]
pub struct ProgressConfig {
    /// 最小进度更新间隔（毫秒）
    pub min_update_interval_ms: u64,
    /// 最大进度更新间隔（毫秒）
    pub max_update_interval_ms: u64,
    /// 进度变化阈值（超过此值才更新）
    pub progress_change_threshold: f64,
    /// 是否启用历史数据预测
    pub enable_prediction: bool,
    /// 历史数据保留时间（小时）
    pub history_retention_hours: u64,
}

/// 任务进度状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressState {
    pub current_stage: TaskStage,
    pub stage_progress: f64,   // 当前阶段进度 (0.0-1.0)
    pub overall_progress: f64, // 整体进度 (0.0-1.0)
    pub estimated_time_remaining: Option<Duration>,
    pub current_rate: f64,        // 当前处理速率
    pub average_rate: f64,        // 平均处理速率
    pub processed_items: u64,     // 已处理项目数
    pub total_items: Option<u64>, // 总项目数
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub last_update: chrono::DateTime<chrono::Utc>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// 历史性能数据
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PerformanceHistory {
    task_type: String,
    average_duration: Duration,
    average_rate: f64,
    success_rate: f64,
    sample_count: u64,
    last_updated: chrono::DateTime<chrono::Utc>,
}

/// 多阶段任务配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiStageConfig {
    pub stages: Vec<TaskStageConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStageConfig {
    pub stage: TaskStage,
    pub name: String,
    pub weight: f64, // 该阶段在总任务中的权重 (0.0-1.0)
    pub estimated_duration: Option<Duration>,
    pub parallelizable: bool, // 是否可以并行处理
}

/// 智能进度估算器
#[derive(Debug)]
pub struct ProgressEstimator {
    config: ProgressConfig,
    performance_history: Arc<RwLock<HashMap<String, PerformanceHistory>>>,
    active_tasks: Arc<RwLock<HashMap<String, ProgressState>>>,
}

impl ProgressEstimator {
    pub fn new(config: ProgressConfig) -> Self {
        Self {
            config,
            performance_history: Arc::new(RwLock::new(HashMap::new())),
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 开始任务进度跟踪
    pub async fn start_task(
        &self,
        task_id: String,
        task_type: String,
        total_items: Option<u64>,
        multi_stage_config: Option<MultiStageConfig>,
    ) -> ProgressState {
        let now = chrono::Utc::now();

        // 获取历史性能数据
        let history = if self.config.enable_prediction {
            self.performance_history
                .read()
                .await
                .get(&task_type)
                .cloned()
        } else {
            None
        };

        let initial_state = ProgressState {
            current_stage: TaskStage::Initialization,
            stage_progress: 0.0,
            overall_progress: 0.0,
            estimated_time_remaining: history.as_ref().map(|h| h.average_duration),
            current_rate: 0.0,
            average_rate: history.as_ref().map(|h| h.average_rate).unwrap_or(0.0),
            processed_items: 0,
            total_items,
            start_time: now,
            last_update: now,
            metadata: {
                let mut meta = HashMap::new();
                meta.insert(
                    "task_type".to_string(),
                    serde_json::Value::String(task_type.clone()),
                );
                if let Some(config) = multi_stage_config {
                    meta.insert(
                        "stages".to_string(),
                        serde_json::to_value(config).unwrap_or_default(),
                    );
                }
                meta
            },
        };

        self.active_tasks
            .write()
            .await
            .insert(task_id, initial_state.clone());
        initial_state
    }

    /// 更新任务进度
    pub async fn update_progress(
        &self,
        task_id: &str,
        processed_items: u64,
        current_stage: Option<TaskStage>,
        stage_progress: Option<f64>,
        metadata: Option<HashMap<String, serde_json::Value>>,
    ) -> Option<ProgressState> {
        let mut tasks = self.active_tasks.write().await;
        let task = tasks.get_mut(task_id)?;

        let now = chrono::Utc::now();
        let elapsed = now.signed_duration_since(task.start_time);
        let time_since_last_update = now.signed_duration_since(task.last_update);

        // 更新基本信息
        task.processed_items = processed_items;
        task.last_update = now;

        if let Some(stage) = current_stage {
            task.current_stage = stage;
        }

        if let Some(progress) = stage_progress {
            task.stage_progress = progress.clamp(0.0, 1.0);
        }

        // 更新元数据
        if let Some(meta) = metadata {
            for (key, value) in meta {
                task.metadata.insert(key, value);
            }
        }

        // 计算当前处理速率
        if elapsed.num_milliseconds() > 0 {
            task.current_rate =
                processed_items as f64 / (elapsed.num_milliseconds() as f64 / 1000.0);
        }

        // 计算平均处理速率
        let total_processed = task.processed_items as f64;
        let total_time_seconds = elapsed.num_seconds() as f64;
        if total_time_seconds > 0.0 {
            task.average_rate = total_processed / total_time_seconds;
        }

        // 计算整体进度
        task.overall_progress = self.calculate_overall_progress(task);

        // 估算剩余时间
        task.estimated_time_remaining = self.estimate_time_remaining(task);

        Some(task.clone())
    }

    /// 检查是否应该发送进度更新
    pub async fn should_update_progress(&self, task_id: &str, new_progress: f64) -> bool {
        let tasks = self.active_tasks.read().await;
        let task = match tasks.get(task_id) {
            Some(t) => t,
            None => return true, // 新任务总是更新
        };

        let now = chrono::Utc::now();
        let time_since_last_update = now
            .signed_duration_since(task.last_update)
            .num_milliseconds() as u64;

        // 检查时间间隔
        if time_since_last_update < self.config.min_update_interval_ms {
            return false;
        }

        if time_since_last_update >= self.config.max_update_interval_ms {
            return true;
        }

        // 检查进度变化
        let progress_change = (new_progress - task.overall_progress).abs();
        progress_change >= self.config.progress_change_threshold
    }

    /// 完成任务
    pub async fn complete_task(&self, task_id: &str, success: bool) -> Option<ProgressState> {
        let mut tasks = self.active_tasks.write().await;
        let task = tasks.remove(task_id)?;

        let final_progress = if success { 1.0 } else { task.overall_progress };

        // 记录历史性能数据
        if self.config.enable_prediction && success {
            self.record_performance_history(&task).await;
        }

        Some(ProgressState {
            overall_progress: final_progress,
            estimated_time_remaining: Some(Duration::from_secs(0)),
            last_update: chrono::Utc::now(),
            ..task
        })
    }

    /// 获取任务状态
    pub async fn get_task_progress(&self, task_id: &str) -> Option<ProgressState> {
        self.active_tasks.read().await.get(task_id).cloned()
    }

    /// 获取所有活跃任务
    pub async fn get_all_active_tasks(&self) -> Vec<(String, ProgressState)> {
        self.active_tasks
            .read()
            .await
            .iter()
            .map(|(id, state)| (id.clone(), state.clone()))
            .collect()
    }

    // 私有方法

    /// 计算整体进度（考虑多阶段）
    fn calculate_overall_progress(&self, task: &ProgressState) -> f64 {
        // 检查是否有多阶段配置
        if let Some(stages_value) = task.metadata.get("stages") {
            if let Ok(multi_stage) =
                serde_json::from_value::<MultiStageConfig>(stages_value.clone())
            {
                return self.calculate_multi_stage_progress(task, &multi_stage);
            }
        }

        // 单阶段任务
        match task.total_items {
            Some(total) if total > 0 => {
                (task.processed_items as f64 / total as f64).clamp(0.0, 1.0)
            }
            _ => task.stage_progress, // 如果不知道总数，使用阶段进度
        }
    }

    /// 计算多阶段任务的整体进度
    fn calculate_multi_stage_progress(
        &self,
        task: &ProgressState,
        config: &MultiStageConfig,
    ) -> f64 {
        let mut total_progress = 0.0;

        for stage_config in &config.stages {
            if stage_config.stage == task.current_stage {
                // 当前阶段：使用实际进度
                total_progress += stage_config.weight * task.stage_progress;
                break;
            } else {
                // 已完成的阶段：贡献完整权重
                total_progress += stage_config.weight;
            }
        }

        total_progress.clamp(0.0, 1.0)
    }

    /// 估算剩余时间
    fn estimate_time_remaining(&self, task: &ProgressState) -> Option<Duration> {
        if task.overall_progress >= 1.0 {
            return Some(Duration::from_secs(0));
        }

        let remaining_progress = 1.0 - task.overall_progress;

        // 使用平均速率估算
        if task.average_rate > 0.0 {
            let remaining_seconds = remaining_progress / task.average_rate;
            Some(Duration::from_secs_f64(remaining_seconds.max(0.0)))
        } else {
            // 如果没有平均速率，使用历史数据
            let _task_type = task
                .metadata
                .get("task_type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            // 这里可以从performance_history获取预测时间
            None
        }
    }

    /// 记录性能历史数据
    async fn record_performance_history(&self, task: &ProgressState) {
        let task_type = match task.metadata.get("task_type") {
            Some(serde_json::Value::String(t)) => t.clone(),
            _ => "unknown".to_string(),
        };

        let elapsed = chrono::Utc::now().signed_duration_since(task.start_time);
        let duration = Duration::from_millis(elapsed.num_milliseconds() as u64);

        let mut history = self.performance_history.write().await;
        let entry = history.entry(task_type).or_insert(PerformanceHistory {
            task_type: "".to_string(),
            average_duration: duration,
            average_rate: task.average_rate,
            success_rate: 1.0,
            sample_count: 0,
            last_updated: chrono::Utc::now(),
        });

        // 更新移动平均值
        let alpha = 0.1; // 学习率
        let old_weight = entry.sample_count as f64;
        let new_weight = old_weight + 1.0;

        entry.average_duration = Duration::from_secs_f64(
            (entry.average_duration.as_secs_f64() * old_weight + duration.as_secs_f64())
                / new_weight,
        );
        entry.average_rate = (entry.average_rate * old_weight + task.average_rate) / new_weight;
        entry.success_rate = (entry.success_rate * old_weight + 1.0) / new_weight;
        entry.sample_count += 1;
        entry.last_updated = chrono::Utc::now();
    }

    /// 清理过期历史数据
    pub async fn cleanup_expired_history(&self) {
        let cutoff = chrono::Utc::now()
            - chrono::Duration::hours(self.config.history_retention_hours as i64);

        self.performance_history
            .write()
            .await
            .retain(|_, history| history.last_updated > cutoff);
    }
}

impl Default for ProgressConfig {
    fn default() -> Self {
        Self {
            min_update_interval_ms: 100,     // 最少100ms更新一次
            max_update_interval_ms: 5000,    // 最多5秒更新一次
            progress_change_threshold: 0.01, // 进度变化1%才更新
            enable_prediction: true,
            history_retention_hours: 168, // 保留7天历史
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::sleep;

    #[tokio::test]
    async fn test_progress_estimator() {
        let estimator = ProgressEstimator::new(ProgressConfig::default());

        // 开始任务
        let initial_state = estimator
            .start_task("test_task".to_string(), "hash".to_string(), Some(100), None)
            .await;

        assert_eq!(initial_state.processed_items, 0);
        assert_eq!(initial_state.overall_progress, 0.0);

        // 模拟进度更新
        sleep(Duration::from_millis(10)).await;

        let updated_state = estimator
            .update_progress("test_task", 50, None, None, None)
            .await;

        assert!(updated_state.is_some());
        let state = updated_state.unwrap();
        assert_eq!(state.processed_items, 50);
        assert_eq!(state.overall_progress, 0.5);

        // 检查是否应该更新进度
        assert!(estimator.should_update_progress("test_task", 0.6).await);
        assert!(!estimator.should_update_progress("test_task", 0.501).await); // 变化不够大

        // 完成任务
        let final_state = estimator.complete_task("test_task", true).await;
        assert!(final_state.is_some());
        assert_eq!(final_state.unwrap().overall_progress, 1.0);
    }
}
