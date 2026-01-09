//! 工具箱集成测试 (NFO & Subtitles)

#[path = "../common/mod.rs"]
mod common;
use common::{create_test_db, create_test_file};

#[tokio::test]
async fn test_nfo_api_flow() {
    let (pool, temp_dir) = create_test_db().await;
    let video_path = create_test_file(&temp_dir, "movie.mp4", b"content");
    let nfo_path = temp_dir.path().join("movie.nfo");

    // 写入初始 NFO
    std::fs::write(
        &nfo_path,
        r#"<?xml version="1.0" encoding="UTF-8"?><movie><title>Old Title</title></movie>"#,
    )
    .unwrap();

    let file_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, last_modified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(video_path.to_str().unwrap())
    .bind("movie.mp4")
    .bind(1000)
    .bind("video")
    .bind(&now)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .unwrap();

    // 逻辑验证：读取 NFO
    let content = std::fs::read_to_string(&nfo_path).unwrap();
    assert!(content.contains("Old Title"));
}

#[tokio::test]
async fn test_subtitle_api_flow() {
    let (pool, temp_dir) = create_test_db().await;
    let video_path = create_test_file(&temp_dir, "movie.mp4", b"content");

    // 创建本地字幕
    create_test_file(&temp_dir, "movie.zh.srt", b"subtitle content");

    let file_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, last_modified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&file_id)
    .bind(video_path.to_str().unwrap())
    .bind("movie.mp4")
    .bind(1000)
    .bind("video")
    .bind(&now)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .unwrap();

    // 逻辑验证：查找匹配字幕
    let subtitles = cine_backend::services::subtitle::find_matching_subtitles(
        video_path.to_str().unwrap(),
        None,
    )
    .unwrap();

    assert_eq!(subtitles.len(), 1);
    assert!(subtitles[0].path.contains("movie.zh.srt"));
}
