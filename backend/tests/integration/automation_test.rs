//! 自动化监控集成测试

#[path = "../common/mod.rs"]
mod common;
use cine_backend::models::WatchFolder;
use common::create_test_db;

#[tokio::test]
async fn test_watch_folder_api_flow() {
    let (pool, temp_dir) = create_test_db().await;
    let watch_path = temp_dir.path().join("watch_me");
    std::fs::create_dir_all(&watch_path).unwrap();

    // 1. 添加监控目录
    let folder_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO watch_folders (id, path, enabled)
         VALUES (?, ?, ?)",
    )
    .bind(&folder_id)
    .bind(watch_path.to_str().unwrap())
    .bind(true)
    .execute(&pool)
    .await
    .unwrap();

    // 2. 查询监控目录
    let folders: Vec<WatchFolder> = sqlx::query_as("SELECT * FROM watch_folders")
        .fetch_all(&pool)
        .await
        .unwrap();

    assert_eq!(folders.len(), 1);
    assert_eq!(folders[0].path, watch_path.to_str().unwrap());
    assert_eq!(folders[0].enabled, true);

    // 3. 删除监控目录
    sqlx::query("DELETE FROM watch_folders WHERE id = ?")
        .bind(&folder_id)
        .execute(&pool)
        .await
        .unwrap();

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM watch_folders")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 0);
}
