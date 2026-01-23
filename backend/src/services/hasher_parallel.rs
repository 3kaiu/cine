//! 并行哈希计算服务

use futures::stream::{self, StreamExt};
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::Semaphore;
use std::sync::atomic::{AtomicUsize, Ordering};

use crate::services::cache::FileHashCache;
use crate::services::hasher;

/// 批量并行计算文件哈希
///
/// 使用智能内存管理器动态调整并发数，高效处理大量文件的哈希计算。
/// 优化进度报告：使用原子计数器确保准确的进度跟踪
///
/// # 参数
/// - `db`: 数据库连接池
/// - `file_ids`: 要计算哈希的文件ID列表
/// - `max_concurrent`: 最大并发数（如果为0则使用智能检测）
/// - `ctx`: 任务上下文
/// - `hash_cache`: 哈希缓存（可选）
///
/// # 智能优化特性
/// - 基于系统内存和CPU核心数动态调整并发数
/// - 原子计数器保证进度报告准确性
/// - 批量进度报告减少通信开销
/// - 智能错误聚合和统计
/// - 自适应块大小优化内存使用
///
/// # 用途
/// 用于大规模文件去重时的高性能并行哈希计算
#[allow(dead_code)]
pub async fn batch_calculate_hash_parallel(
    db: &SqlitePool,
    file_ids: &[String],
    max_concurrent: usize,
    mut ctx: crate::services::task_queue::TaskContext,
    hash_cache: Option<Arc<FileHashCache>>,
) -> anyhow::Result<()> {
    let total = file_ids.len();
    if total == 0 {
        return Ok(());
    }

    // 使用智能内存管理器确定并发数
    let memory_manager = crate::services::hasher::MemoryManager::new();
    let optimal_concurrent = if max_concurrent == 0 {
        memory_manager.max_concurrent_tasks
    } else {
        max_concurrent.min(memory_manager.max_concurrent_tasks)
    };

    tracing::info!(
        "Starting batch hash calculation: {} files, {} concurrent tasks (available memory: {}MB)",
        total,
        optimal_concurrent,
        memory_manager.available_memory / 1024 / 1024
    );

    let semaphore = Arc::new(Semaphore::new(optimal_concurrent));
    let completed_count = Arc::new(AtomicUsize::new(0));
    let error_count = Arc::new(AtomicUsize::new(0));

    // 进度报告间隔 - 每完成5%或至少10个文件报告一次
    let progress_report_interval = std::cmp::max(total / 20, 10);
    let last_reported = Arc::new(AtomicUsize::new(0));

    // 使用流式处理，控制并发数
    let results: Vec<Result<(), String>> = stream::iter(file_ids.iter().enumerate())
        .map(|(index, file_id)| {
            let db = db.clone();
            let file_id = file_id.clone();
            let semaphore = semaphore.clone();
            let hash_cache = hash_cache.clone();
            let completed_count = completed_count.clone();
            let error_count = error_count.clone();
            let last_reported = last_reported.clone();
            let progress_report_interval = progress_report_interval;

            async move {
                // 获取信号量许可（控制并发）
                let _permit = semaphore.acquire().await.map_err(|e| format!("Semaphore error: {}", e))?;

                // 检查暂停/取消
                let mut task_ctx = ctx.duplicate();
                if task_ctx.check_pause().await {
                    return Err("Task cancelled".to_string());
                }

                // 计算哈希
                let result = hasher::calculate_file_hash(&db, &file_id, task_ctx.duplicate(), hash_cache).await;

                // 原子计数器更新
                let current_completed = completed_count.fetch_add(1, Ordering::SeqCst) + 1;

                // 检查是否需要报告进度
                let should_report = {
                    let last = last_reported.load(Ordering::SeqCst);
                    let should_report_interval = current_completed - last >= progress_report_interval;
                    let should_report_percentage = (current_completed * 100 / total) % 5 == 0;

                    if should_report_interval || should_report_percentage {
                        last_reported.compare_exchange(last, current_completed, Ordering::SeqCst, Ordering::SeqCst).is_ok()
                    } else {
                        false
                    }
                };

                // 批量进度报告
                if should_report {
                    let progress = (current_completed as f64 / total as f64) * 100.0;
                    let _ = ctx.report_progress(
                        progress.min(99.0), // 保留1%给最终报告
                        Some(&format!("Processed {}/{} files", current_completed, total)),
                    ).await;
                }

                match result {
                    Ok(()) => Ok(()),
                    Err(e) => {
                        error_count.fetch_add(1, Ordering::SeqCst);
                        Err(format!("File {}: {}", file_id, e))
                    }
                }
            }
        })
        .buffer_unordered(max_concurrent)
        .collect()
        .await;

    // 收集错误信息
    let mut errors = Vec::new();
    for result in results {
        if let Err(e) = result {
            errors.push(e);
        }
    }

    let final_completed = completed_count.load(Ordering::SeqCst);
    let final_errors = error_count.load(Ordering::SeqCst);

    // 最终进度报告
    ctx.report_progress(100.0, Some(&format!("Completed {}/{} files", final_completed, total))).await?;

    // 错误统计和报告
    if !errors.is_empty() {
        tracing::warn!(
            "Batch hash calculation completed with {} errors out of {} files",
            final_errors,
            total
        );

        // 只记录前10个错误详情，避免日志过大
        for error in errors.iter().take(10) {
            tracing::error!("Hash calculation error: {}", error);
        }

        if errors.len() > 10 {
            tracing::error!("... and {} more errors", errors.len() - 10);
        }
    } else {
        tracing::info!("Batch hash calculation completed successfully: {}/{} files", final_completed, total);
    }

    Ok(())
}
