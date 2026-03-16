//! 测试公共模块

use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::PathBuf;
use tempfile::TempDir;
use std::sync::Arc;

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

/// 创建测试应用状态（尽量集中管理，避免 AppState 字段变更导致测试到处报错）
#[allow(dead_code)]
pub async fn create_test_app_state() -> (Arc<cine_backend::handlers::AppState>, TempDir) {
    let (pool, temp_dir) = create_test_db().await;

    let config = Arc::new(cine_backend::config::AppConfig {
        database_url: "sqlite:test.db".to_string(),
        port: 3000,
        tmdb_api_key: None,
        hash_cache_dir: temp_dir.path().join("hash_cache"),
        trash_dir: temp_dir.path().join("trash"),
        max_file_size: 200_000_000_000,
        chunk_size: 64 * 1024 * 1024,
        media_directories: vec![],
        log_level: "info".to_string(),
        log_format: "pretty".to_string(),
        enable_plugins: false,
        enable_cache_warmup: false,
        task_lease_seconds: 60,
        task_dispatch_interval_ms: 100,
        task_retries_pure: 1,
        task_retries_idempotent: 1,
        task_retries_side_effectful: 0,
        worker_heartbeat_interval_secs: 1,
        worker_task_heartbeat_interval_secs: 1,
    });

    let task_queue = Arc::new(cine_backend::services::task_queue::TaskQueue::new(
        pool.clone(),
        4,
    ));

    let app_state = Arc::new(cine_backend::handlers::AppState {
        db: pool,
        config: config.clone(),
        progress_hub: cine_backend::services::progress_hub::ProgressHub::new(),
        http_client: reqwest::Client::new(),
        task_queue: task_queue.clone(),
        distributed: Arc::new(cine_backend::services::distributed::DistributedService::new(
            task_queue,
            config.clone(),
        )),
        plugin_manager: Arc::new(cine_backend::services::plugin::PluginManager::new(
            temp_dir.path().join("plugins"),
        )),
    });

    (app_state, temp_dir)
}

/// 创建测试文件
#[allow(dead_code)]
pub fn create_test_file(dir: &TempDir, name: &str, content: &[u8]) -> PathBuf {
    let file_path = dir.path().join(name);
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).expect("Failed to create parent directory");
    }
    std::fs::write(&file_path, content).expect("Failed to write test file");
    file_path
}

/// 创建测试目录结构
#[allow(dead_code)]
pub fn create_test_directory_structure(base: &TempDir) -> PathBuf {
    let test_dir = base.path().join("test_media");
    std::fs::create_dir_all(&test_dir).expect("Failed to create test directory");

    // 创建子目录
    std::fs::create_dir_all(test_dir.join("movies")).expect("Failed to create movies dir");
    std::fs::create_dir_all(test_dir.join("tv_shows")).expect("Failed to create tv_shows dir");

    test_dir
}

/// 清理测试数据
#[allow(dead_code)]
pub async fn cleanup_test_db(pool: &SqlitePool) {
    sqlx::query("DELETE FROM media_files")
        .execute(pool)
        .await
        .ok();
}
