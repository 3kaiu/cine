use crate::models::OperationLog;
use chrono::Utc;
use sqlx::SqlitePool;
use uuid::Uuid;

/// 记录一次文件操作
pub async fn record_operation(
    db: &SqlitePool,
    action: &str,
    file_id: Option<&str>,
    old_path: &str,
    new_path: Option<&str>,
) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO operation_logs (id, action, file_id, old_path, new_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(Uuid::new_v4().to_string())
    .bind(action)
    .bind(file_id)
    .bind(old_path)
    .bind(new_path)
    .bind(Utc::now())
    .execute(db)
    .await?;
    Ok(())
}

/// 获取最近的操作日志
pub async fn get_recent_logs(db: &SqlitePool, limit: i64) -> anyhow::Result<Vec<OperationLog>> {
    let logs = sqlx::query_as::<_, OperationLog>(
        "SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(db)
    .await?;
    Ok(logs)
}
