//! 文件扫描服务扩展测试 - 更多边界条件和错误场景

use cine_backend::services::scanner;
#[path = "../common/mod.rs"]
mod common;
use common::{create_test_db, create_test_directory_structure, create_test_file};
use std::fs;

#[tokio::test]
async fn test_scan_empty_directory() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        false,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 0);
}

#[tokio::test]
async fn test_scan_directory_with_symlink() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建真实文件
    let real_file = create_test_file(&temp_dir, "test_media/real.mp4", b"content");
    
    // 创建符号链接（如果支持）
    #[cfg(unix)]
    {
        let symlink_path = test_dir.join("symlink.mp4");
        std::os::unix::fs::symlink(&real_file, &symlink_path).ok();
    }

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        false,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn test_scan_directory_with_permission_denied() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 在 Unix 系统上测试权限拒绝
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let restricted_dir = test_dir.join("restricted");
        fs::create_dir_all(&restricted_dir).unwrap();
        fs::set_permissions(&restricted_dir, fs::Permissions::from_mode(0o000)).ok();
        
        // 扫描应该能处理权限错误
        let result = scanner::scan_directory(
            &pool,
            test_dir.to_str().unwrap(),
            true,
            &["video".to_string()],
            "test-task",
            None,
        ).await;
        
        // 恢复权限以便清理
        fs::set_permissions(&restricted_dir, fs::Permissions::from_mode(0o755)).ok();
        
        // 可能成功或失败，取决于实现
        // 这里主要测试不会 panic
        let _ = result;
    }
}

#[tokio::test]
async fn test_scan_directory_very_long_path() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建深层嵌套目录
    let mut deep_path = test_dir.clone();
    for i in 0..10 {
        deep_path = deep_path.join(format!("level_{}", i));
    }
    fs::create_dir_all(&deep_path).unwrap();
    
    create_test_file(&temp_dir, &format!("test_media/{}", deep_path.strip_prefix(&test_dir).unwrap().to_string_lossy().replace("/", "_") + "/file.mp4"), b"content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        true,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn test_scan_directory_special_characters_in_filename() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 测试特殊字符文件名
    create_test_file(&temp_dir, "test_media/movie with spaces.mp4", b"content");
    create_test_file(&temp_dir, "test_media/movie-with-dashes.mp4", b"content");
    create_test_file(&temp_dir, "test_media/movie_with_underscores.mp4", b"content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        false,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 3);
}

#[tokio::test]
async fn test_scan_directory_multiple_file_types() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    create_test_file(&temp_dir, "test_media/video.mp4", b"content");
    create_test_file(&temp_dir, "test_media/audio.mp3", b"content");
    create_test_file(&temp_dir, "test_media/image.jpg", b"content");
    create_test_file(&temp_dir, "test_media/document.pdf", b"content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        false,
        &["video".to_string(), "audio".to_string(), "image".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files WHERE file_type IN ('video', 'audio', 'image')")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 3);
}

#[tokio::test]
async fn test_scan_directory_empty_file_types_list() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    create_test_file(&temp_dir, "test_media/video.mp4", b"content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        false,
        &[], // 空文件类型列表
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    // 应该不扫描任何文件
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 0);
}

#[tokio::test]
async fn test_scan_directory_duplicate_files() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建相同内容的文件（不同路径）
    create_test_file(&temp_dir, "test_media/movies/file1.mp4", b"same content");
    create_test_file(&temp_dir, "test_media/tv_shows/file2.mp4", b"same content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        true,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    assert!(result.is_ok());
    
    // 应该都插入数据库（即使内容相同）
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM media_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    
    assert_eq!(count, 2);
}

#[tokio::test]
async fn test_scan_directory_very_large_filename() {
    let (pool, temp_dir) = create_test_db().await;
    let test_dir = create_test_directory_structure(&temp_dir);
    
    // 创建超长文件名
    let long_name = "a".repeat(255) + ".mp4";
    create_test_file(&temp_dir, &format!("test_media/{}", long_name), b"content");

    let result = scanner::scan_directory(
        &pool,
        test_dir.to_str().unwrap(),
        false,
        &["video".to_string()],
        "test-task",
        None,
    ).await;

    // 可能成功或失败，取决于文件系统限制
    let _ = result;
}

#[test]
fn test_detect_file_type_extensive() {
    use cine_backend::services::scanner::detect_file_type;
    use std::path::Path;

    // 视频格式
    assert_eq!(detect_file_type(Path::new("test.mp4")), "video");
    assert_eq!(detect_file_type(Path::new("test.mkv")), "video");
    assert_eq!(detect_file_type(Path::new("test.avi")), "video");
    assert_eq!(detect_file_type(Path::new("test.mov")), "video");
    assert_eq!(detect_file_type(Path::new("test.wmv")), "video");
    assert_eq!(detect_file_type(Path::new("test.flv")), "video");
    assert_eq!(detect_file_type(Path::new("test.webm")), "video");
    
    // 音频格式
    assert_eq!(detect_file_type(Path::new("test.mp3")), "audio");
    assert_eq!(detect_file_type(Path::new("test.flac")), "audio");
    assert_eq!(detect_file_type(Path::new("test.wav")), "audio");
    assert_eq!(detect_file_type(Path::new("test.aac")), "audio");
    assert_eq!(detect_file_type(Path::new("test.ogg")), "audio");
    
    // 图片格式
    assert_eq!(detect_file_type(Path::new("test.jpg")), "image");
    assert_eq!(detect_file_type(Path::new("test.jpeg")), "image");
    assert_eq!(detect_file_type(Path::new("test.png")), "image");
    assert_eq!(detect_file_type(Path::new("test.gif")), "image");
    assert_eq!(detect_file_type(Path::new("test.bmp")), "image");
    assert_eq!(detect_file_type(Path::new("test.webp")), "image");
    
    // 文档格式
    assert_eq!(detect_file_type(Path::new("test.pdf")), "document");
    assert_eq!(detect_file_type(Path::new("test.doc")), "document");
    assert_eq!(detect_file_type(Path::new("test.docx")), "document");
    assert_eq!(detect_file_type(Path::new("test.txt")), "document");
    
    // 边界情况
    assert_eq!(detect_file_type(Path::new("test")), "other"); // 无扩展名
    assert_eq!(detect_file_type(Path::new("test.")), "other"); // 空扩展名
    assert_eq!(detect_file_type(Path::new(".hidden")), "other"); // 隐藏文件
    assert_eq!(detect_file_type(Path::new("test.UPPERCASE.MP4")), "video"); // 大写扩展名
}
