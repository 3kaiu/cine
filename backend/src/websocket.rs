use axum::{
    extract::{
        ws::{Message, WebSocket},
        WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::StreamExt;
use tokio::sync::broadcast;

/// WebSocket 处理器，用于实时推送进度
pub async fn ws_handler(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    // 这里可以订阅任务进度频道
    // 简化版：只处理连接
    while let Some(msg) = socket.next().await {
        if let Ok(msg) = msg {
            match msg {
                Message::Text(text) => {
                    // 处理客户端消息
                    if let Err(e) = socket.send(Message::Text(format!("Echo: {}", text))).await {
                        tracing::error!("WebSocket send error: {}", e);
                        break;
                    }
                }
                Message::Close(_) => {
                    break;
                }
                _ => {}
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
