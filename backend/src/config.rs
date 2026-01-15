use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 应用配置
///
/// 配置加载优先级：
/// 1. 环境变量（最高优先级）
/// 2. 配置文件（CONFIG_PATH 或 ./config/config.json）
/// 3. 默认值
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port: u16,
    pub database_url: String,
    pub tmdb_api_key: Option<String>,
    pub max_file_size: u64, // 最大文件大小（字节），用于限制处理
    pub chunk_size: usize,  // 流式处理的块大小（字节）
    pub hash_cache_dir: PathBuf,
    pub trash_dir: PathBuf,
    pub media_directories: Vec<PathBuf>,
    pub log_level: String,  // 日志级别
    pub log_format: String, // 日志格式: "pretty" 或 "json"
}

/// 配置文件结构（所有字段可选，用于部分覆盖）
#[derive(Debug, Clone, Deserialize, Default)]
struct FileConfig {
    port: Option<u16>,
    database_url: Option<String>,
    tmdb_api_key: Option<String>,
    max_file_size: Option<u64>,
    chunk_size: Option<usize>,
    hash_cache_dir: Option<String>,
    trash_dir: Option<String>,
    media_directories: Option<Vec<String>>,
    log_level: Option<String>,
    log_format: Option<String>,
}

impl AppConfig {
    /// 加载配置
    ///
    /// 优先级：环境变量 > 配置文件 > 默认值
    pub fn load() -> anyhow::Result<Self> {
        // 1. 尝试加载配置文件
        let file_config = Self::load_file_config();

        // 2. 构建最终配置（环境变量 > 配置文件 > 默认值）
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .or(file_config.port)
            .unwrap_or(3000);

        let database_url = std::env::var("DATABASE_URL")
            .ok()
            .or(file_config.database_url)
            .unwrap_or_else(|| "sqlite:./data/cine.db".to_string());

        let tmdb_api_key = std::env::var("TMDB_API_KEY")
            .ok()
            .or(file_config.tmdb_api_key);

        let max_file_size = std::env::var("MAX_FILE_SIZE")
            .ok()
            .and_then(|s| s.parse().ok())
            .or(file_config.max_file_size)
            .unwrap_or(200_000_000_000); // 默认 200GB

        let chunk_size = std::env::var("CHUNK_SIZE")
            .ok()
            .and_then(|s| s.parse().ok())
            .or(file_config.chunk_size)
            .unwrap_or(64 * 1024 * 1024); // 默认 64MB

        let hash_cache_dir = std::env::var("HASH_CACHE_DIR")
            .ok()
            .or(file_config.hash_cache_dir)
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("./data/hash_cache"));

        let trash_dir = std::env::var("TRASH_DIR")
            .ok()
            .or(file_config.trash_dir)
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("./data/trash"));

        let media_directories = file_config
            .media_directories
            .map(|dirs| dirs.into_iter().map(PathBuf::from).collect())
            .unwrap_or_default();

        let log_level = std::env::var("RUST_LOG")
            .ok()
            .or(file_config.log_level)
            .unwrap_or_else(|| "cine=info,axum=info".to_string());

        let log_format = std::env::var("LOG_FORMAT")
            .ok()
            .or(file_config.log_format)
            .unwrap_or_else(|| "pretty".to_string());

        // 确保必要目录存在
        std::fs::create_dir_all(&hash_cache_dir)?;
        std::fs::create_dir_all(&trash_dir)?;

        Ok(Self {
            port,
            database_url,
            tmdb_api_key,
            max_file_size,
            chunk_size,
            hash_cache_dir,
            trash_dir,
            media_directories,
            log_level,
            log_format,
        })
    }

    /// 从配置文件加载配置
    fn load_file_config() -> FileConfig {
        let config_path =
            std::env::var("CONFIG_PATH").unwrap_or_else(|_| "./config/config.json".to_string());

        match std::fs::read_to_string(&config_path) {
            Ok(content) => match serde_json::from_str::<FileConfig>(&content) {
                Ok(config) => {
                    tracing::info!("Loaded config from: {}", config_path);
                    config
                }
                Err(e) => {
                    tracing::warn!("Failed to parse config file {}: {}", config_path, e);
                    FileConfig::default()
                }
            },
            Err(_) => {
                tracing::debug!("No config file found at: {}", config_path);
                FileConfig::default()
            }
        }
    }
}
