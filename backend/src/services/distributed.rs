use axum::extract::ws::{Message, WebSocket};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::services::task_queue::{TaskQueue, TaskStatus as DbTaskStatus, TaskType};
use sysinfo::System;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message as WsMessage};

/// 工作节点消息 (Worker -> Master)
#[derive(Debug, Serialize, Deserialize)]
pub enum WorkerMessage {
    /// 注册节点
    Register {
        node_id: String,
        hostname: String,
        capabilities: Vec<TaskType>,
    },
    /// 心跳
    Heartbeat {
        node_id: String,
        load: f64, // 0.0 - 1.0
    },
    /// 任务状态更新
    TaskUpdate {
        node_id: String,
        task_id: String,
        status: DbTaskStatus,
        progress: f64,
        message: Option<String>,
        result: Option<serde_json::Value>,
        error: Option<String>,
    },
    /// 请求任务 (拉取模式)
    RequestTask {
        node_id: String,
        capabilities: Vec<TaskType>,
    },
}

/// 主节点消息 (Master -> Worker)
#[derive(Debug, Serialize, Deserialize)]
pub enum MasterMessage {
    /// 注册确认
    RegisterAck {
        node_id: String,
        heartbeat_interval_secs: u64,
    },
    /// 分派任务
    DispatchTask {
        task_id: String,
        task_type: TaskType,
        payload: serde_json::Value,
    },
    /// 任务控制
    ControlTask {
        task_id: String,
        command: String, // pause, resume, cancel
    },
    /// 心跳确认
    HeartbeatAck,
    /// 无任务可用
    NoTaskAvailable,
}

/// 工作节点信息
#[derive(Debug, Clone)]
pub struct WorkerInfo {
    #[allow(dead_code)]
    pub node_id: String,
    #[allow(dead_code)]
    pub hostname: String,
    #[allow(dead_code)]
    pub capabilities: Vec<TaskType>,
    pub last_heartbeat: DateTime<Utc>,
    pub load: f64,
    pub status: WorkerStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerStatus {
    Online,
    Offline,
}

/// 分布式服务，管理所有 Worker
pub struct DistributedService {
    pub workers: DashMap<String, WorkerInfo>,
    pub task_queue: Arc<TaskQueue>,
}

impl DistributedService {
    pub fn new(task_queue: Arc<TaskQueue>) -> Self {
        Self {
            workers: DashMap::new(),
            task_queue,
        }
    }

