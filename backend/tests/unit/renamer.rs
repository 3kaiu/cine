use cine_backend::services::renamer;
use cine_backend::models::MediaFile;
use chrono::Utc;

#[test]
fn test_generate_new_name_basic() {
    let file = MediaFile {
        id: "test-id".to_string(),
        path: "/path/to/movie.mp4".to_string(),
        name: "movie.mp4".to_string(),
        size: 1000,
        file_type: "video".to_string(),
        hash_xxhash: None,
        hash_md5: None,
        video_info: None,
        metadata: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        last_modified: Utc::now(),
    };

    let new_name = renamer::generate_new_name(&file, "{title}.{ext}");
    assert!(new_name.is_some());
    assert!(new_name.unwrap().ends_with(".mp4"));
}

#[test]
fn test_generate_new_name_with_metadata() {
    let metadata = serde_json::json!({
        "title": "Test Movie",
        "year": 2024
    });

    let file = MediaFile {
        id: "test-id".to_string(),
        path: "/path/to/movie.mp4".to_string(),
        name: "movie.mp4".to_string(),
        size: 1000,
        file_type: "video".to_string(),
        hash_xxhash: None,
        hash_md5: None,
        video_info: None,
        metadata: Some(metadata.to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        last_modified: Utc::now(),
    };

    let new_name = renamer::generate_new_name(&file, "{title} ({year}).{ext}");
    assert!(new_name.is_some());
    let name = new_name.unwrap();
    assert!(name.contains("Test Movie"));
    assert!(name.contains("2024"));
    assert!(name.ends_with(".mp4"));
}

#[test]
fn test_generate_new_name_tv_show() {
    let metadata = serde_json::json!({
        "name": "Test Show",
        "season": 1,
        "episode": 5
    });

    let file = MediaFile {
        id: "test-id".to_string(),
        path: "/path/to/episode.mkv".to_string(),
        name: "episode.mkv".to_string(),
        size: 1000,
        file_type: "video".to_string(),
        hash_xxhash: None,
        hash_md5: None,
        video_info: None,
        metadata: Some(metadata.to_string()),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        last_modified: Utc::now(),
    };

    let new_name = renamer::generate_new_name(&file, "{title}.S{season:02d}E{episode:02d}.{ext}");
    assert!(new_name.is_some());
    let name = new_name.unwrap();
    assert!(name.contains("S01E05"));
    assert!(name.ends_with(".mkv"));
}

// sanitize_filename 是私有函数，通过 generate_new_name 间接测试
#[test]
fn test_sanitize_filename_indirect() {
    use cine_backend::services::renamer;
    use cine_backend::models::MediaFile;
    use chrono::Utc;

    let file = MediaFile {
        id: "test-id".to_string(),
        path: "/path/to/test:file.mp4".to_string(),
        name: "test:file.mp4".to_string(),
        size: 1000,
        file_type: "video".to_string(),
        hash_xxhash: None,
        hash_md5: None,
        video_info: None,
        metadata: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        last_modified: Utc::now(),
    };

    let new_name = renamer::generate_new_name(&file, "{title}.{ext}");
    assert!(new_name.is_some());
    let name = new_name.unwrap();
    // 验证无效字符已被移除
    assert!(!name.contains(':'));
    assert!(!name.contains('/'));
}
