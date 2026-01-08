//! 去重服务分批查询测试

use cine_backend::services::dedupe;
use cine_backend::tests::common::create_test_db;
use chrono::Utc;

#[tokio::test]
async fn test_find_duplicates_large_group() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 设置 GROUP_CONCAT 最大长度（模拟优化后的行为）
    sqlx::query("PRAGMA group_concat_max_length = 100000")
        .execute(&pool)
        .await
        .unwrap();
    
    let shared_hash = "shared_hash_value";
    
    // 创建超过50个文件的重复组（触发分批查询）
    for i in 0..60 {
        let file_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, hash_md5, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&file_id)
        .bind(format!("/path/file{}.mp4", i))
        .bind(&format!("file{}.mp4", i))
        .bind(1000)
        .bind("video")
        .bind(shared_hash)
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
    }

    let result = dedupe::find_duplicates(&pool).await;
    assert!(result.is_ok());
    
    let duplicates = result.unwrap();
    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].files.len(), 60); // 所有文件都应该被找到
    assert_eq!(duplicates[0].hash, shared_hash);
}

#[tokio::test]
async fn test_find_duplicates_exact_batch_size() {
    let (pool, _temp_dir) = create_test_db().await;
    
    sqlx::query("PRAGMA group_concat_max_length = 100000")
        .execute(&pool)
        .await
        .unwrap();
    
    let shared_hash = "shared_hash_value";
    
    // 创建正好50个文件的重复组（正好一个批次）
    for i in 0..50 {
        let file_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, hash_md5, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&file_id)
        .bind(format!("/path/file{}.mp4", i))
        .bind(&format!("file{}.mp4", i))
        .bind(1000)
        .bind("video")
        .bind(shared_hash)
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
    }

    let result = dedupe::find_duplicates(&pool).await;
    assert!(result.is_ok());
    
    let duplicates = result.unwrap();
    assert_eq!(duplicates.len(), 1);
    assert_eq!(duplicates[0].files.len(), 50);
}

#[tokio::test]
async fn test_find_duplicates_multiple_large_groups() {
    let (pool, _temp_dir) = create_test_db().await;
    
    sqlx::query("PRAGMA group_concat_max_length = 100000")
        .execute(&pool)
        .await
        .unwrap();
    
    // 创建多个大重复组
    for group in 0..3 {
        let shared_hash = format!("hash_group_{}", group);
        // 每个组60个文件
        for i in 0..60 {
            let file_id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO media_files (id, path, name, size, file_type, hash_md5, created_at, updated_at, last_modified)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&file_id)
            .bind(format!("/path/group{}/file{}.mp4", group, i))
            .bind(&format!("file{}.mp4", i))
            .bind(1000)
            .bind("video")
            .bind(&shared_hash)
            .bind(Utc::now().to_rfc3339())
            .bind(Utc::now().to_rfc3339())
            .bind(Utc::now().to_rfc3339())
            .execute(&pool)
            .await
            .unwrap();
        }
    }

    let result = dedupe::find_duplicates(&pool).await;
    assert!(result.is_ok());
    
    let duplicates = result.unwrap();
    assert_eq!(duplicates.len(), 3);
    
    // 验证每个组都有60个文件
    for dup in &duplicates {
        assert_eq!(dup.files.len(), 60);
    }
}
