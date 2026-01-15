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

// FileConfig struct removed

impl AppConfig {
    /// 加载配置
    ///
    /// 优先级：环境变量 (CINE_*) > 配置文件 (config.json) > 默认值
    pub fn load() -> anyhow::Result<Self> {
        let config_path =
            std::env::var("CONFIG_PATH").unwrap_or_else(|_| "./config/config.json".to_string());

        // 确保必要目录存在 (使用默认值检查，后续由 config crate 覆盖)
        let default_hash_cache = PathBuf::from("./data/hash_cache");
        let default_trash = PathBuf::from("./data/trash");

        let builder = config::Config::builder()
            // 1. 设置默认值
            .set_default("port", 3000)?
            .set_default("database_url", "sqlite:./data/cine.db")?
            .set_default("max_file_size", 200_000_000_000_u64)? // 200GB
            .set_default("chunk_size", 64 * 1024 * 1024)? // 64MB
            .set_default("hash_cache_dir", default_hash_cache.to_str().unwrap())?
            .set_default("trash_dir", default_trash.to_str().unwrap())?
            .set_default("log_level", "cine=info,axum=info")?
            .set_default("log_format", "pretty")?
            // 2. 加载配置文件 (如果存在)
            .add_source(config::File::with_name(&config_path).required(false))
            // 3. 加载环境变量 (CINE_ 前缀，例如 CINE_PORT=8080)
            // 注意：数组类型的环境变量暂不支持直接映射，需特殊处理或忽略
            .add_source(config::Environment::with_prefix("CINE").separator("_"));

        let config: Dictionary = builder.build()?.try_deserialize()?;

        // 分别转换字段以构建 AppConfig，处理 PathBuf 和 Vec
        let app_config = AppConfig {
            port: config.port,
            database_url: config.database_url,
            tmdb_api_key: config.tmdb_api_key,
            max_file_size: config.max_file_size,
            chunk_size: config.chunk_size,
            hash_cache_dir: PathBuf::from(config.hash_cache_dir),
            trash_dir: PathBuf::from(config.trash_dir),
            media_directories: config
                .media_directories
                .unwrap_or_default()
                .into_iter()
                .map(PathBuf::from)
                .collect(),
            log_level: config.log_level,
            log_format: config.log_format,
        };

        // 确保目录存在
        std::fs::create_dir_all(&app_config.hash_cache_dir)?;
        std::fs::create_dir_all(&app_config.trash_dir)?;

        Ok(app_config)
    }
}

// 中间结构体，用于 serde 反序列化（避免 PathBuf 兼容性问题）
#[derive(Debug, Deserialize)]
struct Dictionary {
    port: u16,
    database_url: String,
    tmdb_api_key: Option<String>,
    max_file_size: u64,
    chunk_size: usize,
    hash_cache_dir: String,
    trash_dir: String,
    media_directories: Option<Vec<String>>,
    log_level: String,
    log_format: String,
}
