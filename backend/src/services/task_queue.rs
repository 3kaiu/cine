// 任务队列系统
// 支持长时间运行任务的暂停/恢复/取消

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Instant;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc, RwLock};
use tracing::{debug, info, warn};
use uuid::Uuid;

/// 任务状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, utoipa::ToSchema)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TaskStatus {
    /// 等待执行
    Pending,
    /// 正在运行
    Running {
        progress: f64,
        message: Option<String>,
    },
    /// 已暂停
    Paused { progress: f64 },
    /// 已完成
    Completed {
        duration_secs: f64,
        result: Option<String>,
    },
    /// 执行失败
    Failed { error: String },
    /// 已取消
    Cancelled,
}

/// 任务类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    Scan,
    Hash,
    Scrape,
    Rename,
    BatchMove,
    BatchCopy,
    Cleanup,
    Custom(String),
}

impl std::fmt::Display for TaskType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskType::Scan => write!(f, "scan"),
            TaskType::Hash => write!(f, "hash"),
            TaskType::Scrape => write!(f, "scrape"),
            TaskType::Rename => write!(f, "rename"),
            TaskType::BatchMove => write!(f, "batch_move"),
            TaskType::BatchCopy => write!(f, "batch_copy"),
            TaskType::Cleanup => write!(f, "cleanup"),
            TaskType::Custom(s) => write!(f, "custom:{}", s),
        }
    }
}

/// 任务控制命令
#[derive(Debug, Clone)]
pub enum TaskCommand {
    Pause,
    Resume,
    Cancel,
}

/// 任务信息
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct TaskInfo {
    pub id: String,
    pub task_type: TaskType,
    pub status: TaskStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub description: Option<String>,
}

/// 任务上下文，传递给任务执行函数
/// 用于报告进度和检查取消/暂停状态
pub struct TaskContext {
    task_id: String,
    command_rx: broadcast::Receiver<TaskCommand>,
    status_tx: mpsc::Sender<TaskStatusUpdate>,
    is_paused: Arc<RwLock<bool>>,
    is_cancelled: Arc<RwLock<bool>>,
}

impl TaskContext {
    /// 报告任务进度
    pub async fn report_progress(&self, progress: f64, message: Option<&str>) {
        let _ = self
            .status_tx
            .send(TaskStatusUpdate {
                task_id: self.task_id.clone(),
                status: TaskStatus::Running {
                    progress,
                    message: message.map(String::from),
                },
            })
            .await;
    }

    /// 检查任务是否被取消
    pub async fn is_cancelled(&self) -> bool {
        *self.is_cancelled.read().await
    }

