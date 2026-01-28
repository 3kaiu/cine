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

/// 批量哈希执行器（并行处理）
pub struct BatchHashExecutor {
    pub db: SqlitePool,
}

impl TaskExecutor for BatchHashExecutor {
    fn execute(
        &self,
        ctx: TaskContext,
        payload: Value,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>> {
        let db = self.db.clone();
        Box::pin(async move {
            // 获取文件路径列表
            let file_paths: Vec<String> = payload["file_paths"]
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("Missing file_paths"))?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();

            if file_paths.is_empty() {
                return Ok(Some("No files to hash".to_string()));
            }

            ctx.report_progress(0.0, Some(&format!("Hashing {} files...", file_paths.len())))
                .await;

            // 使用并行哈希
            let results = hasher::calculate_hashes_batch_async(file_paths.clone()).await;

            // 统计结果
            let mut success_count = 0;
            let mut error_count = 0;

            for result in &results {
                match result {
                    Ok((path, md5, xxhash)) => {
                        // 更新数据库
                        let _ = sqlx::query(
                            "UPDATE media_files SET hash_md5 = ?, hash_xxhash = ?, updated_at = ? WHERE path = ?"
                        )
                        .bind(md5)
                        .bind(xxhash)
                        .bind(chrono::Utc::now().to_rfc3339())
                        .bind(path)
                        .execute(&db)
                        .await;
                        success_count += 1;
                    }
                    Err(_) => {
                        error_count += 1;
                    }
                }
            }

            ctx.report_progress(100.0, Some("Batch hash completed"))
                .await;

            Ok(Some(format!(
                "Batch hash completed: {} succeeded, {} failed",
                success_count, error_count
            )))
        })
    }
}
