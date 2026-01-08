//! 并行哈希计算测试

use cine_backend::services::hasher_parallel;
use cine_backend::tests::common::{create_test_db, create_test_file};
use chrono::Utc;
use uuid::Uuid;

#[tokio::test]
async fn test_batch_calculate_hash_parallel() {
    let (pool, temp_dir) = create_test_db().await;
    
    // 创建多个测试文件
    let mut file_ids = Vec::new();
    for i in 0..5 {
        let content = format!("test content {}", i);
        let file_path = create_test_file(&temp_dir, &format!("test_{}.txt", i), content.as_bytes());
        
        let file_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&file_id)
        .bind(file_path.to_string_lossy().to_string())
        .bind(&format!("test_{}.txt", i))
        .bind(content.len() as i64)
        .bind("document")
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
        
        file_ids.push(file_id);
    }

    // 并行计算哈希
    let result = hasher_parallel::batch_calculate_hash_parallel(
        &pool,
        &file_ids,
        2, // 最大并发数：2
        "test-task",
        None,
        None,
    ).await;

    assert!(result.is_ok());
    
    // 验证所有文件的哈希值都已计算
    for file_id in &file_ids {
        let hash: Option<String> = sqlx::query_scalar("SELECT hash_md5 FROM media_files WHERE id = ?")
            .bind(file_id)
            .fetch_optional(&pool)
            .await
            .unwrap();
        
        assert!(hash.is_some(), "File {} should have hash", file_id);
    }
}

#[tokio::test]
async fn test_batch_calculate_hash_parallel_empty_list() {
    let (pool, _temp_dir) = create_test_db().await;
    
    let result = hasher_parallel::batch_calculate_hash_parallel(
        &pool,
        &[],
        2,
        "test-task",
        None,
        None,
    ).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn test_batch_calculate_hash_parallel_single_file() {
    let (pool, temp_dir) = create_test_db().await;
    
    let content = b"single file content";
    let file_path = create_test_file(&temp_dir, "single.txt", content);
    
    let file_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("single.txt")
    .bind(content.len() as i64)
    .bind("document")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = hasher_parallel::batch_calculate_hash_parallel(
        &pool,
        &[file_id.clone()],
        1,
        "test-task",
        None,
        None,
    ).await;

    assert!(result.is_ok());
    
    let hash: Option<String> = sqlx::query_scalar("SELECT hash_md5 FROM media_files WHERE id = ?")
        .bind(&file_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    
    assert!(hash.is_some());
}
