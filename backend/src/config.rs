use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port: u16,
    pub database_url: String,
    pub tmdb_api_key: Option<String>,
    pub max_file_size: u64, // 最大文件大小（字节），用于限制处理
    pub chunk_size: usize,  // 流式处理的块大小（字节）
    pub hash_cache_dir: PathBuf,
    pub media_directories: Vec<PathBuf>,
}

impl AppConfig {
    pub fn load() -> anyhow::Result<Self> {
        // 从环境变量或配置文件加载
        let port = std::env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3000);

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "sqlite:./data/cine.db".to_string());

        let tmdb_api_key = std::env::var("TMDB_API_KEY").ok();

        let max_file_size = std::env::var("MAX_FILE_SIZE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(200_000_000_000); // 默认 200GB

        let chunk_size = std::env::var("CHUNK_SIZE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(64 * 1024 * 1024); // 默认 64MB

        let hash_cache_dir = std::env::var("HASH_CACHE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./data/hash_cache"));

        // 确保缓存目录存在
        std::fs::create_dir_all(&hash_cache_dir)?;

        Ok(Self {
            port,
            database_url,
            tmdb_api_key,
            max_file_size,
            chunk_size,
            hash_cache_dir,
            media_directories: vec![],
        })
    }
}
