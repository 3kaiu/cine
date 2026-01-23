//! 优化的数据库查询函数
//!
//! 提供按需字段查询，避免SELECT *的性能问题
//! 使用复合索引优化查询性能

use sqlx::SqlitePool;
use crate::models::MediaFile;

/// 查询选项
#[derive(Debug, Clone, Default)]
pub struct QueryOptions {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub order_by: Option<String>,
    pub order_desc: bool,
}

/// 按ID获取文件信息（优化：按需选择字段）
pub async fn get_file_by_id_optimized(
    db: &SqlitePool,
    file_id: &str,
    include_video_info: bool,
    include_metadata: bool
) -> anyhow::Result<Option<MediaFile>> {
    let mut fields = vec![
        "id", "path", "name", "size", "file_type",
        "hash_xxhash", "hash_md5", "tmdb_id", "quality_score",
        "created_at", "updated_at", "last_modified"
    ];

    if include_video_info {
        fields.push("video_info");
    }

    if include_metadata {
        fields.push("metadata");
    }

    let field_list = fields.join(", ");
    let query = format!("SELECT {} FROM media_files WHERE id = ?", field_list);

    let file = sqlx::query_as::<_, MediaFile>(&query)
        .bind(file_id)
        .fetch_optional(db)
        .await?;

    Ok(file)
}

/// 批量获取文件信息（优化：减少查询次数）
pub async fn get_files_by_ids_optimized(
    db: &SqlitePool,
    file_ids: &[String],
    include_video_info: bool,
    include_metadata: bool
) -> anyhow::Result<Vec<MediaFile>> {
    if file_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut fields = vec![
        "id", "path", "name", "size", "file_type",
        "hash_xxhash", "hash_md5", "tmdb_id", "quality_score",
        "created_at", "updated_at", "last_modified"
    ];

    if include_video_info {
        fields.push("video_info");
    }

    if include_metadata {
        fields.push("metadata");
    }

    let field_list = fields.join(", ");
    let placeholders = vec!["?"; file_ids.len()].join(",");
    let query = format!("SELECT {} FROM media_files WHERE id IN ({}) ORDER BY name", field_list, placeholders);

    let mut query_builder = sqlx::query_as::<_, MediaFile>(&query);
    for file_id in file_ids {
        query_builder = query_builder.bind(file_id);
    }

    let files = query_builder.fetch_all(db).await?;
    Ok(files)
}

/// 获取文件列表（分页优化）
pub async fn get_files_paginated_optimized(
    db: &SqlitePool,
    file_type: Option<&str>,
    options: QueryOptions
) -> anyhow::Result<Vec<MediaFile>> {
    let fields = vec![
        "id", "path", "name", "size", "file_type",
        "hash_xxhash", "hash_md5", "tmdb_id", "quality_score",
        "created_at", "updated_at", "last_modified"
    ].join(", ");

    let mut query = format!("SELECT {} FROM media_files WHERE 1=1", fields);
    let mut bindings = Vec::new();

    // 添加文件类型过滤
    if let Some(ft) = file_type {
        query.push_str(" AND file_type = ?");
        bindings.push(ft.to_string());
    }

    // 添加排序
    let order_field = options.order_by.as_deref().unwrap_or("created_at");
    let order_direction = if options.order_desc { "DESC" } else { "ASC" };
    query.push_str(&format!(" ORDER BY {} {}", order_field, order_direction));

    // 添加分页
    if let Some(limit) = options.limit {
        query.push_str(" LIMIT ?");
        bindings.push(limit.to_string());

        if let Some(offset) = options.offset {
            query.push_str(" OFFSET ?");
            bindings.push(offset.to_string());
        }
    }

    let mut query_builder = sqlx::query_as::<_, MediaFile>(&query);
    for binding in bindings {
        query_builder = query_builder.bind(binding);
    }

    let files = query_builder.fetch_all(db).await?;
    Ok(files)
}

/// 获取大文件（使用复合索引优化）
pub async fn get_large_files_optimized(
    db: &SqlitePool,
    min_size: i64,
    limit: i64,
    offset: i64
) -> anyhow::Result<Vec<MediaFile>> {
    // 使用复合索引 idx_media_files_file_type_size
    let files = sqlx::query_as::<_, MediaFile>(
        r#"
        SELECT
            id, path, name, size, file_type,
            hash_xxhash, hash_md5, tmdb_id, quality_score,
            created_at, updated_at, last_modified, video_info, metadata
        FROM media_files
        WHERE size > ?
        ORDER BY size DESC
        LIMIT ? OFFSET ?
        "#
    )
    .bind(min_size)
    .bind(limit)
    .bind(offset)
    .fetch_all(db)
    .await?;

    Ok(files)
}

/// 获取统计信息（单次查询优化）
pub async fn get_file_stats_optimized(db: &SqlitePool) -> anyhow::Result<serde_json::Value> {
    let stats: (i64, i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        r#"
        SELECT
            COUNT(*) as total_files,
            COUNT(CASE WHEN file_type = 'video' THEN 1 END) as video_files,
            COUNT(CASE WHEN file_type = 'audio' THEN 1 END) as audio_files,
            COUNT(CASE WHEN file_type = 'image' THEN 1 END) as image_files,
            COUNT(CASE WHEN hash_md5 IS NOT NULL THEN 1 END) as hashed_files,
            COUNT(CASE WHEN tmdb_id IS NOT NULL THEN 1 END) as scraped_files,
            COALESCE(SUM(size), 0) as total_size
        FROM media_files
        "#
    )
    .fetch_one(db)
    .await?;

    let (total_files, video_files, audio_files, image_files, hashed_files, scraped_files, total_size) = stats;

    Ok(serde_json::json!({
        "total_files": total_files,
        "video_files": video_files,
        "audio_files": audio_files,
        "image_files": image_files,
        "hashed_files": hashed_files,
        "scraped_files": scraped_files,
        "total_size_bytes": total_size,
        "hash_coverage": if total_files > 0 { (hashed_files as f64 / total_files as f64 * 100.0) } else { 0.0 },
        "scrape_coverage": if video_files > 0 { (scraped_files as f64 / video_files as f64 * 100.0) } else { 0.0 }
    }))
}