use md5;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, BufReader};
use tokio::sync::mpsc;
use xxhash_rust::xxh3::Xxh3;

use crate::models::MediaFile;
use crate::services::cache::FileHashCache;
use crate::websocket::{ProgressBroadcaster, ProgressMessage};

/// 流式计算文件哈希（支持100GB+大文件）
pub async fn calculate_file_hash(
    db: &SqlitePool,
    file_id: &str,
    task_id: &str,
    progress_broadcaster: Option<Arc<ProgressBroadcaster>>,
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
        let n = reader.read(&mut buffer).await?;
        if n == 0 {
            break;
        }

        let chunk = &buffer[..n];
        md5_context.consume(chunk);
        xxhash_hasher.update(chunk);

        total_read += n as u64;

        // 计算进度并发送到 WebSocket
        let progress = (total_read as f64 / file_size as f64) * 100.0;

        // 每处理 10% 或每 100MB 发送一次进度
        if total_read % (100 * 1024 * 1024) == 0 || (progress as u64) % 10 == 0 {
            if let Some(ref broadcaster) = progress_broadcaster {
                broadcaster.send(ProgressMessage {
                    task_id: task_id.to_string(),
                    task_type: "hash".to_string(),
                    progress,
                    current_file: Some(file.name.clone()),
                    message: Some(format!("Processing: {:.1}%", progress)),
                });
            }
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

/// 批量计算哈希（用于去重）
///
/// # 参数
/// - `db`: 数据库连接池
/// - `file_ids`: 要计算哈希的文件 ID 列表
/// - `progress_tx`: 进度发送器（可选）
///
/// # 用途
/// 在文件去重流程中顺序计算多个文件的哈希值
pub async fn calculate_hashes_batch(
    db: &SqlitePool,
    file_ids: &[String],
    progress_tx: Option<mpsc::Sender<(String, f64)>>, // (file_id, progress)
) -> anyhow::Result<()> {
    let total = file_ids.len();

    for (index, file_id) in file_ids.iter().enumerate() {
        if let Err(e) = calculate_file_hash(db, file_id, "", None, None).await {
            tracing::error!("Failed to calculate hash for {}: {}", file_id, e);
            continue;
        }

        // 发送进度
        if let Some(ref tx) = progress_tx {
            let progress = ((index + 1) as f64 / total as f64) * 100.0;
            let _ = tx.send((file_id.clone(), progress)).await;
        }
    }

    Ok(())
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
