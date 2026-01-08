use cine_backend::services::hasher;
use cine_backend::services::cache::FileHashCache;
use cine_backend::tests::common::{create_test_db, create_test_file};
use cine_backend::models::MediaFile;
use chrono::Utc;
use std::sync::Arc;

#[tokio::test]
async fn test_calculate_file_hash_small_file() {
    let (pool, temp_dir) = create_test_db().await;
    let content = b"This is test content for hashing";
    let file_path = create_test_file(&temp_dir, "test.txt", content);
    
    // 插入测试文件记录
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("test.txt")
    .bind(content.len() as i64)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = hasher::calculate_file_hash(
        &pool,
        &file_id,
        "test-task",
        None,
        None,
    ).await;

    assert!(result.is_ok());
    
    // 验证哈希值已保存
    let hash: Option<String> = sqlx::query_scalar("SELECT hash_md5 FROM media_files WHERE id = ?")
        .bind(&file_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    
    assert!(hash.is_some());
    assert_eq!(hash.unwrap().len(), 32); // MD5 哈希长度
}

#[tokio::test]
async fn test_calculate_file_hash_with_cache() {
    let (pool, temp_dir) = create_test_db().await;
    let content = b"Test content";
    let file_path = create_test_file(&temp_dir, "test.txt", content);
    
    let file_id = uuid::Uuid::new_v4().to_string();
    let mtime = Utc::now().timestamp();
    
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("test.txt")
    .bind(content.len() as i64)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(chrono::DateTime::from_timestamp(mtime, 0).unwrap().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let cache = Arc::new(FileHashCache::new());
    let cache_key = FileHashCache::cache_key(&file_path.to_string_lossy(), mtime);
    cache.set(&file_path.to_string_lossy(), mtime, "cached_hash_value".to_string()).await;

    // 第一次计算（应该使用缓存）
    let result1 = hasher::calculate_file_hash(
        &pool,
        &file_id,
        "test-task",
        None,
        Some(cache.clone()),
    ).await;
    
    assert!(result1.is_ok());
    
    // 验证缓存被使用
    let cached = cache.get(&file_path.to_string_lossy(), mtime).await;
    assert!(cached.is_some());
}

#[tokio::test]
async fn test_calculate_file_hash_nonexistent_file() {
    let (pool, _temp_dir) = create_test_db().await;
    
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind("/nonexistent/file.txt")
    .bind("file.txt")
    .bind(100)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = hasher::calculate_file_hash(
        &pool,
        &file_id,
        "test-task",
        None,
        None,
    ).await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("not found"));
}
