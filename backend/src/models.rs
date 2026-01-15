use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AudioStreamInfo {
    pub codec: String,
    pub channels: u32,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SubtitleStreamInfo {
    pub codec: String,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_external: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SeasonInfo {
    pub season_number: u32,
    pub episode_count: u32,
    pub name: Option<String>,
}

/// 统一任务模型，支持分布式与持久化
#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct DbTask {
    pub id: String,
    pub task_type: String,
    pub status: String,
    pub description: Option<String>,
    pub payload: Option<String>,
    pub result: Option<String>,
    pub progress: f64,
    pub node_id: Option<String>,
    pub error: Option<String>,
    pub duration_secs: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
}

impl DbTask {
    pub fn task_type_enum(&self) -> crate::services::task_queue::TaskType {
        match self.task_type.as_str() {
            "scan" => crate::services::task_queue::TaskType::Scan,
            "hash" => crate::services::task_queue::TaskType::Hash,
            "scrape" => crate::services::task_queue::TaskType::Scrape,
            "rename" => crate::services::task_queue::TaskType::Rename,
            "batch_move" => crate::services::task_queue::TaskType::BatchMove,
            "batch_copy" => crate::services::task_queue::TaskType::BatchCopy,
            "cleanup" => crate::services::task_queue::TaskType::Cleanup,
            _ => crate::services::task_queue::TaskType::Custom(self.task_type.clone()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DuplicateGroup {
    pub hash: String,
    pub files: Vec<MediaFile>,
    pub total_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DuplicateMovieGroup {
    pub tmdb_id: u32,
    pub title: String,
    pub files: Vec<MediaFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct OperationLog {
    pub id: String,
    pub action: String,
    pub file_id: Option<String>,
    pub old_path: String,
    pub new_path: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct ScanHistory {
    pub directory: String,
    pub total_files: i64,
    pub total_size: i64,
    pub file_types_json: Option<String>, // JSON
    pub last_scanned_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct WatchFolder {
    pub id: String,
    pub path: String,
    pub auto_scrape: bool,
    pub auto_rename: bool,
    pub recursive: bool,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Setting {
    pub id: String,
    pub category: String,
    pub key: String,
    pub value: Option<String>,
    pub description: Option<String>,
    pub updated_at: DateTime<Utc>,
}
