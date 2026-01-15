//! 并行哈希计算服务

use futures::stream::{self, StreamExt};
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::Semaphore;

use crate::services::cache::FileHashCache;
use crate::services::hasher;

/// 批量并行计算文件哈希
///
/// 使用信号量控制并发，高效处理大量文件的哈希计算。
///
/// # 参数
/// - `db`: 数据库连接池
/// - `file_ids`: 要计算哈希的文件ID列表
/// - `max_concurrent`: 最大并发数（建议设置为CPU核心数）
/// - `task_id`: 任务ID（用于进度推送）
/// - `progress_broadcaster`: 进度广播器（可选）
/// - `hash_cache`: 哈希缓存（可选）
///
/// # 用途
/// 用于大规模文件去重时的高性能并行哈希计算
#[allow(dead_code)]
pub async fn batch_calculate_hash_parallel(
    db: &SqlitePool,
    file_ids: &[String],
    max_concurrent: usize,
    ctx: crate::services::task_queue::TaskContext,
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
            let semaphore = semaphore.clone();
            let hash_cache = hash_cache.clone();
            // 为每个任务复制一份上下文
            let sub_ctx = ctx.duplicate();

            async move {
                // 获取信号量许可（控制并发）
                let _permit = semaphore.acquire().await.unwrap();

                // 检查暂停/取消
                let mut sub_ctx = sub_ctx;
                if sub_ctx.check_pause().await {
                    return Err(anyhow::anyhow!("Task cancelled"));
                }

                // 计算哈希
                let result =
                    hasher::calculate_file_hash(&db, &file_id, sub_ctx.duplicate(), hash_cache)
                        .await;

                // 报告总体进度
                let completed = index + 1;
                let progress = (completed as f64 / total as f64) * 100.0;
                sub_ctx
                    .report_progress(
                        progress,
                        Some(&format!("Processed {}/{} files", completed, total)),
                    )
                    .await;

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

    tracing::info!(
        "Batch hash calculation completed: {}/{} files",
        completed,
        total
    );
    Ok(())
}
