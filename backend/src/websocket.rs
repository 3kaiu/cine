use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::broadcast;

use crate::handlers::AppState;

/// WebSocket 处理器，用于实时推送进度
#[allow(dead_code)]
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    let rx = state.progress_broadcaster.subscribe();
    ws.on_upgrade(|socket| handle_socket(socket, rx))
}

#[allow(dead_code)]
async fn handle_socket(socket: WebSocket, mut rx: broadcast::Receiver<ProgressMessage>) {
    let (mut sender, mut receiver) = socket.split();

    // 使用 tokio::select! 同时处理进度推送和客户端消息
    loop {
        tokio::select! {
            // 接收进度消息并推送给客户端
            msg = rx.recv() => {
                match msg {
                    Ok(progress) => {
                        if let Ok(json) = serde_json::to_string(&progress) {
                            if sender.send(Message::Text(json)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        // 消息被跳过，继续
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            // 处理来自客户端的消息
            ws_msg = receiver.next() => {
                match ws_msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        if sender.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

/// 任务进度广播器
#[derive(Clone)]
pub struct ProgressBroadcaster {
    tx: broadcast::Sender<ProgressMessage>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProgressMessage {
    pub task_id: String,
    pub task_type: String, // scan, hash, scrape, rename
    pub progress: f64,     // 0.0 - 100.0
    pub current_file: Option<String>,
    pub message: Option<String>,
}

impl ProgressBroadcaster {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self { tx }
    }

    #[allow(dead_code)]
    pub fn send(&self, msg: ProgressMessage) {
        let _ = self.tx.send(msg);
    }

    #[allow(dead_code)]
    pub fn subscribe(&self) -> broadcast::Receiver<ProgressMessage> {
        self.tx.subscribe()
    }
}

impl Default for ProgressBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}
