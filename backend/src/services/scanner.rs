use chrono::Utc;
use sqlx::SqlitePool;
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::models::MediaFile;

// 批量插入的批次大小
const BATCH_SIZE: usize = 100;

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

    let mut file_count = 0u64;
    let mut processed_count = 0u64;

    // 优化：单次遍历，动态估算进度
    // 使用指数移动平均来估算剩余文件数
    let mut estimated_remaining = 100u64; // 初始估算
    let alpha = 0.1; // 平滑系数

    let mut file_batch: Vec<MediaFile> = Vec::with_capacity(BATCH_SIZE);
    let mut total_size = 0i64;
    let mut file_type_counts = std::collections::HashMap::new();

    // 遍历目录（只遍历一次）
    let walker = if recursive {
        WalkDir::new(directory).into_iter()
    } else {
        WalkDir::new(directory).max_depth(1).into_iter()
    };

    for entry in walker {
        // 检查暂停和取消
        if ctx.check_pause().await {
            return Err(anyhow::anyhow!("Scan task cancelled"));
        }

        let entry = entry?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        // 检查文件类型
        let file_type = detect_file_type(path);
        if !file_types.contains(&file_type) {
            continue;
        }

        // 获取文件元数据
        let metadata = std::fs::metadata(path)?;
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

        // 保存文件名用于进度显示

        // 收集文件信息到批量缓冲区
        file_batch.push(file);
        file_count += 1;
        processed_count += 1;
        total_size += size;
        *file_type_counts.entry(file_type.clone()).or_insert(0u64) += 1;

        // 当批次达到大小时，批量插入
        if file_batch.len() >= BATCH_SIZE {
            batch_insert_files(db, &file_batch).await?;
            file_batch.clear();
        }

        // 动态更新估算（使用指数移动平均）
        if processed_count % 10 == 0 {
            // 每处理10个文件，更新一次估算
            let current_rate = processed_count as f64 / file_count as f64;
            estimated_remaining = ((1.0 - alpha) * estimated_remaining as f64
                + alpha * (file_count as f64 / current_rate.max(0.1)))
                as u64;
        }

        // 报告进度
        let total_estimated = file_count + estimated_remaining;
        let progress = if total_estimated > 0 {
            (file_count as f64 / total_estimated as f64) * 100.0
        } else {
            0.0
        };

        // 每处理50个文件或进度变化超过5%时发送更新
        if processed_count % 50 == 0 || processed_count == 1 {
            ctx.report_progress(
                progress.min(99.0),
                Some(&format!(
                    "Scanned {} files (estimated {} total)",
                    file_count, total_estimated
                )),
            )
            .await;
        }

        // 每处理100个文件，记录一次日志
        if file_count % 100 == 0 {
            tracing::info!("Scanned {} files...", file_count);
        }
    }

    // 插入剩余的文件
    if !file_batch.is_empty() {
        batch_insert_files(db, &file_batch).await?;
    }

    tracing::info!("Scan completed: {} files found", file_count);

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

/// 批量插入文件到数据库（优化性能）
async fn batch_insert_files(db: &SqlitePool, files: &[MediaFile]) -> anyhow::Result<()> {
    if files.is_empty() {
        return Ok(());
    }

    // 使用事务批量插入
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