    /// 检查任务是否被暂停，如果暂停则阻塞等待恢复
    pub async fn check_pause(&mut self) -> bool {
        loop {
            if *self.is_cancelled.read().await {
                return true; // 取消时返回 true
            }

            if !*self.is_paused.read().await {
                return false; // 未暂停，继续执行
            }

            // 等待恢复命令
            match self.command_rx.recv().await {
                Ok(TaskCommand::Resume) => {
                    let mut paused = self.is_paused.write().await;
                    *paused = false;
                    return false;
                }
                Ok(TaskCommand::Cancel) => {
                    let mut cancelled = self.is_cancelled.write().await;
                    *cancelled = true;
                    return true;
                }
                _ => {
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }
        }
    }

    /// 获取任务 ID
    pub fn task_id(&self) -> &str {
        &self.task_id
    }

    /// 复制一份上下文用于并行子任务
    /// 每个副本都会维护自己的命令接收器，能够独立接收暂停/恢复/取消指令
    pub fn duplicate(&self) -> Self {
        Self {
            task_id: self.task_id.clone(),
            command_rx: self.command_rx.resubscribe(),
            status_tx: self.status_tx.clone(),
            is_paused: self.is_paused.clone(),
            is_cancelled: self.is_cancelled.clone(),
        }
    }
}

#[derive(Debug)]
struct TaskStatusUpdate {
    task_id: String,
    status: TaskStatus,
}

/// 任务句柄，用于内部管理
struct TaskHandle {
    info: Arc<RwLock<TaskInfo>>,
    command_tx: broadcast::Sender<TaskCommand>,
    is_paused: Arc<RwLock<bool>>,
    is_cancelled: Arc<RwLock<bool>>,
}

/// 任务队列
pub struct TaskQueue {
    tasks: DashMap<String, TaskHandle>,
    max_concurrent: usize,
    active_count: Arc<RwLock<usize>>,
}

impl TaskQueue {
    /// 创建新的任务队列
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            tasks: DashMap::new(),
            max_concurrent,
            active_count: Arc::new(RwLock::new(0)),
        }
    }

    /// 提交任务
    pub async fn submit<F, Fut>(
        &self,
        task_type: TaskType,
        description: Option<String>,
        task_fn: F,
    ) -> String
    where
        F: FnOnce(TaskContext) -> Fut + Send + 'static,
        Fut: Future<Output = anyhow::Result<Option<String>>> + Send,
    {
        let task_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now();

        let info = TaskInfo {
            id: task_id.clone(),
            task_type: task_type.clone(),
            status: TaskStatus::Pending,
            created_at: now,
            updated_at: now,
            description,
        };

        let (command_tx, command_rx) = broadcast::channel(16);
        let (status_tx, mut status_rx) = mpsc::channel(32);
        let is_paused = Arc::new(RwLock::new(false));
        let is_cancelled = Arc::new(RwLock::new(false));
        let info_arc = Arc::new(RwLock::new(info));

        let handle = TaskHandle {
            info: info_arc.clone(),
            command_tx: command_tx.clone(),
            is_paused: is_paused.clone(),
            is_cancelled: is_cancelled.clone(),
        };

        self.tasks.insert(task_id.clone(), handle);

        // 创建任务上下文
        let ctx = TaskContext {
            task_id: task_id.clone(),
            command_rx,
            status_tx,
            is_paused: is_paused.clone(),
            is_cancelled: is_cancelled.clone(),
        };

        let info_for_task = info_arc.clone();
        let task_id_clone = task_id.clone();
        let active_count = self.active_count.clone();

        // 启动后台任务
        tokio::spawn(async move {
            // 等待并发槽位
            {
                let mut count = active_count.write().await;
                *count += 1;
            }

            let start_time = Instant::now();

            // 更新为运行状态
            {
                let mut info = info_for_task.write().await;
                info.status = TaskStatus::Running {
                    progress: 0.0,
                    message: Some("开始执行".to_string()),
                };
                info.updated_at = chrono::Utc::now();
            }

            info!(task_id = %task_id_clone, task_type = %task_type, "任务开始执行");

            // 状态更新监听器
            let info_for_status = info_for_task.clone();
            tokio::spawn(async move {
                while let Some(update) = status_rx.recv().await {
                    let mut info = info_for_status.write().await;
                    info.status = update.status;
                    info.updated_at = chrono::Utc::now();
                }
            });

            // 执行任务
            let result = task_fn(ctx).await;

            let duration = start_time.elapsed().as_secs_f64();

            // 更新最终状态
            {
                let mut info = info_for_task.write().await;
                info.status = match result {
                    Ok(result_msg) => {
                        info!(task_id = %task_id_clone, duration = %duration, "任务完成");
                        TaskStatus::Completed {
                            duration_secs: duration,
                            result: result_msg,
                        }
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        if error_msg.contains("cancelled") || error_msg.contains("取消") {
                            info!(task_id = %task_id_clone, "任务已取消");
                            TaskStatus::Cancelled
                        } else {
                            warn!(task_id = %task_id_clone, error = %error_msg, "任务失败");
                            TaskStatus::Failed { error: error_msg }
                        }
                    }
                };
                info.updated_at = chrono::Utc::now();
            }

            // 释放并发槽位
            {
                let mut count = active_count.write().await;
                *count -= 1;
            }
        });

        task_id
    }

    /// 暂停任务
    pub async fn pause(&self, task_id: &str) -> anyhow::Result<()> {
        if let Some(handle) = self.tasks.get(task_id) {
            {
                let mut paused = handle.is_paused.write().await;
                *paused = true;
            }
            let _ = handle.command_tx.send(TaskCommand::Pause);

            let mut info = handle.info.write().await;
            if let TaskStatus::Running { progress, .. } = &info.status {
                info.status = TaskStatus::Paused {
                    progress: *progress,
                };
                info.updated_at = chrono::Utc::now();
            }

            debug!(task_id = %task_id, "任务已暂停");
            Ok(())
        } else {
            anyhow::bail!("任务不存在: {}", task_id)
        }
    }

    /// 恢复任务
    pub async fn resume(&self, task_id: &str) -> anyhow::Result<()> {
        if let Some(handle) = self.tasks.get(task_id) {
            {
                let mut paused = handle.is_paused.write().await;
                *paused = false;
            }
            let _ = handle.command_tx.send(TaskCommand::Resume);

            let mut info = handle.info.write().await;
            if let TaskStatus::Paused { progress } = &info.status {
                info.status = TaskStatus::Running {
                    progress: *progress,
                    message: Some("已恢复".to_string()),
                };
                info.updated_at = chrono::Utc::now();
            }

            debug!(task_id = %task_id, "任务已恢复");
            Ok(())
        } else {
            anyhow::bail!("任务不存在: {}", task_id)
        }
    }

    /// 取消任务
    pub async fn cancel(&self, task_id: &str) -> anyhow::Result<()> {
        if let Some(handle) = self.tasks.get(task_id) {
            {
                let mut cancelled = handle.is_cancelled.write().await;
                *cancelled = true;
            }
            let _ = handle.command_tx.send(TaskCommand::Cancel);

            let mut info = handle.info.write().await;
            info.status = TaskStatus::Cancelled;
            info.updated_at = chrono::Utc::now();

            debug!(task_id = %task_id, "任务已取消");
            Ok(())
        } else {
            anyhow::bail!("任务不存在: {}", task_id)
        }
    }

    /// 获取任务状态
    pub async fn get_status(&self, task_id: &str) -> Option<TaskInfo> {
        if let Some(handle) = self.tasks.get(task_id) {
            Some(handle.info.read().await.clone())
        } else {
            None
        }
    }

    /// 列出所有任务
    pub async fn list_tasks(&self) -> Vec<TaskInfo> {
        let mut tasks = Vec::new();
        for entry in self.tasks.iter() {
            let info = entry.value().info.read().await.clone();
            tasks.push(info);
        }
        // 按创建时间倒序
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        tasks
    }

    /// 列出指定类型的任务
    pub async fn list_tasks_by_type(&self, task_type: &TaskType) -> Vec<TaskInfo> {
        let mut tasks = Vec::new();
        for entry in self.tasks.iter() {
            let info = entry.value().info.read().await.clone();
            if &info.task_type == task_type {
                tasks.push(info);
            }
        }
        tasks.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        tasks
    }

    /// 清理已完成/失败/取消的任务
    pub async fn cleanup_finished(&self) {
        let mut to_remove = Vec::new();

        for entry in self.tasks.iter() {
            let info = entry.value().info.read().await;
            match &info.status {
                TaskStatus::Completed { .. }
                | TaskStatus::Failed { .. }
                | TaskStatus::Cancelled => {
                    to_remove.push(entry.key().clone());
                }
                _ => {}
            }
        }

        for task_id in to_remove {
            self.tasks.remove(&task_id);
        }
    }

    /// 获取活跃任务数
    pub async fn active_count(&self) -> usize {
        *self.active_count.read().await
    }
}

