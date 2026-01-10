use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MediaFile {
    pub id: String,
    pub path: String,
    pub name: String,
    pub size: i64,
    pub file_type: String, // video, audio, image, document
    pub hash_xxhash: Option<String>,
    pub hash_md5: Option<String>,
    pub tmdb_id: Option<u32>,
    pub quality_score: Option<i32>,
    pub video_info: Option<String>, // JSON
    pub metadata: Option<String>,   // JSON
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub duration: Option<f64>, // 秒
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub codec: Option<String>,
    pub bitrate: Option<u64>,
    pub format: Option<String>,
    pub audio_codec: Option<String>,
    pub audio_channels: Option<u32>,
    pub is_hdr: Option<bool>,
    pub is_dolby_vision: Option<bool>,
    pub is_hdr10_plus: Option<bool>,
    pub source: Option<String>, // iTunes, WEB-DL, BluRay, etc.
    pub has_chinese_subtitle: Option<bool>,
    pub audio_streams: Vec<AudioStreamInfo>,
    pub subtitle_streams: Vec<SubtitleStreamInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioStreamInfo {
    pub codec: String,
    pub channels: u32,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleStreamInfo {
    pub codec: String,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_external: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovieMetadata {
    pub tmdb_id: Option<u32>,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<u32>,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub genres: Vec<String>,
    pub rating: Option<f32>,
    pub release_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TVShowMetadata {
    pub tmdb_id: Option<u32>,
    pub name: String,
    pub original_name: Option<String>,
    pub first_air_date: Option<String>,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub genres: Vec<String>,
    pub rating: Option<f32>,
    pub seasons: Vec<SeasonInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeasonInfo {
    pub season_number: u32,
    pub episode_count: u32,
    pub name: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanTask {
    pub id: String,
    pub directory: String,
    pub status: String, // pending, running, completed, failed
    pub total_files: Option<u64>,
    pub processed_files: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HashTask {
    pub id: String,
    pub file_id: String,
    pub status: String,
    pub progress: f64,     // 0.0 - 1.0
    pub hash_type: String, // xxhash, md5
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub files: Vec<MediaFile>,
    pub total_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateMovieGroup {
    pub tmdb_id: u32,
    pub title: String,
    pub files: Vec<MediaFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OperationLog {
    pub id: String,
    pub action: String,
    pub file_id: Option<String>,
    pub old_path: String,
    pub new_path: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ScanHistory {
    pub directory: String,
    pub total_files: i64,
    pub total_size: i64,
    pub file_types_json: Option<String>, // JSON
    pub last_scanned_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WatchFolder {
    pub id: String,
    pub path: String,
    pub auto_scrape: bool,
    pub auto_rename: bool,
    pub recursive: bool,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Setting {
    pub id: String,
    pub category: String,
    pub key: String,
    pub value: Option<String>,
    pub description: Option<String>,
    pub updated_at: DateTime<Utc>,
}