    /// 处理 Worker 连接
    pub async fn handle_worker_socket(&self, socket: WebSocket) {
        let (mut sender, mut receiver) = socket.split();
        let mut current_node_id: Option<String> = None;

        while let Some(msg) = receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(worker_msg) = serde_json::from_str::<WorkerMessage>(&text) {
                        match worker_msg {
                            WorkerMessage::Register {
                                node_id,
                                hostname,
                                capabilities,
                            } => {
                                let id = if node_id.is_empty() {
                                    Uuid::new_v4().to_string()
                                } else {
                                    node_id
                                };
                                self.workers.insert(
                                    id.clone(),
                                    WorkerInfo {
                                        node_id: id.clone(),
                                        hostname,
                                        capabilities,
                                        last_heartbeat: Utc::now(),
                                        load: 0.0,
                                        status: WorkerStatus::Online,
                                    },
                                );
                                current_node_id = Some(id.clone());

                                let ack = MasterMessage::RegisterAck {
                                    node_id: id,
                                    heartbeat_interval_secs: 10,
                                };
                                let _ = sender
                                    .send(Message::Text(serde_json::to_string(&ack).unwrap()))
                                    .await;
                            }
                            WorkerMessage::Heartbeat { node_id, load } => {
                                if let Some(mut worker) = self.workers.get_mut(&node_id) {
                                    worker.last_heartbeat = Utc::now();
                                    worker.load = load;
                                    let _ = sender
                                        .send(Message::Text(
                                            serde_json::to_string(&MasterMessage::HeartbeatAck)
                                                .unwrap(),
                                        ))
                                        .await;
                                }
                            }
                            WorkerMessage::TaskUpdate {
                                node_id: _,
                                task_id,
                                status,
                                progress,
                                message,
                                result,
                                error,
                            } => {
                                // 更新数据库中的任务状态
                                let _ = self
                                    .task_queue
                                    .update_task_status(
                                        &task_id, status, progress, message, result, error,
                                    )
                                    .await;
                            }
                            WorkerMessage::RequestTask {
                                node_id: id,
                                capabilities,
                            } => {
                                if let Some(task) = self
                                    .task_queue
                                    .claim_task_for_worker(&id, &capabilities)
                                    .await
                                {
                                    let payload = task
                                        .payload
                                        .clone()
                                        .and_then(|p| serde_json::from_str(&p).ok())
                                        .unwrap_or(serde_json::json!({}));

                                    let dispatch = MasterMessage::DispatchTask {
                                        task_id: task.id.clone(),
                                        task_type: task.task_type_enum(),
                                        payload,
                                    };
                                    let _ = sender
                                        .send(Message::Text(
                                            serde_json::to_string(&dispatch).unwrap(),
                                        ))
                                        .await;
                                } else {
                                    let _ = sender
                                        .send(Message::Text(
                                            serde_json::to_string(&MasterMessage::NoTaskAvailable)
                                                .unwrap(),
                                        ))
                                        .await;
                                }
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }

        // Worker 断开连接
        if let Some(id) = current_node_id {
            if let Some(mut worker) = self.workers.get_mut(&id) {
                worker.status = WorkerStatus::Offline;
            }
            tracing::warn!("Worker {} disconnected", id);
        }
    }
}

/// 工作节点服务，作为独立进程运行
pub struct WorkerService {
    pub node_id: String,
    pub hostname: String,
    pub master_url: String,
    pub task_queue: Arc<TaskQueue>,
    pub capabilities: Vec<TaskType>,
    pub sys: Arc<tokio::sync::Mutex<System>>,
}

impl WorkerService {
    pub fn new(
        node_id: Option<String>,
        master_url: String,
        task_queue: Arc<TaskQueue>,
        capabilities: Vec<TaskType>,
    ) -> Self {
        let node_id = node_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string());

        Self {
            node_id,
            hostname,
            master_url,
            task_queue,
            capabilities,
            sys: Arc::new(tokio::sync::Mutex::new(System::new_all())),
        }
    }

    pub async fn run(&self) -> anyhow::Result<()> {
        let ws_url = format!("{}/api/ws/worker", self.master_url.replace("http", "ws"));
        tracing::info!("Connecting to Master at {}", ws_url);

        loop {
            match connect_async(&ws_url).await {
                Ok((socket, _)) => {
                    tracing::info!("Connected to Master");
                    if let Err(e) = self.handle_connection(socket).await {
                        tracing::error!("Connection error: {}, retrying in 5s...", e);
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to connect: {}, retrying in 5s...", e);
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }

    async fn handle_connection(
        &self,
        socket: tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    ) -> anyhow::Result<()> {
        let (mut sender, mut receiver) = socket.split();

        // 1. 注册
        let reg = WorkerMessage::Register {
            node_id: self.node_id.clone(),
            hostname: self.hostname.clone(),
            capabilities: self.capabilities.clone(),
        };
        sender
            .send(WsMessage::Text(serde_json::to_string(&reg)?))
            .await?;

        // 2. 启动心跳循环 (后台)
        let node_id = self.node_id.clone();
        let sys = self.sys.clone();
        let (heartbeat_tx, mut heartbeat_rx) = tokio::sync::mpsc::channel(1);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

                // 获取真实负载
                let mut sys_guard = sys.lock().await;
                sys_guard.refresh_cpu();
                // 简单的平均负载计算：CPU 使用率 / 100
                let load = sys_guard.global_cpu_info().cpu_usage() as f64 / 100.0;

                let hb = WorkerMessage::Heartbeat {
                    node_id: node_id.clone(),
                    load,
                };
                if heartbeat_tx.send(hb).await.is_err() {
                    break;
                }
            }
        });

        // 3. 消息循环
        let mut request_task_timer = tokio::time::interval(tokio::time::Duration::from_secs(5));
        let (update_tx, mut update_rx) = tokio::sync::mpsc::channel(10);

        loop {
            tokio::select! {
                Some(hb) = heartbeat_rx.recv() => {
                    sender.send(WsMessage::Text(serde_json::to_string(&hb)?)).await?;
                }
                Some(update) = update_rx.recv() => {
                    sender.send(WsMessage::Text(serde_json::to_string(&update)?)).await?;
                }
                _ = request_task_timer.tick() => {
                    // 如果本机没有正在运行的任务，请求新任务
                    if self.task_queue.active_count().await == 0 {
                        let req = WorkerMessage::RequestTask {
                            node_id: self.node_id.clone(),
                            capabilities: self.capabilities.clone(),
                        };
                        sender.send(WsMessage::Text(serde_json::to_string(&req)?)).await?;
                    }
                }
                msg = receiver.next() => {
                    match msg {
                        Some(Ok(WsMessage::Text(text))) => {
                            if let Ok(master_msg) = serde_json::from_str::<MasterMessage>(&text) {
                                match master_msg {
                                    MasterMessage::DispatchTask { task_id, task_type, payload } => {
                                        let update_tx = update_tx.clone();
                                        let task_queue = self.task_queue.clone();
                                        let node_id = self.node_id.clone();

                                        tokio::spawn(async move {
                                            if let Err(e) = run_task_remote(node_id, task_id, task_type, payload, task_queue, update_tx).await {
                                                tracing::error!("Task execution error: {}", e);
                                            }
                                        });
                                    }
                                    _ => {}
                                }
                            }
                        }
                        Some(Ok(WsMessage::Close(_))) | None => break,
                        _ => {}
                    }
                }
            }
        }

        Ok(())
    }
}

/// 执行远程任务并报告进度
async fn run_task_remote(
    node_id: String,
    task_id: String,
    task_type: TaskType,
    payload: serde_json::Value,
    task_queue: Arc<TaskQueue>,
    update_tx: tokio::sync::mpsc::Sender<WorkerMessage>,
) -> anyhow::Result<()> {
    tracing::info!("Executing remote task: {} ({:?})", task_id, task_type);

    // 获取执行器
    let executor = task_queue
        .get_executor(&task_type)
        .ok_or_else(|| anyhow::anyhow!("No executor found for task type: {:?}", task_type))?;

    // 创建任务上下文
    let (ctx, mut status_rx) = task_queue.create_remote_context(task_id.clone());

    // 启动状态监听器，将本地进度转发给 update_tx
    let node_id_clone = node_id.clone();
    let task_id_clone = task_id.clone();
    let update_tx_clone = update_tx.clone();
    tokio::spawn(async move {
        while let Some(update) = status_rx.recv().await {
            let (status, progress) = match update.status {
                crate::services::task_queue::TaskStatus::Running { progress, message } => (
                    DbTaskStatus::Running {
                        progress,
                        message: message.clone(),
                    },
                    progress,
                ),
                crate::services::task_queue::TaskStatus::Paused { progress } => {
                    (DbTaskStatus::Paused { progress }, progress)
                }
                _ => continue, // 最终状态由执行器返回处理
            };

            let _ = update_tx_clone
                .send(WorkerMessage::TaskUpdate {
                    node_id: node_id_clone.clone(),
                    task_id: task_id_clone.clone(),
                    status,
                    progress,
                    message: None, // message 已包含在 status 中
                    result: None,
                    error: None,
                })
                .await;
        }
    });

    // 执行任务
    let result = executor.execute(ctx, payload).await;

    // 报告最终结果
    let (status, progress, result_val, error_msg) = match result {
        Ok(msg) => (
            DbTaskStatus::Completed {
                duration_secs: 0.0,
                result: msg.clone(),
            },
            100.0,
            msg.map(serde_json::Value::String),
            None,
        ),
        Err(e) => (
            DbTaskStatus::Failed {
                error: e.to_string(),
            },
            0.0,
            None,
            Some(e.to_string()),
        ),
    };

    let _ = update_tx
        .send(WorkerMessage::TaskUpdate {
            node_id,
            task_id,
            status,
            progress,
            message: None,
            result: result_val,
            error: error_msg,
        })
        .await;

    Ok(())
}
