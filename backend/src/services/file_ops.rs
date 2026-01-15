use crate::models::MediaFile;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use tokio::fs;

/// 文件操作结果
#[derive(Debug, Clone, serde::Serialize, utoipa::ToSchema)]
pub struct FileOperationResult {
    pub file_id: String,
    pub success: bool,
    pub new_path: Option<String>,
    pub error: Option<String>,
}

/// 移动文件
pub async fn move_file(
    db: &SqlitePool,
    file_id: &str,
    target_dir: &str,
) -> anyhow::Result<FileOperationResult> {
    // 获取文件信息
    let file: MediaFile = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(file_id)
        .fetch_one(db)
        .await?;

    let source_path = PathBuf::from(&file.path);
    let target_dir_path = Path::new(target_dir);

    // 确保目标目录存在
    if !target_dir_path.exists() {
        fs::create_dir_all(target_dir_path).await?;
    }

    // 构建目标路径
    let file_name = source_path
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Invalid file name"))?;
    let target_path = target_dir_path.join(file_name);

    // 检查目标文件是否已存在
    if target_path.exists() {
        return Ok(FileOperationResult {
            file_id: file_id.to_string(),
            success: false,
            new_path: None,
            error: Some("Target file already exists".to_string()),
        });
    }

    // 移动文件
    fs::rename(&source_path, &target_path).await?;

    let new_path_str = target_path.to_string_lossy().to_string();

    // 更新数据库
    sqlx::query("UPDATE media_files SET path = ?, updated_at = ? WHERE id = ?")
        .bind(&new_path_str)
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(file_id)
        .execute(db)
        .await?;

    Ok(FileOperationResult {
        file_id: file_id.to_string(),
        success: true,
        new_path: Some(new_path_str),
        error: None,
    })
}

/// 复制文件（流式复制，支持大文件）
pub async fn copy_file(
    db: &SqlitePool,
    file_id: &str,
    target_dir: &str,
) -> anyhow::Result<FileOperationResult> {
    // 获取文件信息
    let file: MediaFile = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(file_id)
        .fetch_one(db)
        .await?;

    let source_path = PathBuf::from(&file.path);
    let target_dir_path = Path::new(target_dir);

    // 确保目标目录存在
    if !target_dir_path.exists() {
        fs::create_dir_all(target_dir_path).await?;
    }

    // 构建目标路径
    let file_name = source_path
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Invalid file name"))?;
    let target_path = target_dir_path.join(file_name);

    // 检查目标文件是否已存在
    if target_path.exists() {
        return Ok(FileOperationResult {
            file_id: file_id.to_string(),
            success: false,
            new_path: None,
            error: Some("Target file already exists".to_string()),
        });
    }

    // 流式复制文件（支持大文件）
    let mut source_file = tokio::fs::File::open(&source_path).await?;
    let mut target_file = tokio::fs::File::create(&target_path).await?;

    let chunk_size = 64 * 1024 * 1024; // 64MB chunks
    let mut buffer = vec![0u8; chunk_size];

    loop {
        let n = tokio::io::AsyncReadExt::read(&mut source_file, &mut buffer).await?;
        if n == 0 {
            break;
        }
        tokio::io::AsyncWriteExt::write_all(&mut target_file, &buffer[..n]).await?;
    }

    target_file.sync_all().await?;

    let new_path_str = target_path.to_string_lossy().to_string();

    // 可以选择是否在数据库中创建新记录
    // 这里只返回结果，不创建新记录

    Ok(FileOperationResult {
        file_id: file_id.to_string(),
        success: true,
        new_path: Some(new_path_str),
        error: None,
    })
}

/// 批量移动文件
pub async fn move_files_batch(
    db: &SqlitePool,
    file_ids: &[String],
    target_dir: &str,
) -> anyhow::Result<Vec<FileOperationResult>> {
    let mut results = Vec::new();

    for file_id in file_ids {
        match move_file(db, file_id, target_dir).await {
            Ok(result) => results.push(result),
            Err(e) => results.push(FileOperationResult {
                file_id: file_id.clone(),
                success: false,
                new_path: None,
                error: Some(e.to_string()),
            }),
        }
    }

    Ok(results)
}

/// 批量复制文件
pub async fn copy_files_batch(
    db: &SqlitePool,
    file_ids: &[String],
    target_dir: &str,
) -> anyhow::Result<Vec<FileOperationResult>> {
    let mut results = Vec::new();

    for file_id in file_ids {
        match copy_file(db, file_id, target_dir).await {
            Ok(result) => results.push(result),
            Err(e) => results.push(FileOperationResult {
                file_id: file_id.clone(),
                success: false,
                new_path: None,
                error: Some(e.to_string()),
            }),
        }
    }

    Ok(results)
}
