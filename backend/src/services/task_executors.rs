use serde_json::Value;
use sqlx::SqlitePool;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use crate::services::smart_cache::SmartCacheManager;
use crate::services::task_queue::{TaskContext, TaskExecutor};
use crate::services::{dedupe, hasher, identify, renamer, scanner, scraper};

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
    pub hash_cache: Arc<SmartCacheManager>,
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
            let operation = payload["operation"].as_str().unwrap_or("scrape");

            if operation == "identify_preview" {
                let file_ids: Vec<String> = payload["file_ids"]
                    .as_array()
                    .ok_or_else(|| anyhow::anyhow!("Missing file_ids"))?
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
                let allow_ai = payload["allow_ai"].as_bool().unwrap_or(true);
                let total = file_ids.len().max(1);
                let mut results = Vec::new();

                for (index, file_id) in file_ids.iter().enumerate() {
                    let previews = identify::preview_files(
                        &db,
                        &client,
                        &config,
                        std::slice::from_ref(file_id),
                        allow_ai,
                    )
                    .await?;
                    results.extend(previews);
                    let progress = ((index + 1) as f64 / total as f64) * 100.0;
                    ctx.report_progress(
                        progress,
                        Some(&format!("Previewing {}/{} files", index + 1, total)),
                    )
                    .await;
                }

                return Ok(Some(serde_json::to_string(&serde_json::json!({
                    "results": results
                }))?));
            }

            if operation == "identify_apply" {
                let selections = payload["selections"]
                    .as_array()
                    .ok_or_else(|| anyhow::anyhow!("Missing selections"))?;
                let total = selections.len().max(1);
                let mut applied = Vec::new();

                for (index, item) in selections.iter().enumerate() {
                    let selection = identify::ApplySelection {
                        file_id: item["file_id"]
                            .as_str()
                            .ok_or_else(|| anyhow::anyhow!("Missing file_id"))?
                            .to_string(),
                        provider: item["provider"]
                            .as_str()
                            .ok_or_else(|| anyhow::anyhow!("Missing provider"))?
                            .to_string(),
                        external_id: item["external_id"]
                            .as_str()
                            .ok_or_else(|| anyhow::anyhow!("Missing external_id"))?
                            .to_string(),
                        media_type: item["media_type"]
                            .as_str()
                            .ok_or_else(|| anyhow::anyhow!("Missing media_type"))?
                            .to_string(),
                        lock_match: item["lock_match"].as_bool().unwrap_or(false),
                        download_images: item["download_images"].as_bool().unwrap_or(false),
                        generate_nfo: item["generate_nfo"].as_bool().unwrap_or(false),
                    };
                    let metadata =
                        identify::apply_selection(&db, &client, &config, &selection).await?;
                    applied.push(serde_json::json!({
                        "file_id": selection.file_id,
                        "metadata": metadata
                    }));
                    let progress = ((index + 1) as f64 / total as f64) * 100.0;
                    ctx.report_progress(
                        progress,
                        Some(&format!("Applying {}/{} selections", index + 1, total)),
                    )
                    .await;
                }

                return Ok(Some(serde_json::to_string(&serde_json::json!({
                    "applied": applied
                }))?));
            }

            let file_ids: Vec<String> = payload["file_ids"]
                .as_array()
                .ok_or_else(|| anyhow::anyhow!("Missing file_ids"))?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();

            let auto_match = payload["auto_match"].as_bool().unwrap_or(true);
            let download_images = payload["download_images"].as_bool().unwrap_or(true);
            let generate_nfo = payload["generate_nfo"].as_bool().unwrap_or(true);

            scraper::batch_scrape_metadata(
                &db,
                &client,
                &file_ids,
                scraper::BatchScrapeMetadataParams {
                    auto_match,
                    config: &config,
                    download_images,
                    generate_nfo,
                    max_concurrent: 5,
                    ctx,
                },
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

/// 相似文件分析执行器（长任务）
pub struct SimilarScanExecutor {
    pub db: SqlitePool,
}

impl TaskExecutor for SimilarScanExecutor {
    fn execute(
        &self,
        ctx: TaskContext,
        payload: Value,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<Option<String>>> + Send>> {
        let db = self.db.clone();
        Box::pin(async move {
            let threshold = payload["threshold"].as_f64().unwrap_or(0.8).clamp(0.0, 1.0);

            ctx.report_progress(0.0, Some("Starting similar files analysis"))
                .await;

            let groups = dedupe::find_similar_files_with_ctx(&db, threshold, &ctx).await?;
            let total_groups = groups.len();
            let groups_json = serde_json::to_string(&groups)?;

            ctx.report_progress(100.0, Some("Similar files analysis completed"))
                .await;

            Ok(Some(format!(
                "{{\"total_groups\":{},\"groups\":{}}}",
                total_groups, groups_json
            )))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::ScrapeExecutor;
    use crate::config::AppConfig;
    use crate::services::task_queue::{TaskContext, TaskExecutor};
    use serde_json::Value;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::sync::Arc;

    async fn create_test_db() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory DB");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");
        pool
    }

    #[tokio::test]
    async fn scrape_executor_identify_preview_serializes_results() {
        let pool = create_test_db().await;
        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind("file-executor-1")
        .bind("/tmp/.mkv")
        .bind(".mkv")
        .bind(1024_i64)
        .bind("video")
        .bind(chrono::Utc::now())
        .bind(chrono::Utc::now())
        .bind(chrono::Utc::now())
        .execute(&pool)
        .await
        .unwrap();

        let executor = ScrapeExecutor {
            db: pool,
            http_client: reqwest::Client::builder()
                .no_proxy()
                .build()
                .expect("Failed to create test client"),
            config: Arc::new(AppConfig {
                database_url: "sqlite::memory:".to_string(),
                port: 3000,
                tmdb_api_key: None,
                hash_cache_dir: std::env::temp_dir().join("cine-hash-cache"),
                trash_dir: std::env::temp_dir().join("cine-trash"),
                max_file_size: 200_000_000_000,
                chunk_size: 64 * 1024 * 1024,
                media_directories: vec![],
                log_level: "info".to_string(),
                log_format: "pretty".to_string(),
                enable_plugins: false,
                enable_cache_warmup: false,
                task_lease_seconds: 60,
                task_dispatch_interval_ms: 100,
                task_retries_pure: 1,
                task_retries_idempotent: 1,
                task_retries_side_effectful: 0,
                worker_heartbeat_interval_secs: 1,
                worker_task_heartbeat_interval_secs: 1,
            }),
        };

        let result = executor
            .execute(
                TaskContext::for_test("task-identify-preview"),
                serde_json::json!({
                    "operation": "identify_preview",
                    "file_ids": ["file-executor-1"],
                    "allow_ai": false
                }),
            )
            .await
            .unwrap()
            .unwrap();

        let payload: Value = serde_json::from_str(&result).unwrap();
        let preview = &payload["results"][0];
        assert_eq!(preview["file_id"], "file-executor-1");
        assert_eq!(preview["parse"]["title"], "");
        assert!(preview["candidates"].as_array().unwrap().is_empty());
    }
}
