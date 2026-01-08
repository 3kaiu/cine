use cine_backend::services::trash;
use cine_backend::tests::common::{create_test_db, create_test_file};
use chrono::Utc;

#[tokio::test]
async fn test_move_to_trash() {
    let (pool, temp_dir) = create_test_db().await;
    let file_path = create_test_file(&temp_dir, "test.txt", b"test content");
    let trash_dir = temp_dir.path().join("trash");
    
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("test.txt")
    .bind(12)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let trash_config = trash::TrashConfig::new(&trash_dir);
    let result = trash::move_to_trash(&pool, &file_id, &trash_config).await;

    assert!(result.is_ok());
    let item = result.unwrap();
    
    // 验证文件已移动到回收站
    assert!(!file_path.exists());
    assert!(std::path::Path::new(&item.trash_path).exists());
    assert_eq!(item.original_name, "test.txt");
}

#[tokio::test]
async fn test_restore_from_trash() {
    let (pool, temp_dir) = create_test_db().await;
    let trash_dir = temp_dir.path().join("trash");
    std::fs::create_dir_all(&trash_dir).unwrap();
    
    let trash_file = trash_dir.join("20240101_120000_test.txt");
    std::fs::write(&trash_file, b"test content").unwrap();
    
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(trash_file.to_string_lossy().to_string())
    .bind("test.txt")
    .bind(12)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let restore_dir = temp_dir.path().join("restored");
    let result = trash::restore_from_trash(
        &pool,
        &file_id,
        Some(restore_dir.to_str().unwrap()),
    ).await;

    assert!(result.is_ok());
    let restored_path = result.unwrap();
    
    // 验证文件已恢复
    assert!(!trash_file.exists());
    assert!(std::path::Path::new(&restored_path).exists());
}

#[tokio::test]
async fn test_permanently_delete() {
    let (pool, temp_dir) = create_test_db().await;
    let file_path = create_test_file(&temp_dir, "test.txt", b"test content");
    
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("test.txt")
    .bind(12)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = trash::permanently_delete(&pool, &file_id).await;
    assert!(result.is_ok());
    
    // 验证文件已删除
    assert!(!file_path.exists());
    
    // 验证数据库记录已删除
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files WHERE id = ?")
        .bind(&file_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
