//! 文件扫描批量插入测试

use cine_backend::services::scanner;
#[path = "../common/mod.rs"]
mod common;
use common::{create_test_db, create_test_directory_structure, create_test_file};

#[tokio::test]
async fn test_scan_directory_batch_insert() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建超过100个文件（触发批量插入）
    for i in 0..150 {
        create_test_file(&temp_dir, &format!("test_media/movies/file_{}.mp4", i), b"fake video content");
    }

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        true, // 递归
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    // 验证所有文件都已插入
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 150);
}

#[tokio::test]
async fn test_scan_directory_batch_insert_exact_batch_size() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建正好100个文件（正好一个批次）
    for i in 0..100 {
        create_test_file(&temp_dir, &format!("test_media/movies/file_{}.mp4", i), b"fake video content");
    }

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        true,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 100);
}

#[tokio::test]
async fn test_scan_directory_batch_insert_remainder() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建250个文件（2个完整批次 + 50个剩余）
    for i in 0..250 {
        create_test_file(&temp_dir, &format!("test_media/movies/file_{}.mp4", i), b"fake video content");
    }

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        true,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 250);
}
