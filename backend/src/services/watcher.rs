use crate::models::WatchFolder;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use sqlx::SqlitePool;
use std::path::Path;
use tokio::sync::mpsc;

pub struct WatcherService {
    db: SqlitePool,
    tx: mpsc::Sender<String>, // 发送发生变更的路径
}

impl WatcherService {
    pub fn new(db: SqlitePool) -> (Self, mpsc::Receiver<String>) {
        let (tx, rx) = mpsc::channel(100);
        (Self { db, tx }, rx)
    }

    /// 启动所有已启用的监控任务
    pub async fn start_all(&self) -> anyhow::Result<()> {
        let folders: Vec<WatchFolder> =
            sqlx::query_as("SELECT * FROM watch_folders WHERE enabled = 1")
                .fetch_all(&self.db)
                .await?;

        for folder in folders {
            let tx = self.tx.clone();
            let path = folder.path.clone();

            tokio::spawn(async move {
                if let Err(e) = watch_directory(&path, tx).await {
                    tracing::error!("Watcher failed for {}: {}", path, e);
                }
            });
        }

        Ok(())
    }
}

async fn watch_directory(path_str: &str, tx: mpsc::Sender<String>) -> anyhow::Result<()> {
    let (notif_tx, mut notif_rx) = tokio::sync::mpsc::channel(1);

    let path = Path::new(path_str);
    if !path.exists() {
        return Err(anyhow::anyhow!("Path does not exist: {}", path_str));
    }

    let mut watcher = RecommendedWatcher::new(
        move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                // 更加通用的匹配方式，确保捕捉到任何可能的变更触发扫描
                if event.kind.is_create() || event.kind.is_modify() || event.kind.is_other() {
                    let _ = notif_tx.blocking_send(());
                }
            }
        },
        Config::default(),
    )?;

    watcher.watch(path, RecursiveMode::Recursive)?;
    tracing::info!("Started watching directory: {}", path_str);

    // Debounce loop
    while let Some(_) = notif_rx.recv().await {
        // 等待一段时间确保文件操作完成（尤其是从网络驱动器复制时）
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        // 清理后续短时间内的重复信号
        while let Ok(_) = notif_rx.try_recv() {}

        tracing::info!("Change detected in {}, triggering auto-scan", path_str);
        let _ = tx.send(path_str.to_string()).await;
    }

    Ok(())
}
