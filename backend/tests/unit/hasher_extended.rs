//! 哈希计算服务扩展测试

use cine_backend::services::hasher;
use cine_backend::services::cache::FileHashCache;
#[path = "../common/mod.rs"]
mod common;
use common::{create_test_db, create_test_file};
use chrono::Utc;
use std::sync::Arc;

#[tokio::test]
async fn test_calculate_file_hash_empty_file() {
    let (pool, temp_dir) = create_test_db().await;
    let file_path = create_test_file(&temp_dir, "empty.txt", b"");
    
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(file_path.to_string_lossy().to_string())
    .bind("empty.txt")
    .bind(0)
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
    
    let hash: Option<String> = sqlx::query_scalar("SELECT hash_md5 FROM media_files WHERE id = ?")
        .bind(&file_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    
    assert!(hash.is_some());
    // 空文件的 MD5 应该是 d41d8cd98f00b204e9800998ecf8427e
    assert_eq!(hash.unwrap(), "d41d8cd98f00b204e9800998ecf8427e");
}

#[tokio::test]
async fn test_calculate_file_hash_identical_files() {
    let (pool, temp_dir) = create_test_db().await;
    let content = b"Identical content";
    let file1_path = create_test_file(&temp_dir, "file1.txt", content);
    let file2_path = create_test_file(&temp_dir, "file2.txt", content);
    
    let file1_id = uuid::Uuid::new_v4().to_string();
    let file2_id = uuid::Uuid::new_v4().to_string();
    
    for (file_id, file_path) in [(&file1_id, &file1_path), (&file2_id, &file2_path)] {
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(file_id)
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
    }

    // 计算两个文件的哈希
    hasher::calculate_file_hash(&pool, &file1_id, "task1", None, None).await.unwrap();
    hasher::calculate_file_hash(&pool, &file2_id, "task2", None, None).await.unwrap();
    
    // 验证哈希值相同
    let hash1: Option<String> = sqlx::query_scalar("SELECT hash_md5 FROM media_files WHERE id = ?")
        .bind(&file1_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    
    let hash2: Option<String> = sqlx::query_scalar("SELECT hash_md5 FROM media_files WHERE id = ?")
        .bind(&file2_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    
    assert_eq!(hash1, hash2);
    assert!(hash1.is_some());
}

#[tokio::test]
async fn test_calculate_file_hash_different_files() {
    let (pool, temp_dir) = create_test_db().await;
    let file1_path = create_test_file(&temp_dir, "file1.txt", b"Content 1");
    let file2_path = create_test_file(&temp_dir, "file2.txt", b"Content 2");
    
    let file1_id = uuid::Uuid::new_v4().to_string();
    let file2_id = uuid::Uuid::new_v4().to_string();
    
    for (file_id, file_path, content) in [
        (&file1_id, &file1_path, b"Content 1"),
        (&file2_id, &file2_path, b"Content 2"),
    ] {
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(file_id)
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
    }

    hasher::calculate_file_hash(&pool, &file1_id, "task1", None, None).await.unwrap();
    hasher::calculate_file_hash(&pool, &file2_id, "task2", None, None).await.unwrap();
    
    let hash1: Option<String> = sqlx::query_scalar("SELECT hash_md5 FROM media_files WHERE id = ?")
        .bind(&file1_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    
    let hash2: Option<String> = sqlx::query_scalar("SELECT hash_md5 FROM media_files WHERE id = ?")
        .bind(&file2_id)
        .fetch_optional(&pool)
        .await
        .unwrap();
    
    assert_ne!(hash1, hash2);
}

#[tokio::test]
async fn test_calculate_file_hash_concurrent() {
    let (pool, temp_dir) = create_test_db().await;
    let mut handles = vec![];
    
    // 创建多个文件并并发计算哈希
    for i in 0..5 {
        let content = format!("Content {}", i);
        let file_path = create_test_file(&temp_dir, &format!("file{}.txt", i), content.as_bytes());
        let file_id = uuid::Uuid::new_v4().to_string();
        let pool_clone = pool.clone();
        
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&file_id)
        .bind(file_path.to_string_lossy().to_string())
        .bind(&format!("file{}.txt", i))
        .bind(content.len() as i64)
        .bind("document")
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
        
        let file_id_clone = file_id.clone();
        let handle = tokio::spawn(async move {
            hasher::calculate_file_hash(
                &pool_clone,
                &file_id_clone,
                &format!("task{}", i),
                None,
                None,
            ).await
        });
        
        handles.push(handle);
    }
    
    // 等待所有任务完成
    for handle in handles {
        assert!(handle.await.unwrap().is_ok());
    }
    
    // 验证所有文件都有哈希值
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files WHERE hash_md5 IS NOT NULL")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 5);
}

#[tokio::test]
async fn test_calculate_file_hash_cache_invalidation() {
    let (pool, temp_dir) = create_test_db().await;
    let content = b"Original content";
    let file_path = create_test_file(&temp_dir, "test.txt", content);
    
    let file_id = uuid::Uuid::new_v4().to_string();
    let mtime1 = Utc::now().timestamp();
    
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
    .bind(chrono::DateTime::from_timestamp(mtime1, 0).unwrap().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let cache = Arc::new(FileHashCache::new());
    
    // 第一次计算
    hasher::calculate_file_hash(&pool, &file_id, "task1", None, Some(cache.clone())).await.unwrap();
    
    // 修改文件（改变修改时间）
    std::fs::write(&file_path, b"Modified content").unwrap();
    let mtime2 = mtime1 + 100;
    
    // 更新数据库中的修改时间
    sqlx::query("UPDATE media_files SET last_modified = ? WHERE id = ?")
        .bind(chrono::DateTime::from_timestamp(mtime2, 0).unwrap().to_rfc3339())
        .bind(&file_id)
        .execute(&pool)
        .await
        .unwrap();
    
    // 第二次计算应该使用新的修改时间，不使用旧缓存
    hasher::calculate_file_hash(&pool, &file_id, "task2", None, Some(cache.clone())).await.unwrap();
    
    // 验证缓存键不同
    let cached1 = cache.get(&file_path.to_string_lossy(), mtime1).await;
    let cached2 = cache.get(&file_path.to_string_lossy(), mtime2).await;
    
    // 旧缓存可能还在，但新缓存应该不同
    assert!(cached2.is_some());
}
