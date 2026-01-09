//! 文件监控服务测试

use cine_backend::services::watcher::WatcherService;
use std::fs;
use std::time::Duration;
use tempfile::tempdir;

#[tokio::test]
async fn test_watcher_service_basic() {
    let temp_dir = tempdir().unwrap();
    let watch_path = temp_dir.path().to_owned();

    let (db_pool, _temp_db) = crate::common::create_test_db().await;

    let (service, _rx) = WatcherService::new(db_pool.clone());

    // 插入一个监控目录
    let folder_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO watch_folders (id, path, enabled) VALUES (?, ?, ?)")
        .bind(&folder_id)
        .bind(watch_path.to_str().unwrap())
        .bind(true)
        .execute(&db_pool)
        .await
        .unwrap();

    service.start_all().await.unwrap();

    // 等待一会儿让 Watcher 准备好
    tokio::time::sleep(Duration::from_millis(500)).await;

    // 触发变更
    let test_file = watch_path.join("new_file.mp4");
    fs::write(&test_file, "content").unwrap();
}
