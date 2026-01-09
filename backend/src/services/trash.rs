use crate::models::MediaFile;
use chrono::Utc;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use tokio::fs;

/// 回收站配置
pub struct TrashConfig {
    pub trash_dir: PathBuf,
    pub max_age_days: i64,
}

impl TrashConfig {
    pub fn new(trash_dir: impl AsRef<Path>) -> Self {
        Self {
            trash_dir: trash_dir.as_ref().to_path_buf(),
            max_age_days: 30, // 默认30天
        }
    }

    pub async fn ensure_exists(&self) -> anyhow::Result<()> {
        if !self.trash_dir.exists() {
            fs::create_dir_all(&self.trash_dir).await?;
        }
        Ok(())
    }
}

/// 删除的文件记录
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TrashItem {
    pub id: String,
    pub original_path: String,
    pub original_name: String,
    pub trash_path: String,
    pub file_size: i64,
    pub deleted_at: String, // ISO 8601
    pub file_type: String,
}

/// 移动到回收站
pub async fn move_to_trash(
    db: &SqlitePool,
    file_id: &str,
    trash_config: &TrashConfig,
) -> anyhow::Result<TrashItem> {
    trash_config.ensure_exists().await?;

    // 获取文件信息
    let file: MediaFile = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(file_id)
        .fetch_one(db)
        .await?;

    let source_path = PathBuf::from(&file.path);

    // 生成回收站中的唯一文件名（包含时间戳）
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let file_name = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let trash_file_name = format!("{}_{}", timestamp, file_name);
    let trash_path = trash_config.trash_dir.join(&trash_file_name);

    // 移动文件到回收站
    fs::rename(&source_path, &trash_path).await?;

    let trash_item = TrashItem {
        id: file_id.to_string(),
        original_path: file.path.clone(),
        original_name: file.name.clone(),
        trash_path: trash_path.to_string_lossy().to_string(),
        file_size: file.size,
        deleted_at: Utc::now().to_rfc3339(),
        file_type: file.file_type,
    };

    // 保存到数据库（可以创建单独的 trash_items 表）
    // 这里简化处理，只更新原记录
    sqlx::query("UPDATE media_files SET path = ?, updated_at = ? WHERE id = ?")
        .bind(&trash_item.trash_path)
        .bind(trash_item.deleted_at.clone())
        .bind(file_id)
        .execute(db)
        .await?;

    // 记录操作日志
    let _ = crate::services::log::record_operation(
        db,
        "trash",
        Some(file_id),
        &file.path,
        Some(&trash_item.trash_path),
    )
    .await;

    Ok(trash_item)
}

/// 从回收站恢复文件
pub async fn restore_from_trash(
    db: &SqlitePool,
    file_id: &str,
    target_path: Option<&str>,
) -> anyhow::Result<String> {
    // 获取文件信息
    let file: MediaFile = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(file_id)
        .fetch_one(db)
        .await?;

    let trash_path = PathBuf::from(&file.path);

    if !trash_path.exists() {
        return Err(anyhow::anyhow!("Trash file not found"));
    }

    // 确定恢复路径
    let restore_path = if let Some(target) = target_path {
        PathBuf::from(target)
    } else {
        // 尝试从原始路径恢复
        // 这里简化处理，恢复到原目录的父目录
        trash_path
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join(&file.name))
            .ok_or_else(|| anyhow::anyhow!("Cannot determine restore path"))?
    };

    // 确保目标目录存在
    if let Some(parent) = restore_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // 恢复文件
    fs::rename(&trash_path, &restore_path).await?;

    let restore_path_str = restore_path.to_string_lossy().to_string();

    // 更新数据库
    sqlx::query("UPDATE media_files SET path = ?, updated_at = ? WHERE id = ?")
        .bind(&restore_path_str)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(file_id)
        .execute(db)
        .await?;

    // 记录操作日志
    let _ = crate::services::log::record_operation(
        db,
        "restore",
        Some(file_id),
        &file.path, // 恢复前路径（在回收站中）
        Some(&restore_path_str),
    )
    .await;

    Ok(restore_path_str)
}

/// 永久删除（从回收站删除）
pub async fn permanently_delete(db: &SqlitePool, file_id: &str) -> anyhow::Result<()> {
    // 获取文件信息
    let file: MediaFile = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(file_id)
        .fetch_one(db)
        .await?;

    let file_path = PathBuf::from(&file.path);

    // 删除文件
    if file_path.exists() {
        if file_path.is_file() {
            fs::remove_file(&file_path).await?;
        } else {
            fs::remove_dir_all(&file_path).await?;
        }
    }

    // 记录操作日志
    let _ =
        crate::services::log::record_operation(db, "delete", Some(file_id), &file.path, None).await;

    // 从数据库删除记录
    sqlx::query("DELETE FROM media_files WHERE id = ?")
        .bind(file_id)
        .execute(db)
        .await?;

    Ok(())
}

/// 清理过期的回收站文件
pub async fn cleanup_trash(db: &SqlitePool, trash_config: &TrashConfig) -> anyhow::Result<usize> {
    let cutoff_date = Utc::now() - chrono::Duration::days(trash_config.max_age_days);
    let cutoff_str = cutoff_date.to_rfc3339();

    // 查找过期的文件
    let expired_files: Vec<MediaFile> =
        sqlx::query_as("SELECT * FROM media_files WHERE path LIKE ? AND updated_at < ?")
            .bind(format!("{}%", trash_config.trash_dir.to_string_lossy()))
            .bind(cutoff_str)
            .fetch_all(db)
            .await?;

    let mut deleted_count = 0;

    for file in expired_files {
        let file_path = PathBuf::from(&file.path);
        if file_path.exists() {
            if let Err(e) = fs::remove_file(&file_path).await {
                tracing::warn!("Failed to delete expired trash file {}: {}", file.path, e);
                continue;
            }
        }

        // 从数据库删除
        if let Err(e) = sqlx::query("DELETE FROM media_files WHERE id = ?")
            .bind(&file.id)
            .execute(db)
            .await
        {
            tracing::warn!("Failed to delete database record for {}: {}", file.id, e);
            continue;
        }

        deleted_count += 1;
    }

    Ok(deleted_count)
}

/// 获取回收站列表
pub async fn list_trash(
    db: &SqlitePool,
    trash_config: &TrashConfig,
) -> anyhow::Result<Vec<TrashItem>> {
    let trash_prefix = trash_config.trash_dir.to_string_lossy().to_string();

    let files: Vec<MediaFile> =
        sqlx::query_as("SELECT * FROM media_files WHERE path LIKE ? ORDER BY updated_at DESC")
            .bind(format!("{}%", trash_prefix))
            .fetch_all(db)
            .await?;

    let trash_items: Vec<TrashItem> = files
        .into_iter()
        .map(|file| {
            TrashItem {
                id: file.id,
                original_path: file.path.clone(), // 这里可以存储原始路径
                original_name: file.name.clone(),
                trash_path: file.path,
                file_size: file.size,
                deleted_at: file.updated_at.to_rfc3339(),
                file_type: file.file_type,
            }
        })
        .collect();

    Ok(trash_items)
}