impl Default for TaskQueue {
    fn default() -> Self {
        Self::new(4) // 默认最大 4 个并发任务
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_task_lifecycle() {
        let queue = TaskQueue::new(2);

        // 提交任务
        let task_id = queue
            .submit(
                TaskType::Custom("test".to_string()),
                Some("测试任务".to_string()),
                |mut ctx| async move {
                    for i in 0..10 {
                        if ctx.check_pause().await {
                            anyhow::bail!("任务已取消");
                        }
                        ctx.report_progress(i as f64 * 10.0, Some(&format!("步骤 {}/10", i + 1)))
                            .await;
                        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                    }
                    Ok(Some("完成".to_string()))
                },
            )
            .await;

        // 等待任务完成
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

        let info = queue.get_status(&task_id).await.unwrap();
        assert!(matches!(info.status, TaskStatus::Completed { .. }));
    }

    #[tokio::test]
    async fn test_task_cancel() {
        let queue = TaskQueue::new(2);

        let task_id = queue
            .submit(
                TaskType::Custom("cancel_test".to_string()),
                None,
                |mut ctx| async move {
                    loop {
                        if ctx.check_pause().await {
                            anyhow::bail!("任务已取消");
                        }
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                },
            )
            .await;

        // 等待任务开始
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        // 取消任务
        queue.cancel(&task_id).await.unwrap();

        // 等待任务响应取消
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        let info = queue.get_status(&task_id).await.unwrap();
        assert!(matches!(info.status, TaskStatus::Cancelled));
    }
}
