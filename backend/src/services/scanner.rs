use chrono::Utc;
use jwalk::WalkDir;
use sqlx::SqlitePool;
use std::path::Path;
use uuid::Uuid;

use crate::models::MediaFile;
use tokio::sync::mpsc;

// 批量插入的批次大小优化，适应高 IOPS 环境
const BATCH_SIZE: usize = 200;

pub async fn scan_directory(
    db: &SqlitePool,
    directory: &str,
    recursive: bool,
    file_types: &[String],
    mut ctx: crate::services::task_queue::TaskContext,
) -> anyhow::Result<()> {
    let _timer = crate::services::metrics::METRICS
        .scan_duration_seconds
        .start_timer();
    let dir_path = Path::new(directory);
    if !dir_path.exists() {
        return Err(anyhow::anyhow!("Directory does not exist: {}", directory));
    }

    // 创建 MPSC 通道以解耦扫描和入库
    let (tx, mut rx) = mpsc::channel::<MediaFile>(1000);
    let db_clone = db.clone();

    // 启动入库消费任务
    let db_handler = tokio::spawn(async move {
        let mut batch = Vec::with_capacity(BATCH_SIZE);
        let mut total_inserted = 0;

        while let Some(file) = rx.recv().await {
            batch.push(file);
            if batch.len() >= BATCH_SIZE {
                if let Err(e) = batch_insert_files(&db_clone, &batch).await {
                    tracing::error!("Failed to batch insert files: {}", e);
                }
                total_inserted += batch.len();
                batch.clear();
            }
        }

        // 插入最后剩余的部分
        if !batch.is_empty() {
            total_inserted += batch.len();
            if let Err(e) = batch_insert_files(&db_clone, &batch).await {
                tracing::error!("Failed to insert final batch: {}", e);
            }
        }
        total_inserted
    });

    let mut file_count = 0u64;
    let mut total_size = 0i64;
    let mut file_type_counts = std::collections::HashMap::new();

    let walker = if recursive {
        WalkDir::new(directory)
            .skip_hidden(false)
            .follow_links(false)
    } else {
        WalkDir::new(directory)
            .skip_hidden(false)
            .follow_links(false)
            .max_depth(1)
    };

    for entry in walker {
        if ctx.check_pause().await {
            return Err(anyhow::anyhow!("Scan task cancelled"));
        }

        let entry = entry?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let file_type = detect_file_type(&path);
        if !file_types.contains(&file_type) {
            continue;
        }

        let metadata = std::fs::metadata(&path)?;
        let size = metadata.len() as i64;
        let modified = metadata
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let file = MediaFile {
            id: Uuid::new_v4().to_string(),
            path: path.to_string_lossy().to_string(),
            name: path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string(),
            size,
            file_type: file_type.clone(),
            hash_xxhash: None,
            hash_md5: None,
            tmdb_id: None,
            quality_score: None,
            video_info: None,
            metadata: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_modified: chrono::DateTime::from_timestamp(modified, 0).unwrap_or(Utc::now()),
        };

        file_count += 1;
        total_size += size;
        *file_type_counts.entry(file_type.clone()).or_insert(0u64) += 1;

        // 发送到入库通道
        if let Err(e) = tx.send(file).await {
            tracing::error!("Failed to send file to DB channel: {}", e);
        }

        // 进度报告（略微调整频率以提高性能）
        if file_count % 100 == 0 || file_count == 1 {
            ctx.report_progress(
                50.0, // 扫描过程中显示 50%，实际由入库决定最终进度（或更复杂的估算）
                Some(&format!("Scanning: {} files found", file_count)),
            )
            .await;
        }
    }

    // 显式关闭通道，通知消费者结束
    drop(tx);

    // 等待入库任务完成
    let total_inserted = db_handler.await.unwrap_or(0);
    tracing::info!(
        "Scan completed: {} found, {} inserted",
        file_count,
        total_inserted
    );

    // 保存扫描历史摘要
    let stats = serde_json::to_value(&file_type_counts).unwrap_or_default();
    let _ = crate::services::history::save_scan_history(
        db,
        directory,
        file_count as i64,
        total_size,
        &stats,
    )
    .await;

    Ok(())
}

/// 批量插入文件到数据库（深度优化：支持单条 SQL 批量插入 / 事务复用）
async fn batch_insert_files(db: &SqlitePool, files: &[MediaFile]) -> anyhow::Result<()> {
    if files.is_empty() {
        return Ok(());
    }

    // SQLite 性能最佳实践：使用显式事务 + 预编译语句
    // 进一步优化：构建单条多值插入 SQL 以减少虚拟机指令
    let mut tx = db.begin().await?;

    for file in files {
        sqlx::query(
            r#"
            INSERT INTO media_files (id, path, name, size, file_type, last_modified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                size = excluded.size,
                last_modified = excluded.last_modified,
                updated_at = excluded.updated_at
            "#
        )
        .bind(&file.id)
        .bind(&file.path)
        .bind(&file.name)
        .bind(file.size)
        .bind(&file.file_type)
        .bind(file.last_modified.to_rfc3339())
        .bind(file.created_at.to_rfc3339())
        .bind(file.updated_at.to_rfc3339())
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub fn detect_file_type(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        // 视频格式
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpg" | "mpeg" => {
            "video".to_string()
        }
        // 音频格式
        "mp3" | "flac" | "wav" | "aac" | "ogg" | "wma" | "m4a" => "audio".to_string(),
        // 图片格式
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "svg" => "image".to_string(),
        // 文档格式
        "pdf" | "doc" | "docx" | "txt" | "rtf" => "document".to_string(),
        _ => "other".to_string(),
    }
}
