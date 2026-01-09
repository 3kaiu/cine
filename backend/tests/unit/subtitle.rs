//! 字幕服务测试

use cine_backend::services::subtitle;
use std::fs;
use tempfile::tempdir;

#[test]
fn test_find_matching_subtitles() {
    let temp_dir = tempdir().unwrap();
    let video_path = temp_dir.path().join("The.Matrix.1999.mp4");
    fs::write(&video_path, "").unwrap();

    // 创建匹配的字幕
    fs::write(temp_dir.path().join("The.Matrix.1999.zh.srt"), "").unwrap();
    fs::write(temp_dir.path().join("The.Matrix.1999.en.ass"), "").unwrap();

    // 创建不匹配的字幕
    fs::write(temp_dir.path().join("Other.Movie.srt"), "").unwrap();

    let result = subtitle::find_matching_subtitles(video_path.to_str().unwrap(), None).unwrap();

    assert_eq!(result.len(), 2);
    assert!(result.iter().any(|s| s.language.contains("chinese")));
    assert!(result.iter().any(|s| s.language.contains("english")));
}

#[tokio::test]
async fn test_search_subtitles_remote() {
    let video_name = "Inception.2010";
    let result = subtitle::search_subtitles_remote(video_name).await.unwrap();

    assert!(!result.is_empty());
    assert!(result[0].filename.contains(video_name));
}
