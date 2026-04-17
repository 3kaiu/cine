use std::sync::Arc;

use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, SqlitePool};

use crate::models::{DuplicateGroup, DuplicateMovieGroup, MediaFile};
use crate::services::task_queue::{TaskQueue, TaskType};
use crate::services::{dedupe, empty_dirs};

/// 对媒体库相关操作的统一服务外观，供 HTTP / GraphQL handler 调用。
pub struct LibraryService {
    db: SqlitePool,
    task_queue: Arc<TaskQueue>,
}

impl LibraryService {
    pub fn new(db: SqlitePool, task_queue: Arc<TaskQueue>) -> Self {
        Self { db, task_queue }
    }

    pub fn db(&self) -> &SqlitePool {
        &self.db
    }

    /// 提交目录扫描任务
    pub async fn submit_scan_task(
        &self,
        directory: String,
        recursive: bool,
        file_types: Vec<String>,
        description: Option<String>,
    ) -> anyhow::Result<String> {
        let payload = serde_json::json!({
            "directory": directory,
            "recursive": recursive,
            "file_types": file_types,
        });

        self.task_queue
            .submit(TaskType::Scan, description, payload)
            .await
    }

    /// 获取带过滤条件的文件列表（供 REST 使用）。
    pub async fn list_files(
        &self,
        query: FileListQuery,
    ) -> Result<FileListResponse, (StatusCode, String)> {
        let page = query.page.unwrap_or(1);
        let page_size = query.page_size.unwrap_or(50).min(500);
        let offset = (page - 1) * page_size;
        let include_video_info = query.include_video_info.unwrap_or(true);
        let include_metadata = query.include_metadata.unwrap_or(true);

        let mut builder = QueryBuilder::new(
            "SELECT id, path, name, size, file_type, hash_xxhash, hash_md5, tmdb_id, quality_score, ",
        );
        if include_video_info {
            builder.push("video_info");
        } else {
            builder.push("NULL AS video_info");
        }
        builder.push(", ");
        if include_metadata {
            builder.push("metadata");
        } else {
            builder.push("NULL AS metadata");
        }
        builder.push(", created_at, updated_at, last_modified FROM media_files WHERE 1=1");

        if let Some(ref file_type) = query.file_type {
            builder.push(" AND file_type = ");
            builder.push_bind(file_type);
        }

        if let Some(ref name) = query.name {
            builder.push(" AND name LIKE ");
            builder.push_bind(format!("%{}%", name));
        }

        if let Some(min_size) = query.min_size {
            builder.push(" AND size >= ");
            builder.push_bind(min_size);
        }

        if let Some(max_size) = query.max_size {
            builder.push(" AND size <= ");
            builder.push_bind(max_size);
        }

        builder.push(" ORDER BY size DESC LIMIT ");
        builder.push_bind(page_size as i64);
        builder.push(" OFFSET ");
        builder.push_bind(offset as i64);

        let files = builder
            .build_query_as::<MediaFile>()
            .fetch_all(&self.db)
            .await
            .map_err(internal_error)?;

        let mut count_builder = QueryBuilder::new("SELECT COUNT(*) FROM media_files WHERE 1=1");

        if let Some(ref file_type) = query.file_type {
            count_builder.push(" AND file_type = ");
            count_builder.push_bind(file_type);
        }

        if let Some(ref name) = query.name {
            count_builder.push(" AND name LIKE ");
            count_builder.push_bind(format!("%{}%", name));
        }

        if let Some(min_size) = query.min_size {
            count_builder.push(" AND size >= ");
            count_builder.push_bind(min_size);
        }

        if let Some(max_size) = query.max_size {
            count_builder.push(" AND size <= ");
            count_builder.push_bind(max_size);
        }

        let total: i64 = count_builder
            .build_query_scalar()
            .fetch_one(&self.db)
            .await
            .map_err(internal_error)?;

        Ok(FileListResponse {
            files,
            total: total as u64,
            page,
            page_size,
        })
    }

    /// 查找基于哈希的重复文件组。
    pub async fn find_duplicates(&self) -> anyhow::Result<Vec<DuplicateGroup>> {
        dedupe::find_duplicates(&self.db).await
    }

    /// 查找基于 TMDB ID 的重复影片。
    pub async fn find_duplicate_movies(&self) -> anyhow::Result<Vec<DuplicateMovieGroup>> {
        dedupe::find_duplicate_movies_by_tmdb(&self.db).await
    }

    /// 查找相似文件组（名称模糊匹配）。
    pub async fn find_similar_files(
        &self,
        threshold: f64,
    ) -> anyhow::Result<Vec<dedupe::SimilarFileGroup>> {
        dedupe::find_similar_files(&self.db, threshold).await
    }

    /// 提交相似文件分析长任务。
    pub async fn submit_similar_scan_task(
        &self,
        threshold: f64,
        description: Option<String>,
    ) -> anyhow::Result<String> {
        let payload = serde_json::json!({
            "threshold": threshold,
        });

        self.task_queue
            .submit(
                TaskType::Custom("similar_scan".to_string()),
                description,
                payload,
            )
            .await
    }

    /// 查找空目录。
    pub fn find_empty_dirs(
        &self,
        directory: String,
        recursive: bool,
    ) -> Result<EmptyDirsResponse, (StatusCode, String)> {
        let dirs =
            empty_dirs::find_empty_directories(&directory, recursive).map_err(internal_error)?;

        let mut by_category = std::collections::HashMap::new();
        for dir in &dirs {
            *by_category.entry(dir.category.clone()).or_insert(0usize) += 1;
        }

        Ok(EmptyDirsResponse {
            total: dirs.len(),
            dirs,
            by_category,
        })
    }
}

fn internal_error<E: std::fmt::Display>(err: E) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

#[derive(Deserialize)]
pub struct FileListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub file_type: Option<String>,
    pub name: Option<String>,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
    pub include_video_info: Option<bool>,
    pub include_metadata: Option<bool>,
}

#[derive(Serialize)]
pub struct FileListResponse {
    pub files: Vec<MediaFile>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

#[derive(Serialize)]
pub struct EmptyDirsResponse {
    pub dirs: Vec<empty_dirs::EmptyDirInfo>,
    pub total: usize,
    pub by_category: std::collections::HashMap<String, usize>,
}
