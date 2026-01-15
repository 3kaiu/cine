use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, BufReader};
use xxhash_rust::xxh3::Xxh3;

use crate::models::MediaFile;
use crate::services::cache::FileHashCache;

/// 流式计算文件哈希（支持100GB+大文件）
pub async fn calculate_file_hash(
    db: &SqlitePool,
    file_id: &str,
    mut ctx: crate::services::task_queue::TaskContext,
    hash_cache: Option<Arc<FileHashCache>>,
) -> anyhow::Result<()> {
    // 获取文件信息
    let file: MediaFile = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(file_id)
        .fetch_one(db)
        .await?;

    let chunk_size = 64 * 1024 * 1024; // 64MB chunks
    let file_path = std::path::Path::new(&file.path);

    if !file_path.exists() {
        return Err(anyhow::anyhow!("File not found: {}", file.path));
    }

    // 检查缓存
    let mtime = file.last_modified.timestamp();
    if let Some(ref cache) = hash_cache {
        if let Some(cached_hash) = cache.get(&file.path, mtime).await {
            // 使用缓存的哈希值
            sqlx::query("UPDATE media_files SET hash_md5 = ?, updated_at = ? WHERE id = ?")
                .bind(&cached_hash)
                .bind(chrono::Utc::now().to_rfc3339())
                .bind(file_id)
                .execute(db)
                .await?;

            tracing::info!("Used cached hash for file {}", file_id);
            return Ok(());
        }
    }

    // 打开文件
    let file_handle = File::open(file_path).await?;
    let mut reader = BufReader::new(file_handle);
    let file_size = file.size as u64;

    // 初始化哈希器
    let mut md5_context = md5::Context::new();
    let mut xxhash_hasher = Xxh3::new();

    let mut total_read = 0u64;
    let mut buffer = vec![0u8; chunk_size];

    // 流式读取并计算哈希
    loop {
        // 检查暂停和取消
        if ctx.check_pause().await {
            return Err(anyhow::anyhow!("Hash task cancelled"));
        }

        let n = reader.read(&mut buffer).await?;
        if n == 0 {
            break;
        }

        let chunk = &buffer[..n];
        md5_context.consume(chunk);
        xxhash_hasher.update(chunk);

        total_read += n as u64;
        crate::services::metrics::METRICS
            .hash_throughput_bytes
            .inc_by(n as f64);

        // 计算进度并报告
        let progress = (total_read as f64 / file_size as f64) * 100.0;

        // 每处理 10% 或每 100MB 发送一次进度
        if total_read % (100 * 1024 * 1024) == 0 || (progress as u64) % 10 == 0 {
            ctx.report_progress(progress, Some(&format!("Processing: {:.1}%", progress)))
                .await;
            tracing::debug!("Hash progress for {}: {:.2}%", file_id, progress);
        }
    }

    // 获取最终哈希值
    let md5_hash = format!("{:x}", md5_context.compute());
    let xxhash_hash = format!("{:x}", xxhash_hasher.digest());

    // 更新数据库
    sqlx::query(
        "UPDATE media_files SET hash_md5 = ?, hash_xxhash = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&md5_hash)
    .bind(&xxhash_hash)
    .bind(chrono::Utc::now().to_rfc3339())
    .bind(file_id)
    .execute(db)
    .await?;

    // 更新缓存
    if let Some(ref cache) = hash_cache {
        cache.set(&file.path, mtime, md5_hash.clone()).await;
    }

    tracing::info!(
        "Hash calculated for file {}: MD5={}, XXHash={}",
        file_id,
        md5_hash,
        xxhash_hash
    );
    Ok(())
}

/// 批量计算哈希（用于去重）- 使用 rayon 并行处理
///
/// 返回每个文件的哈希结果: (file_path, md5, xxhash)
pub fn calculate_hashes_batch_parallel(
    file_paths: &[String],
) -> Vec<Result<(String, String, String), String>> {
    use rayon::prelude::*;
    use std::io::Read;

    file_paths
        .par_iter()
        .map(|file_path| {
            let path = std::path::Path::new(file_path);
            if !path.exists() {
                return Err(format!("File not found: {}", file_path));
            }

            let mut file = match std::fs::File::open(path) {
                Ok(f) => f,
                Err(e) => return Err(format!("Failed to open {}: {}", file_path, e)),
            };

            let chunk_size = 64 * 1024 * 1024; // 64MB
            let mut buffer = vec![0u8; chunk_size];
            let mut md5_ctx = md5::Context::new();
            let mut xxh3 = Xxh3::new();

            loop {
                match file.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(n) => {
                        md5_ctx.consume(&buffer[..n]);
                        xxh3.update(&buffer[..n]);
                    }
                    Err(e) => return Err(format!("Read error for {}: {}", file_path, e)),
                }
            }

            let md5_hash = format!("{:x}", md5_ctx.compute());
            let xxhash = format!("{:x}", xxh3.digest());

            Ok((file_path.clone(), md5_hash, xxhash))
        })
        .collect()
}

/// 异步包装器：在 tokio 运行时中调用并行哈希
pub async fn calculate_hashes_batch_async(
    file_paths: Vec<String>,
) -> Vec<Result<(String, String, String), String>> {
    tokio::task::spawn_blocking(move || calculate_hashes_batch_parallel(&file_paths))
        .await
        .unwrap_or_else(|e| vec![Err(format!("Task panicked: {}", e))])
}

/// 快速哈希（仅用于初步筛选）
///
/// 只读取文件的前 64MB 和最后 64MB 来计算快速哈希，
/// 适用于大文件的快速预筛选。
///
/// # 参数
/// - `file_path`: 文件路径
///
/// # 返回值
/// 返回 XXHash3 快速哈希值
///
/// # 用途
/// 用于大文件去重的初步筛选，减少完整哈希计算的数量
#[allow(dead_code)]
pub async fn calculate_quick_hash(file_path: &std::path::Path) -> anyhow::Result<String> {
    // 只读取文件的前64MB和最后64MB来计算快速哈希
    let mut file = File::open(file_path).await?;
    let metadata = file.metadata().await?;
    let file_size = metadata.len();

    let mut hasher = Xxh3::new();
    let chunk_size = 64 * 1024 * 1024; // 64MB

    // 读取前64MB
    let mut buffer = vec![0u8; chunk_size.min(file_size as usize)];
    let n = file.read(&mut buffer).await?;
    hasher.update(&buffer[..n]);

    // 如果文件大于128MB，读取最后64MB（复用同一个文件句柄）
    if file_size > (chunk_size as u64) * 2 {
        let start_pos = file_size.saturating_sub(chunk_size as u64);
        file.seek(std::io::SeekFrom::Start(start_pos)).await?;
        let n = file.read(&mut buffer).await?;
        hasher.update(&buffer[..n]);
    }

    Ok(format!("{:x}", hasher.digest()))
}
