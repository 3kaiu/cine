use std::sync::Arc;

use tokio::sync::broadcast;

use crate::services::task_queue::TaskType;
use crate::websocket::{ProgressBroadcaster, ProgressMessage};

/// ProgressHub 统一管理任务进度的内部上报与 WebSocket 推送。
///
/// - 对内：供 TaskQueue / TaskContext / 其他服务调用 `report_progress`。
/// - 对外：对 WebSocket handler 暴露订阅接口。
#[derive(Clone)]
pub struct ProgressHub {
    broadcaster: ProgressBroadcaster,
}

impl ProgressHub {
    /// 创建新的 ProgressHub。
    pub fn new() -> Self {
        Self {
            broadcaster: ProgressBroadcaster::new(),
        }
    }

    /// 从现有的 ProgressBroadcaster 创建 ProgressHub（兼容扩展）。
    pub fn from_broadcaster(broadcaster: ProgressBroadcaster) -> Self {
        Self { broadcaster }
    }

    /// 订阅进度流，供 WebSocket 使用。
    pub fn subscribe(&self) -> broadcast::Receiver<ProgressMessage> {
        self.broadcaster.subscribe()
    }

    /// 直接广播一个进度消息。
    pub fn broadcast(&self, msg: ProgressMessage) {
        self.broadcaster.send(msg);
    }

    /// 由任务内部调用的统一进度上报入口。
    ///
    /// `progress` 采用 0.0 - 100.0 百分比表示。
    pub fn report_progress(
        &self,
        task_id: &str,
        task_type: &TaskType,
        progress: f64,
        message: Option<String>,
    ) {
        let msg = ProgressMessage {
            task_id: task_id.to_string(),
            task_type: task_type.to_string(),
            progress,
            current_file: None,
            message,
        };

        self.broadcast(msg);
    }
}

