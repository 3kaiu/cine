//! 去重服务测试

use cine_backend::services::dedupe;
use cine_backend::tests::common::create_test_db;
use chrono::Utc;

#[tokio::test]
async fn test_find_duplicates_no_duplicates() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 插入不同哈希值的文件
    for i in 0..3 {
        let file_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, hash_md5, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&file_id)
        .bind(format!("/path/file{}.mp4", i))
        .bind(&format!("file{}.mp4", i))
        .bind(1000 + i)
        .bind("video")
        .bind(format!("hash{}", i)) // 不同的哈希值
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
    assert_eq!(duplicates.len(), 0);
}

#[tokio::test]
async fn test_find_duplicates_single_group() {
    let (pool, _temp_dir) = create_test_db().await;
    let shared_hash = "shared_hash_value";
    
    // 插入相同哈希值的文件
    for i in 0..3 {
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
    assert_eq!(duplicates[0].files.len(), 3);
    assert_eq!(duplicates[0].hash, shared_hash);
}

#[tokio::test]
async fn test_find_duplicates_multiple_groups() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 创建两组重复文件
    for group in 0..2 {
        let shared_hash = format!("hash_group_{}", group);
        for i in 0..2 {
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
    assert_eq!(duplicates.len(), 2);
}

#[tokio::test]
async fn test_find_duplicates_sorted_by_size() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 创建两组重复文件，大小不同
    let groups = vec![
        ("hash1", 1000),
        ("hash2", 5000),
        ("hash3", 2000),
    ];
    
    for (hash, size) in groups {
        for i in 0..2 {
            let file_id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO media_files (id, path, name, size, file_type, hash_md5, created_at, updated_at, last_modified)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&file_id)
            .bind(format!("/path/{}/file{}.mp4", hash, i))
            .bind(&format!("file{}.mp4", i))
            .bind(size)
            .bind("video")
            .bind(hash)
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
    
    // 验证按总大小降序排序
    assert_eq!(duplicates[0].total_size, 10000); // hash2: 5000 * 2
    assert_eq!(duplicates[1].total_size, 4000);  // hash3: 2000 * 2
    assert_eq!(duplicates[2].total_size, 2000);  // hash1: 1000 * 2
}

#[tokio::test]
async fn test_find_duplicates_with_null_hash() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 插入没有哈希值的文件
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, hash_md5, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind("/path/file.mp4")
    .bind("file.mp4")
    .bind(1000)
    .bind("video")
    .bind::<Option<String>>(None) // NULL 哈希值
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = dedupe::find_duplicates(&pool).await;
    assert!(result.is_ok());
    
    let duplicates = result.unwrap();
    // 没有哈希值的文件不应该出现在结果中
    assert_eq!(duplicates.len(), 0);
}

#[tokio::test]
async fn test_find_duplicates_single_file_with_hash() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 插入只有一个文件的哈希值
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, hash_md5, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind("/path/file.mp4")
    .bind("file.mp4")
    .bind(1000)
    .bind("video")
    .bind("unique_hash")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let result = dedupe::find_duplicates(&pool).await;
    assert!(result.is_ok());
    
    let duplicates = result.unwrap();
    // 只有一个文件不应该被识别为重复
    assert_eq!(duplicates.len(), 0);
}
