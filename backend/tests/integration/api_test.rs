//! API 集成测试

use axum::http::StatusCode;
use cine_backend::tests::common::{create_test_db, create_test_file};
use sqlx::SqlitePool;
use std::sync::Arc;
use cine_backend::handlers::AppState;
use cine_backend::config::AppConfig;
use cine_backend::websocket::ProgressBroadcaster;
use cine_backend::services::cache::FileHashCache;
use chrono::Utc;

/// 创建测试应用状态
async fn create_test_app_state() -> (Arc<AppState>, tempfile::TempDir) {
    let (pool, temp_dir) = create_test_db().await;
    
    let config = Arc::new(AppConfig {
        database_url: "sqlite:test.db".to_string(),
        port: 3000,
        tmdb_api_key: None,
        hash_cache_dir: temp_dir.path().join("hash_cache"),
        max_file_size: 200_000_000_000,
        chunk_size: 64 * 1024 * 1024,
        media_directories: vec![],
    });

    let app_state = Arc::new(AppState {
        db: pool,
        config,
        progress_broadcaster: ProgressBroadcaster::new(),
        hash_cache: Arc::new(FileHashCache::new()),
    });

    (app_state, temp_dir)
}

#[tokio::test]
async fn test_scan_api() {
    let (app_state, temp_dir) = create_test_app_state().await;
    let test_dir = temp_dir.path().join("test_media");
    std::fs::create_dir_all(&test_dir).unwrap();
    create_test_file(&temp_dir, "test_media/video.mp4", b"fake video");

    // 这里应该使用实际的 HTTP 客户端测试
    // 由于需要启动服务器，这里只做结构测试
    // 实际测试应该使用 reqwest 或类似工具
}

#[tokio::test]
async fn test_get_files_api() {
    let (app_state, _temp_dir) = create_test_app_state().await;
    
    // 插入测试数据
    let file_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind("/test/path.mp4")
    .bind("test.mp4")
    .bind(1000)
    .bind("video")
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .bind(Utc::now().to_rfc3339())
    .execute(&app_state.db)
    .await
    .unwrap();

    // 验证数据存在
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&app_state.db)
        .await
        .unwrap();
    assert_eq!(count, 1);
}
