//! API 集成测试扩展

#[path = "../common/mod.rs"]
mod common;
use common::{create_test_db, create_test_file};
use chrono::Utc;

#[tokio::test]
async fn test_files_api_pagination() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 插入多个文件
    for i in 0..10 {
        let file_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&file_id)
        .bind(format!("/test/path{}.mp4", i))
        .bind(&format!("file{}.mp4", i))
        .bind(1000 + i)
        .bind("video")
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
    }

    // 测试分页查询
    let page1: Vec<cine_backend::models::MediaFile> = sqlx::query_as(
        "SELECT * FROM media_files ORDER BY created_at LIMIT 5 OFFSET 0"
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    let page2: Vec<cine_backend::models::MediaFile> = sqlx::query_as(
        "SELECT * FROM media_files ORDER BY created_at LIMIT 5 OFFSET 5"
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(page1.len(), 5);
    assert_eq!(page2.len(), 5);
    assert_ne!(page1[0].id, page2[0].id);
}

#[tokio::test]
async fn test_files_api_filter_by_type() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 插入不同类型的文件
    let types = vec!["video", "audio", "image", "document"];
    for (i, file_type) in types.iter().enumerate() {
        let file_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&file_id)
        .bind(format!("/test/file{}.ext", i))
        .bind(&format!("file{}.ext", i))
        .bind(1000)
        .bind(file_type)
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
    }

    // 测试按类型过滤
    let videos: Vec<cine_backend::models::MediaFile> = sqlx::query_as(
        "SELECT * FROM media_files WHERE file_type = ?"
    )
    .bind("video")
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(videos.len(), 1);
    assert_eq!(videos[0].file_type, "video");
}

#[tokio::test]
async fn test_files_api_search_by_name() {
    let (pool, _temp_dir) = create_test_db().await;
    
    // 插入不同名称的文件
    let names = vec!["movie1.mp4", "movie2.mp4", "document.pdf", "music.mp3"];
    for name in names {
        let file_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&file_id)
        .bind(format!("/test/{}", name))
        .bind(name)
        .bind(1000)
        .bind("video")
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&pool)
        .await
        .unwrap();
    }

    // 测试按名称搜索
    let results: Vec<cine_backend::models::MediaFile> = sqlx::query_as(
        "SELECT * FROM media_files WHERE name LIKE ?"
    )
    .bind("%movie%")
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(results.len(), 2);
    assert!(results.iter().all(|f| f.name.contains("movie")));
}
