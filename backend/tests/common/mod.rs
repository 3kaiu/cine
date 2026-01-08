//! 测试公共模块

use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use std::path::PathBuf;
use tempfile::TempDir;

/// 创建测试数据库连接池
pub async fn create_test_db() -> (SqlitePool, TempDir) {
    let temp_dir = tempfile::tempdir().expect("Failed to create temp directory");
    let db_path = temp_dir.path().join("test.db");
    let database_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .expect("Failed to create test database");

    // 运行迁移
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    (pool, temp_dir)
}

/// 创建测试文件
pub fn create_test_file(dir: &TempDir, name: &str, content: &[u8]) -> PathBuf {
    let file_path = dir.path().join(name);
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).expect("Failed to create parent directory");
    }
    std::fs::write(&file_path, content).expect("Failed to write test file");
    file_path
}

/// 创建测试目录结构
pub fn create_test_directory_structure(base: &TempDir) -> PathBuf {
    let test_dir = base.path().join("test_media");
    std::fs::create_dir_all(&test_dir).expect("Failed to create test directory");
    
    // 创建子目录
    std::fs::create_dir_all(test_dir.join("movies")).expect("Failed to create movies dir");
    std::fs::create_dir_all(test_dir.join("tv_shows")).expect("Failed to create tv_shows dir");
    
    test_dir
}

/// 清理测试数据
pub async fn cleanup_test_db(pool: &SqlitePool) {
    sqlx::query("DELETE FROM media_files")
        .execute(pool)
        .await
        .ok();
}
