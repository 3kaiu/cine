use cine_backend::services::scanner;
use cine_backend::tests::common::{create_test_db, create_test_directory_structure, create_test_file};
use tempfile::TempDir;

#[tokio::test]
async fn test_scan_directory_basic() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建测试文件
    create_test_file(&temp_dir, "test_media/movies/test.mp4", b"fake video content");
    create_test_file(&temp_dir, "test_media/tv_shows/episode.mkv", b"fake video content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        false, // 非递归
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    // 验证文件已插入数据库
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert!(count > 0);
}

#[tokio::test]
async fn test_scan_directory_recursive() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建嵌套文件
    create_test_file(&temp_dir, "test_media/movies/subdir/movie.mp4", b"content");
    create_test_file(&temp_dir, "test_media/tv_shows/s01/episode.mkv", b"content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        true, // 递归
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 2);
}

#[tokio::test]
async fn test_scan_directory_nonexistent() {
    let (pool, _temp_dir) = create_test_db().await;
    
    let result = scanner::scan_directory(
        &pool,
        "/nonexistent/path",
        false,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("does not exist"));
}

#[tokio::test]
async fn test_scan_directory_file_type_filter() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    create_test_file(&temp_dir, "test_media/movies/video.mp4", b"content");
    create_test_file(&temp_dir, "test_media/movies/image.jpg", b"content");
    create_test_file(&temp_dir, "test_media/movies/document.pdf", b"content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        false,
        &["video".to_string()], // 只扫描视频
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files WHERE file_type = 'video'")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 1);
}

#[test]
fn test_detect_file_type() {
    use cine_backend::services::scanner::detect_file_type;
    use std::path::Path;

    assert_eq!(detect_file_type(Path::new("test.mp4")), "video");
    assert_eq!(detect_file_type(Path::new("test.mkv")), "video");
    assert_eq!(detect_file_type(Path::new("test.avi")), "video");
    assert_eq!(detect_file_type(Path::new("test.mp3")), "audio");
    assert_eq!(detect_file_type(Path::new("test.jpg")), "image");
    assert_eq!(detect_file_type(Path::new("test.pdf")), "document");
    assert_eq!(detect_file_type(Path::new("test.unknown")), "other");
}
