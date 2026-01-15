// 任务队列系统
// 支持长时间运行任务的暂停/恢复/取消

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Instant;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc, RwLock};
use tracing::debug;
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
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, utoipa::ToSchema)]
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
    #[allow(dead_code)]
    pub async fn is_cancelled(&self) -> bool {
        *self.is_cancelled.read().await
    }

    /// 检查任务是否被暂停，如果暂停则阻塞等待恢复
    pub async fn check_pause(&mut self) -> bool {
        loop {
            if *self.is_cancelled.read().await {
                return true;
            }

            if !*self.is_paused.read().await {
                return false;
            }

            // 发送一次数据库更新：状态变为已暂停
            // (实际逻辑在 TaskQueue 中处理命令时已经更新了 DB，这里主要是阻塞)

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
    #[allow(dead_code)]
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
pub struct TaskStatusUpdate {
    #[allow(dead_code)]
    pub task_id: String,
    pub status: TaskStatus,
}

/// 任务句柄，用于内部管理
struct TaskHandle {
    info: Arc<RwLock<TaskInfo>>,
    command_tx: broadcast::Sender<TaskCommand>,
    is_paused: Arc<RwLock<bool>>,
    is_cancelled: Arc<RwLock<bool>>,
}

/// 任务执行器接口
pub trait TaskExecutor: Send + Sync {
    fn execute(
        &self,
        ctx: TaskContext,
        payload: serde_json::Value,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>>;
}

/// 任务队列
pub struct TaskQueue {
    db: sqlx::SqlitePool,
    executors: DashMap<TaskType, Arc<dyn TaskExecutor>>,
    tasks: DashMap<String, TaskHandle>, // 运行时句柄 (用于控制活跃任务)
    max_concurrent: usize,
    active_count: Arc<RwLock<usize>>,
    node_id: String,
}

impl TaskQueue {
    /// 创建新的任务队列
    pub fn new(db: sqlx::SqlitePool, max_concurrent: usize) -> Self {
        Self {
            db,
            executors: DashMap::new(),
            tasks: DashMap::new(),
            max_concurrent,
            active_count: Arc::new(RwLock::new(0)),
            node_id: Uuid::new_v4().to_string(), // 当前节点 ID
        }
    }

    /// 注册任务执行器
    pub fn register_executor(&self, task_type: TaskType, executor: Arc<dyn TaskExecutor>) {
        self.executors.insert(task_type, executor);
    }

    /// 提交任务到数据库
    pub async fn submit(
        &self,
        task_type: TaskType,
        description: Option<String>,
        payload: serde_json::Value,
    ) -> anyhow::Result<String> {
        let task_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let payload_json = serde_json::to_string(&payload)?;

        // 插入数据库
        sqlx::query(
            "INSERT INTO tasks (id, task_type, status, description, payload, progress, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&task_id)
        .bind(task_type.to_string())
        .bind("pending")
        .bind(description)
        .bind(payload_json)
        .bind(0.0)
        .bind(now)
        .bind(now)
        .execute(&self.db)
        .await?;

        // 尝试调度
        self.dispatch(task_id.clone()).await?;

        Ok(task_id)
    }

    /// 调度任务执行
    pub async fn dispatch(&self, task_id: String) -> anyhow::Result<()> {
        // 检查并发限制
        {
            let count = self.active_count.read().await;
            if *count >= self.max_concurrent {
                return Ok(()); // 达到上限，等待下一次调度
            }
        }

        // 获取任务信息
        let task: crate::models::DbTask =
            sqlx::query_as("SELECT * FROM tasks WHERE id = ? AND status = 'pending'")
                .bind(&task_id)
                .fetch_one(&self.db)
                .await?;

        let task_type_str = task.task_type.clone();
        let task_type = match task_type_str.as_str() {
            "scan" => TaskType::Scan,
            "hash" => TaskType::Hash,
            "scrape" => TaskType::Scrape,
            "rename" => TaskType::Rename,
            "batch_move" => TaskType::BatchMove,
            "batch_copy" => TaskType::BatchCopy,
            "cleanup" => TaskType::Cleanup,
            _ => TaskType::Custom(task_type_str),
        };

        let executor = match self.executors.get(&task_type) {
            Some(e) => e.clone(),
            None => return Ok(()), // 未注册执行器，可能由其他节点处理
        };

        let (command_tx, command_rx) = broadcast::channel(16);
        let (status_tx, mut status_rx) = mpsc::channel(32);
        let is_paused = Arc::new(RwLock::new(false));
        let is_cancelled = Arc::new(RwLock::new(false));

        let info = TaskInfo {
            id: task_id.clone(),
            task_type: task_type.clone(),
            status: TaskStatus::Pending,
            created_at: task.created_at,
            updated_at: task.updated_at,
            description: task.description.clone(),
        };

        let info_arc = Arc::new(RwLock::new(info));
        let handle = TaskHandle {
            info: info_arc.clone(),
            command_tx: command_tx.clone(),
            is_paused: is_paused.clone(),
            is_cancelled: is_cancelled.clone(),
        };

        self.tasks.insert(task_id.clone(), handle);

        let ctx = TaskContext {
            task_id: task_id.clone(),
            command_rx,
            status_tx,
            is_paused: is_paused.clone(),
            is_cancelled: is_cancelled.clone(),
        };

        let db = self.db.clone();
        let node_id = self.node_id.clone();
        let active_count = self.active_count.clone();
        let payload: serde_json::Value =
            serde_json::from_str(&task.payload.unwrap_or_else(|| "{}".to_string()))?;
        let task_id_clone = task_id.clone();
        tracing::info!(task_id = %task_id, task_type = %task.task_type, "Task submitted");

        tokio::spawn(async move {
            crate::services::metrics::METRICS.active_tasks.inc();
            {
                let mut count = active_count.write().await;
                *count += 1;
            }

            let start_time = Instant::now();
            let now = chrono::Utc::now();

            // 更新 DB 状态为 Running
            let _ = sqlx::query(
                "UPDATE tasks SET status = 'running', node_id = ?, started_at = ?, updated_at = ? WHERE id = ?"
            )
            .bind(&node_id)
            .bind(now)
            .bind(now)
            .bind(&task_id_clone)
            .execute(&db)
            .await;

            // 状态更新监听器 (更新 DB 和内存)
            let db_for_status = db.clone();
            let task_id_for_status = task_id_clone.clone();
            let info_for_status = info_arc.clone();
            tokio::spawn(async move {
                while let Some(update) = status_rx.recv().await {
                    // 更新内存
                    {
                        let mut info = info_for_status.write().await;
                        info.status = update.status.clone();
                        info.updated_at = chrono::Utc::now();
                    }

                    // 更新 DB
                    let (status_str, progress) = match &update.status {
                        TaskStatus::Running { progress, .. } => ("running", *progress),
                        TaskStatus::Paused { progress } => ("paused", *progress),
                        _ => ("", 0.0),
                    };

                    if !status_str.is_empty() {
                        let _ = sqlx::query(
                            "UPDATE tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?"
                        )
                        .bind(status_str)
                        .bind(progress)
                        .bind(chrono::Utc::now())
                        .bind(&task_id_for_status)
                        .execute(&db_for_status)
                        .await;
                    }
                }
            });

            // 执行
            let result = executor.execute(ctx, payload).await;
            let duration = start_time.elapsed().as_secs_f64();
            let now = chrono::Utc::now();

            // 更新最终状态
            let (final_status, final_status_str, error) = match result {
                Ok(msg) => (
                    TaskStatus::Completed {
                        duration_secs: duration,
                        result: msg,
                    },
                    "completed",
                    None,
                ),
                Err(e) => {
                    let err_msg = e.to_string();
                    if err_msg.contains("cancelled") || err_msg.contains("取消") {
                        (TaskStatus::Cancelled, "cancelled", None)
                    } else {
                        (
                            TaskStatus::Failed {
                                error: err_msg.clone(),
                            },
                            "failed",
                            Some(err_msg),
                        )
                    }
                }
            };

            // 更新内存
            {
                let mut info = info_arc.write().await;
                info.status = final_status;
                info.updated_at = now;
            }

            // 更新 DB
            let _ = sqlx::query(
                "UPDATE tasks SET status = ?, error = ?, duration_secs = ?, finished_at = ?, updated_at = ? WHERE id = ?"
            )
            .bind(final_status_str)
            .bind(error)
            .bind(duration)
            .bind(now)
            .bind(now)
            .bind(&task_id_clone)
            .execute(&db)
            .await;

            tracing::info!(
                task_id = %task_id_clone,
                status = final_status_str,
                duration = duration,
                "Task finished"
            );

            {
                let mut count = active_count.write().await;
                *count -= 1;
            }
            crate::services::metrics::METRICS.active_tasks.dec();
        });

        Ok(())
    }

    /// 暂停任务
    pub async fn pause(&self, task_id: &str) -> anyhow::Result<()> {
        // 更新 DB
        sqlx::query("UPDATE tasks SET status = 'paused', updated_at = ? WHERE id = ?")
            .bind(chrono::Utc::now())
            .bind(task_id)
            .execute(&self.db)
            .await?;

        // 通知运行时 (如果在当前节点运行)
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
        }

        debug!(task_id = %task_id, "任务已暂停 (DB)");
        Ok(())
    }

    /// 恢复任务
    pub async fn resume(&self, task_id: &str) -> anyhow::Result<()> {
        // 更新 DB
        sqlx::query("UPDATE tasks SET status = 'pending', updated_at = ? WHERE id = ?")
            .bind(chrono::Utc::now())
            .bind(task_id)
            .execute(&self.db)
            .await?;

        // 通知运行时 (如果在当前节点运行)
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
        } else {
            // 如果不在当前节点运行，更新为 pending 触发重新分发
            self.dispatch(task_id.to_string()).await?;
        }

        debug!(task_id = %task_id, "任务已恢复及重新调度 (DB)");
        Ok(())
    }

    /// 取消任务
    pub async fn cancel(&self, task_id: &str) -> anyhow::Result<()> {
        // 更新 DB
        sqlx::query("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?")
            .bind(chrono::Utc::now())
            .bind(task_id)
            .execute(&self.db)
            .await?;

        // 通知运行时 (如果在当前节点运行)
        if let Some(handle) = self.tasks.get(task_id) {
            {
                let mut cancelled = handle.is_cancelled.write().await;
                *cancelled = true;
            }
            let _ = handle.command_tx.send(TaskCommand::Cancel);

            let mut info = handle.info.write().await;
            info.status = TaskStatus::Cancelled;
            info.updated_at = chrono::Utc::now();
        }

        debug!(task_id = %task_id, "任务已取消 (DB)");
        Ok(())
    }

    /// 获取任务状态
    pub async fn get_status(&self, task_id: &str) -> Option<TaskInfo> {
        // 优先从内存获取实时状态 (如果在本机运行)
        if let Some(handle) = self.tasks.get(task_id) {
            return Some(handle.info.read().await.clone());
        }

        // 否则从 DB 获取
        let task: Option<crate::models::DbTask> =
            sqlx::query_as("SELECT * FROM tasks WHERE id = ?")
                .bind(task_id)
                .fetch_optional(&self.db)
                .await
                .ok()
                .flatten();

        task.map(|t| {
            let task_type_str = t.task_type.clone();
            let task_type = match task_type_str.as_str() {
                "scan" => TaskType::Scan,
                "hash" => TaskType::Hash,
                "scrape" => TaskType::Scrape,
                "rename" => TaskType::Rename,
                _ => TaskType::Custom(task_type_str),
            };

            let status = match t.status.as_str() {
                "pending" => TaskStatus::Pending,
                "running" => TaskStatus::Running {
                    progress: t.progress,
                    message: None,
                },
                "paused" => TaskStatus::Paused {
                    progress: t.progress,
                },
                "completed" => TaskStatus::Completed {
                    duration_secs: t.duration_secs.unwrap_or(0.0),
                    result: t.result,
                },
                "failed" => TaskStatus::Failed {
                    error: t.error.unwrap_or_default(),
                },
                "cancelled" => TaskStatus::Cancelled,
                _ => TaskStatus::Pending,
            };

            TaskInfo {
                id: t.id,
                task_type,
                status,
                created_at: t.created_at,
                updated_at: t.updated_at,
                description: t.description,
            }
        })
    }

    /// 列出所有任务 (从 DB)
    pub async fn list_tasks(&self) -> Vec<TaskInfo> {
        let tasks: Vec<crate::models::DbTask> =
            sqlx::query_as("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100")
                .fetch_all(&self.db)
                .await
                .unwrap_or_default();

        tasks
            .into_iter()
            .map(|t| {
                let task_type_str = t.task_type.clone();
                let task_type = match task_type_str.as_str() {
                    "scan" => TaskType::Scan,
                    "hash" => TaskType::Hash,
                    "scrape" => TaskType::Scrape,
                    "rename" => TaskType::Rename,
                    _ => TaskType::Custom(task_type_str),
                };

                let status = match t.status.as_str() {
                    "pending" => TaskStatus::Pending,
                    "running" => TaskStatus::Running {
                        progress: t.progress,
                        message: None,
                    },
                    "paused" => TaskStatus::Paused {
                        progress: t.progress,
                    },
                    "completed" => TaskStatus::Completed {
                        duration_secs: t.duration_secs.unwrap_or(0.0),
                        result: t.result,
                    },
                    "failed" => TaskStatus::Failed {
                        error: t.error.unwrap_or_default(),
                    },
                    "cancelled" => TaskStatus::Cancelled,
                    _ => TaskStatus::Pending,
                };

                TaskInfo {
                    id: t.id,
                    task_type,
                    status,
                    created_at: t.created_at,
                    updated_at: t.updated_at,
                    description: t.description,
                }
            })
            .collect()
    }

    /// 清理已完成/失败/取消的任务
    pub async fn cleanup_finished(&self) {
        let _ =
            sqlx::query("DELETE FROM tasks WHERE status IN ('completed', 'failed', 'cancelled')")
                .execute(&self.db)
                .await;

        // 同时清理内存中的句柄
        self.tasks.retain(|_, handle| {
            // 仅保留活跃任务
            let info = futures::executor::block_on(handle.info.read());
            match info.status {
                TaskStatus::Pending | TaskStatus::Running { .. } | TaskStatus::Paused { .. } => {
                    true
                }
                _ => false,
            }
        });
    }

    /// 更新任务状态（供分布式 Worker 使用）
    pub async fn update_task_status(
        &self,
        task_id: &str,
        status: TaskStatus,
        progress: f64,
        message: Option<String>,
        result: Option<serde_json::Value>,
        error: Option<String>,
    ) -> anyhow::Result<()> {
        let status_str = match &status {
            TaskStatus::Pending => "pending",
            TaskStatus::Running { .. } => "running",
            TaskStatus::Paused { .. } => "paused",
            TaskStatus::Completed { .. } => "completed",
            TaskStatus::Failed { .. } => "failed",
            TaskStatus::Cancelled => "cancelled",
        };
        let result_json = result.map(|r| r.to_string());

        sqlx::query(
            "UPDATE tasks SET status = ?, progress = ?, description = COALESCE(?, description), result = ?, error = ?, updated_at = ? WHERE id = ?"
        )
        .bind(status_str)
        .bind(progress)
        .bind(message)
        .bind(result_json)
        .bind(error)
        .bind(chrono::Utc::now())
        .bind(task_id)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    /// 为 Worker 申领待处理任务
    pub async fn claim_task_for_worker(
        &self,
        node_id: &str,
        capabilities: &[TaskType],
    ) -> Option<crate::models::DbTask> {
        let cap_strs: Vec<String> = capabilities
            .iter()
            .map(|t| match t {
                TaskType::Scan => "scan".to_string(),
                TaskType::Hash => "hash".to_string(),
                TaskType::Scrape => "scrape".to_string(),
                TaskType::Rename => "rename".to_string(),
                TaskType::BatchMove => "batch_move".to_string(),
                TaskType::BatchCopy => "batch_copy".to_string(),
                TaskType::Cleanup => "cleanup".to_string(),
                TaskType::Custom(s) => s.clone(),
            })
            .collect();

        // 查找第一个匹配能力的 PENDING 任务
        let task = sqlx::query_as::<_, crate::models::DbTask>(
            "SELECT * FROM tasks WHERE status = 'pending' AND task_type IN (SELECT value FROM json_each(?)) LIMIT 1"
        )
        .bind(serde_json::to_string(&cap_strs).unwrap())
        .fetch_optional(&self.db)
        .await
        .ok()??;

        // 尝试更新为已分配
        let res = sqlx::query(
            "UPDATE tasks SET status = 'running', node_id = ?, started_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
        )
        .bind(node_id)
        .bind(chrono::Utc::now())
        .bind(chrono::Utc::now())
        .bind(&task.id)
        .execute(&self.db)
        .await
        .ok()?;

        if res.rows_affected() > 0 {
            Some(task)
        } else {
            None
        }
    }

    /// 获取活跃任务数
    pub async fn active_count(&self) -> usize {
        *self.active_count.read().await
    }

    /// 获取任务执行器
    pub fn get_executor(&self, task_type: &TaskType) -> Option<Arc<dyn TaskExecutor>> {
        self.executors.get(task_type).map(|e| e.value().clone())
    }

    /// 创建一个用于远程任务的上下文
    pub fn create_remote_context(
        &self,
        task_id: String,
    ) -> (TaskContext, mpsc::Receiver<TaskStatusUpdate>) {
        let (status_tx, status_rx) = mpsc::channel(100);
        let (command_tx, _) = tokio::sync::broadcast::channel(10);
        let command_rx = command_tx.subscribe();

        let ctx = TaskContext {
            task_id,
            command_rx,
            status_tx: status_tx.into(),
            is_paused: Arc::new(RwLock::new(false)),
            is_cancelled: Arc::new(RwLock::new(false)),
        };

        (ctx, status_rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    struct TestExecutor;
    impl TaskExecutor for TestExecutor {
        fn execute(
            &self,
            mut ctx: TaskContext,
            _payload: serde_json::Value,
        ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>> {
            Box::pin(async move {
                for i in 0..5 {
                    if ctx.check_pause().await {
                        return Err(anyhow::anyhow!("cancelled"));
                    }
                    ctx.report_progress(i as f64 * 20.0, Some("working")).await;
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                }
                Ok(Some("done".to_string()))
            })
        }
    }

    #[tokio::test]
    async fn test_task_lifecycle() {
        let db = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();

        // 运行迁移
        sqlx::query(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                task_type TEXT NOT NULL,
                status TEXT NOT NULL,
                description TEXT,
                payload TEXT,
                result TEXT,
                progress REAL NOT NULL DEFAULT 0.0,
                node_id TEXT,
                error TEXT,
                duration_secs REAL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                started_at DATETIME,
                finished_at DATETIME
            )",
        )
        .execute(&db)
        .await
        .unwrap();

        let queue = TaskQueue::new(db, 2);
        queue.register_executor(TaskType::Custom("test".to_string()), Arc::new(TestExecutor));

        // 提交任务
        let task_id = queue
            .submit(
                TaskType::Custom("test".to_string()),
                Some("测试任务".to_string()),
                serde_json::json!({}),
            )
            .await
            .unwrap();

        // 等待任务完成
        let mut completed = false;
        for _ in 0..20 {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            if let Some(info) = queue.get_status(&task_id).await {
                if matches!(info.status, TaskStatus::Completed { .. }) {
                    completed = true;
                    break;
                }
            }
        }
        assert!(completed);
    }
}
