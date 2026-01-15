use serde_json::Value;
use sqlx::SqlitePool;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use crate::services::task_queue::{TaskContext, TaskExecutor};
use crate::services::{hasher, renamer, scanner, scraper};

/// 扫描任务执行器
pub struct ScanExecutor {
    pub db: SqlitePool,
}

impl TaskExecutor for ScanExecutor {
    fn execute(
        &self,
        ctx: TaskContext,
        payload: Value,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>> {
        let db = self.db.clone();
        Box::pin(async move {
            let directory = payload["directory"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing directory"))?;
            let recursive = payload["recursive"].as_bool().unwrap_or(true);
            let file_types: Vec<String> = payload["file_types"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_else(|| {
                    vec![
                        "video".to_string(),
                        "audio".to_string(),
                        "image".to_string(),
                    ]
                });

            scanner::scan_directory(&db, directory, recursive, &file_types, ctx).await?;
            Ok(Some("Scan completed".to_string()))
        })
    }
}

/// 哈希计算执行器
pub struct HashExecutor {
    pub db: SqlitePool,
    pub hash_cache: Arc<crate::services::cache::FileHashCache>,
}

impl TaskExecutor for HashExecutor {
    fn execute(
        &self,
        ctx: TaskContext,
        payload: Value,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>> {
        let db = self.db.clone();
        let hash_cache = Some(self.hash_cache.clone());
        Box::pin(async move {
            let file_id = payload["file_id"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Missing file_id"))?;
            hasher::calculate_file_hash(&db, file_id, ctx, hash_cache).await?;
            Ok(Some(format!("Hash calculated for file {}", file_id)))
        })
    }
}

/// 批量刮削执行器
pub struct ScrapeExecutor {
    pub db: SqlitePool,
    pub http_client: reqwest::Client,
    pub config: Arc<crate::config::AppConfig>,
}

impl TaskExecutor for ScrapeExecutor {
    fn execute(
        &self,
        ctx: TaskContext,
        payload: Value,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>> {
        let db = self.db.clone();
        let client = self.http_client.clone();
        let config = self.config.clone();
        Box::pin(async move {
            let file_ids: Vec<String> = payload["file_ids"]
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("Missing file_ids"))?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();

            let source = payload["source"].as_str().unwrap_or("tmdb").to_string();
            let auto_match = payload["auto_match"].as_bool().unwrap_or(true);
            let download_images = payload["download_images"].as_bool().unwrap_or(true);
            let generate_nfo = payload["generate_nfo"].as_bool().unwrap_or(true);

            scraper::batch_scrape_metadata(
                &db,
                &client,
                &file_ids,
                &source,
                auto_match,
                &config,
                download_images,
                generate_nfo,
                5,
                ctx,
            )
            .await?;

            Ok(Some("Batch scrape completed".to_string()))
        })
    }
}

/// 批量重命名执行器
pub struct RenameExecutor {
    pub db: SqlitePool,
}

impl TaskExecutor for RenameExecutor {
    fn execute(
        &self,
        ctx: TaskContext,
        payload: Value,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>> {
        let db = self.db.clone();
        Box::pin(async move {
            let rename_items: Vec<(String, String)> = payload["rename_items"]
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("Missing rename_items"))?
                .iter()
                .filter_map(|v| {
                    let arr = v.as_array()?;
                    if arr.len() == 2 {
                        Some((arr[0].as_str()?.to_string(), arr[1].as_str()?.to_string()))
                    } else {
                        None
                    }
                })
                .collect();

            renamer::batch_rename(&db, rename_items, ctx).await?;
            Ok(Some("Batch rename completed".to_string()))
        })
    }
}
