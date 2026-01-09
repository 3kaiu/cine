use crate::models::ScanHistory;
use chrono::Utc;
use sqlx::SqlitePool;

/// 保存或更新目录扫描历史
pub async fn save_scan_history(
    db: &SqlitePool,
    directory: &str,
    total_files: i64,
    total_size: i64,
    file_types: &serde_json::Value,
) -> anyhow::Result<()> {
    let file_types_json = serde_json::to_string(file_types)?;
    sqlx::query(
        "INSERT INTO scan_history (directory, total_files, total_size, file_types_json, last_scanned_at) 
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(directory) DO UPDATE SET 
            total_files = excluded.total_files,
            total_size = excluded.total_size,
            file_types_json = excluded.file_types_json,
            last_scanned_at = excluded.last_scanned_at"
    )
    .bind(directory)
    .bind(total_files)
    .bind(total_size)
    .bind(file_types_json)
    .bind(Utc::now())
    .execute(db)
    .await?;
    Ok(())
}

/// 获取所有扫描历史摘要
pub async fn get_all_history(db: &SqlitePool) -> anyhow::Result<Vec<ScanHistory>> {
    let history = sqlx::query_as::<_, ScanHistory>(
        "SELECT * FROM scan_history ORDER BY last_scanned_at DESC",
    )
    .fetch_all(db)
    .await?;
    Ok(history)
}
