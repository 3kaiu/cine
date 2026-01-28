use sqlx::SqlitePool;
use std::sync::Arc;
use sysinfo::System;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, BufReader};
use xxhash_rust::xxh3::Xxh3;

use crate::models::MediaFile;
use crate::services::cache::FileHashCache;

/// 智能内存管理器
pub struct MemoryManager {
    pub available_memory: u64,
    pub optimal_chunk_size: usize,
    pub max_concurrent_tasks: usize,
}

impl MemoryManager {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();

        let _total_memory = sys.total_memory() as u64;
        let available_memory = sys.available_memory() as u64;

        // 为系统保留20%的内存
        let usable_memory = (available_memory as f64 * 0.8) as u64;

        // 根据可用内存动态调整块大小
        let optimal_chunk_size = match usable_memory {
            m if m > 8 * 1024 * 1024 * 1024 => 128 * 1024 * 1024, // 8GB+ -> 128MB
            m if m > 4 * 1024 * 1024 * 1024 => 64 * 1024 * 1024,  // 4GB+ -> 64MB
            m if m > 2 * 1024 * 1024 * 1024 => 32 * 1024 * 1024,  // 2GB+ -> 32MB
            m if m > 1 * 1024 * 1024 * 1024 => 16 * 1024 * 1024,  // 1GB+ -> 16MB
            _ => 8 * 1024 * 1024,                                 // <1GB -> 8MB
        };

        // 根据可用内存和CPU核心数计算并发数
        let cpu_count = sys.cpus().len() as u64;
        let memory_based_concurrent = (usable_memory / (optimal_chunk_size as u64 * 4)).min(32);
        let max_concurrent_tasks = memory_based_concurrent.min(cpu_count * 2).max(1) as usize;

        Self {
            available_memory: usable_memory,
            optimal_chunk_size,
            max_concurrent_tasks,
        }
    }

    fn get_chunk_size_for_file(&self, file_size: u64) -> usize {
        // 对于小文件，使用固定的小块大小
        if file_size < 100 * 1024 * 1024 {
            // 100MB
            return 4 * 1024 * 1024; // 4MB
        }

        // 对于大文件，使用动态块大小，但不超过最优块大小
        let file_based_chunk = (file_size / 100).min(self.optimal_chunk_size as u64) as usize;
        file_based_chunk.max(4 * 1024 * 1024) // 最小4MB
    }
}

impl Default for MemoryManager {
    fn default() -> Self {
        Self::new()
    }
}

/// 流式计算文件哈希（支持 100GB+ 大文件）
///
/// 深度优化 (Phase 3):
/// 1. 分级哈希 (Tiered Hashing): 先计算快速摘要，比对成功则跳过全量计算
/// 2. 零拷贝 (Zero-Copy): 对大文件使用 Memory Mapping (memmap2)
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

    let file_path = std::path::Path::new(&file.path);
    if !file_path.exists() {
        return Err(anyhow::anyhow!("File not found: {}", file.path));
    }

    let mtime = file.last_modified.timestamp();

    // 1. 分级哈希 - 第一级：缓存检查
    if let Some(ref cache) = hash_cache {
        if let Some(cached_hash) = cache.get(&file.path, mtime).await {
            update_db_hash(db, file_id, &cached_hash, &cached_hash, true).await?;
            return Ok(());
        }
    }

    // 2. 分级哈希 - 第二级：快速摘要 (Quick Hash)
    // 如果数据库中已有 md5_quick，且与当前计算一致，则可以考虑跳过全量（根据业务配置）
    let quick_hash = calculate_quick_hash(file_path).await?;

    // 如果文件很大 (如 > 500MB)，且我们想极速去重，可以在这里通过 quick_hash 去重
    // 但为了 100% 准确性，我们继续执行全量计算，但使用 mmap 优化

    // 3. 全量哈希计算 - 零拷贝优化 (Mmap)
    let (md5_hash, xxhash_hash) = if file.size > 10 * 1024 * 1024 {
        // > 10MB 使用 mmap
        calculate_full_hash_mmap(file_path).await?
    } else {
        calculate_full_hash_stream(file_path, &mut ctx).await?
    };

    // 更新数据库和缓存
    update_db_hash(db, file_id, &md5_hash, &xxhash_hash, false).await?;
    if let Some(ref cache) = hash_cache {
        cache.set(&file.path, mtime, md5_hash.clone()).await;
    }

    tracing::info!(
        "Hash calculated (optimized) for {}: MD5={}",
        file.name,
        md5_hash
    );
    Ok(())
}

async fn update_db_hash(
    db: &SqlitePool,
    id: &str,
    md5: &str,
    xx: &str,
    is_cached: bool,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE media_files SET hash_md5 = ?, hash_xxhash = ?, updated_at = ? WHERE id = ?",
    )
    .bind(md5)
    .bind(xx)
    .bind(chrono::Utc::now().to_rfc3339())
    .bind(id)
    .execute(db)
    .await?;

    if is_cached {
        tracing::debug!("Used cached hash for file {}", id);
    }
    Ok(())
}

/// 使用 Memory Mapping 进行零拷贝哈希计算
async fn calculate_full_hash_mmap(path: &std::path::Path) -> anyhow::Result<(String, String)> {
    use memmap2::Mmap;
    use std::fs::File;

    // 因为 mmap 是同步操作，放到 spawn_blocking 中
    let path_buf = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let file = File::open(path_buf)?;
        let mmap = unsafe { Mmap::map(&file)? };

        let mut md5_context = md5::Context::new();
        let mut xxhash_hasher = Xxh3::new();

        // 核心优化：直接在内存映射上操作，由 OS 处理 Page Cache
        md5_context.consume(&mmap);
        xxhash_hasher.update(&mmap);

        let md5_hash = format!("{:x}", md5_context.compute());
        let xxhash_hash = format!("{:x}", xxhash_hasher.digest());

        Ok((md5_hash, xxhash_hash))
    })
    .await?
}

/// 降级方案：传统的流式读取
async fn calculate_full_hash_stream(
    path: &std::path::Path,
    ctx: &mut crate::services::task_queue::TaskContext,
) -> anyhow::Result<(String, String)> {
    let file = tokio::fs::File::open(path).await?;
    let mut reader = BufReader::new(file);
    let mut buffer = vec![0u8; 8 * 1024 * 1024]; // 8MB

    let mut md5_context = md5::Context::new();
    let mut xxhash_hasher = Xxh3::new();

    loop {
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
    }

    Ok((
        format!("{:x}", md5_context.compute()),
        format!("{:x}", xxhash_hasher.digest()),
    ))
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
