//! 并行哈希计算服务

use sqlx::SqlitePool;
use std::sync::Arc;
use futures::stream::{self, StreamExt};
use tokio::sync::Semaphore;

use crate::services::hasher;
use crate::websocket::{ProgressBroadcaster, ProgressMessage};
use crate::services::cache::FileHashCache;

/// 批量并行计算文件哈希
/// 
/// # 参数
/// - `db`: 数据库连接池
/// - `file_ids`: 要计算哈希的文件ID列表
/// - `max_concurrent`: 最大并发数（建议设置为CPU核心数）
/// - `task_id`: 任务ID（用于进度推送）
/// - `progress_broadcaster`: 进度广播器（可选）
/// - `hash_cache`: 哈希缓存（可选）
pub async fn batch_calculate_hash_parallel(
    db: &SqlitePool,
    file_ids: &[String],
    max_concurrent: usize,
    task_id: &str,
    progress_broadcaster: Option<Arc<ProgressBroadcaster>>,
    hash_cache: Option<Arc<FileHashCache>>,
) -> anyhow::Result<()> {
    let total = file_ids.len();
    let semaphore = Arc::new(Semaphore::new(max_concurrent));
    let mut completed = 0usize;

    // 使用流式处理，控制并发数
    let results: Vec<_> = stream::iter(file_ids.iter().enumerate())
        .map(|(index, file_id)| {
            let db = db.clone();
            let file_id = file_id.clone();
            let task_id = task_id.to_string();
            let semaphore = semaphore.clone();
            let progress_broadcaster_clone = progress_broadcaster.clone();
            let hash_cache = hash_cache.clone();

            async move {
                // 获取信号量许可（控制并发）
                let _permit = semaphore.acquire().await.unwrap();
                
                // 计算哈希
                let result = hasher::calculate_file_hash(
                    &db,
                    &file_id,
                    &task_id,
                    progress_broadcaster_clone.clone(),
                    hash_cache,
                ).await;

                // 更新进度
                if let Some(ref broadcaster) = progress_broadcaster_clone {
                    let completed = index + 1;
                    let progress = (completed as f64 / total as f64) * 100.0;
                    
                    broadcaster.send(ProgressMessage {
                        task_id: task_id.clone(),
                        task_type: "batch_hash".to_string(),
                        progress,
                        current_file: Some(file_id.clone()),
                        message: Some(format!("Processed {}/{} files", completed, total)),
                    });
                }

                result
            }
        })
        .buffer_unordered(max_concurrent)
        .collect()
        .await;

    // 检查错误
    let mut errors = Vec::new();
    for (i, result) in results.into_iter().enumerate() {
        if let Err(e) = result {
            errors.push(format!("File {}: {}", file_ids[i], e));
            tracing::error!("Failed to calculate hash for {}: {}", file_ids[i], e);
        }
        completed += 1;
    }

    if !errors.is_empty() {
        tracing::warn!("{} files failed to hash: {:?}", errors.len(), errors);
    }

    // 发送完成消息
    if let Some(ref broadcaster) = progress_broadcaster {
        broadcaster.send(ProgressMessage {
            task_id: task_id.to_string(),
            task_type: "batch_hash".to_string(),
            progress: 100.0,
            current_file: None,
            message: Some(format!("Completed: {}/{} files processed", completed, total)),
        });
    }

    tracing::info!("Batch hash calculation completed: {}/{} files", completed, total);
    Ok(())
}
