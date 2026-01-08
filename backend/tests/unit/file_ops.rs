use cine_backend::services::file_ops;
#[path = "../common/mod.rs"]
mod common;
use common::{create_test_db, create_test_file};
use chrono::Utc;

#[tokio::test]
async fn test_move_file() {
    let (pool, temp_dir) = create_test_db().await;
    let file_path = create_test_file(&temp_dir, "source.txt", b"test content");
    let target_dir = temp_dir.path().join("target");
    
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("source.txt")
    .bind(12)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = file_ops::move_file(
        &pool,
        &file_id,
        target_dir.to_str().unwrap(),
    ).await;

    assert!(result.is_ok());
    let result = result.unwrap();
    assert!(result.success);
    assert!(result.new_path.is_some());
    
    // 验证文件已移动
    assert!(!file_path.exists());
    assert!(std::path::Path::new(&result.new_path.unwrap()).exists());
}

#[tokio::test]
async fn test_copy_file() {
    let (pool, temp_dir) = create_test_db().await;
    let file_path = create_test_file(&temp_dir, "source.txt", b"test content");
    let target_dir = temp_dir.path().join("target");
    
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("source.txt")
    .bind(12)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = file_ops::copy_file(
        &pool,
        &file_id,
        target_dir.to_str().unwrap(),
    ).await;

    assert!(result.is_ok());
    let result = result.unwrap();
    assert!(result.success);
    assert!(result.new_path.is_some());
    
    // 验证原文件还在，新文件已创建
    assert!(file_path.exists());
    let new_path = result.new_path.unwrap();
    let copied_path = std::path::Path::new(&new_path);
    assert!(copied_path.exists());
    
    // 验证内容相同
    let original = std::fs::read(&file_path).unwrap();
    let copied = std::fs::read(copied_path).unwrap();
    assert_eq!(original, copied);
}

#[tokio::test]
async fn test_move_file_target_exists() {
    let (pool, temp_dir) = create_test_db().await;
    let file_path = create_test_file(&temp_dir, "source.txt", b"test content");
    let target_dir = temp_dir.path().join("target");
    std::fs::create_dir_all(&target_dir).unwrap();
    std::fs::write(target_dir.join("source.txt"), b"existing").unwrap();
    
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("source.txt")
    .bind(12)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = file_ops::move_file(
        &pool,
        &file_id,
        target_dir.to_str().unwrap(),
    ).await;

    assert!(result.is_ok());
    let result = result.unwrap();
    assert!(!result.success);
    assert!(result.error.is_some());
    assert!(result.error.unwrap().contains("already exists"));
}
