use crate::models::{DuplicateGroup, MediaFile};
use crate::services::task_queue::TaskContext;
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};

const DEDUPE_MEDIA_FILE_FIELDS: &str =
    "id, path, name, size, file_type, NULL AS hash_xxhash, hash_md5, tmdb_id, quality_score, video_info, NULL AS metadata, \
    detected_title, detected_year, detected_season, detected_episode, parser_provider, parse_version, confidence_score, review_state, \
    match_provider, match_external_id, locked_match_provider, locked_match_external_id, ai_disabled_reason, created_at, updated_at, last_modified";
const DEDUPE_MEDIA_FILE_FIELDS_WITH_METADATA: &str =
    "id, path, name, size, file_type, NULL AS hash_xxhash, hash_md5, tmdb_id, quality_score, video_info, metadata, \
    detected_title, detected_year, detected_season, detected_episode, parser_provider, parse_version, confidence_score, review_state, \
    match_provider, match_external_id, locked_match_provider, locked_match_external_id, ai_disabled_reason, created_at, updated_at, last_modified";

/// 查找重复文件（优化版本：使用数据库分组）
pub async fn find_duplicates(db: &SqlitePool) -> anyhow::Result<Vec<DuplicateGroup>> {
    // 优化：在数据库层面进行分组，减少内存占用和网络传输
    // 先查询重复的哈希值和统计信息
    #[derive(sqlx::FromRow)]
    struct DuplicateHash {
        hash_md5: String,
        #[allow(dead_code)]
        file_count: i64,
        total_size: i64,
        file_ids: String, // GROUP_CONCAT 结果
    }

    // 优化：先设置 GROUP_CONCAT 最大长度（SQLite 默认 1024）
    // 对于大量重复文件，可能需要更大的值
    sqlx::query("PRAGMA group_concat_max_length = 100000")
        .execute(db)
        .await?;

    // 限制返回的重复组数量，防止大库时响应过大
    const MAX_DUPLICATE_GROUPS: i64 = 500;

    let duplicate_hashes: Vec<DuplicateHash> = sqlx::query_as(
        r#"
        SELECT 
            hash_md5,
            COUNT(*) as file_count,
            SUM(size) as total_size,
            GROUP_CONCAT(id, ',') as file_ids
        FROM media_files
        WHERE hash_md5 IS NOT NULL
        GROUP BY hash_md5
        HAVING COUNT(*) > 1
        ORDER BY total_size DESC
        LIMIT ?
        "#,
    )
    .bind(MAX_DUPLICATE_GROUPS)
    .fetch_all(db)
    .await?;

    // 对于每个重复组，获取文件详情
    // 优化：处理 GROUP_CONCAT 长度限制（SQLite 默认 1024 字符）
    let mut duplicate_groups = Vec::new();
    for dup_hash in duplicate_hashes {
        let file_ids: Vec<&str> = dup_hash.file_ids.split(',').collect();

        // 如果文件ID列表过长，分批查询
        const BATCH_SIZE: usize = 50; // 每批最多50个文件ID
        let mut all_files = Vec::new();

        for chunk in file_ids.chunks(BATCH_SIZE) {
            let placeholders = vec!["?"; chunk.len()].join(",");
            let query = format!(
                "SELECT {} FROM media_files WHERE id IN ({})",
                DEDUPE_MEDIA_FILE_FIELDS, placeholders
            );

            let mut query_builder = sqlx::query_as::<_, MediaFile>(&query);
            for file_id in chunk {
                query_builder = query_builder.bind(*file_id);
            }

            let files = query_builder.fetch_all(db).await?;
            all_files.extend(files);
        }

        duplicate_groups.push(DuplicateGroup {
            hash: dup_hash.hash_md5,
            files: all_files,
            total_size: dup_hash.total_size,
        });
    }

    Ok(duplicate_groups)
}

/// 按 TMDB ID 查找重复影片
pub async fn find_duplicate_movies_by_tmdb(
    db: &SqlitePool,
) -> anyhow::Result<Vec<crate::models::DuplicateMovieGroup>> {
    let duplicate_tmdb_ids: Vec<(i64, i64)> = sqlx::query_as(
        r#"
        SELECT tmdb_id, COUNT(*) as file_count
        FROM media_files
        WHERE tmdb_id IS NOT NULL
        GROUP BY tmdb_id
        HAVING COUNT(*) > 1
        "#,
    )
    .fetch_all(db)
    .await?;

    let mut movie_groups = Vec::new();

    for (tmdb_id, _) in duplicate_tmdb_ids {
        // 获取该影片的所有文件，按质量得分降序排序
        let files: Vec<MediaFile> = sqlx::query_as(&format!(
            "SELECT {} FROM media_files WHERE tmdb_id = ? ORDER BY quality_score DESC, size DESC",
            DEDUPE_MEDIA_FILE_FIELDS_WITH_METADATA
        ))
        .bind(tmdb_id)
        .fetch_all(db)
        .await?;

        if let Some(first_file) = files.first() {
            // 解析元数据获取标题
            let title = if let Some(ref metadata_str) = first_file.metadata {
                let metadata: serde_json::Value =
                    serde_json::from_str(metadata_str).unwrap_or_default();
                metadata
                    .get("title")
                    .or_else(|| metadata.get("name")) // 处理 TV 剧集名
                    .and_then(|t| t.as_str())
                    .unwrap_or(&first_file.name)
                    .to_string()
            } else {
                first_file.name.clone()
            };

            movie_groups.push(crate::models::DuplicateMovieGroup {
                tmdb_id: tmdb_id as u32,
                title,
                files,
            });
        }
    }

    Ok(movie_groups)
}

/// 相似文件组
#[derive(Debug, Clone, serde::Serialize, utoipa::ToSchema)]
pub struct SimilarFileGroup {
    pub representative_name: String,
    pub similarity: f64,
    pub files: Vec<MediaFile>,
}

/// 标准化文件名（移除常见后缀和质量标识）
fn normalize_filename(name: &str) -> String {
    // 移除扩展名
    let name = std::path::Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(name);

    // 移除常见质量标识
    let re = regex::Regex::new(
        r"(?i)\.?(1080p|720p|480p|2160p|4k|uhd|bluray|bdrip|webrip|dvdrip|hdtv|x264|x265|hevc|h\.?264|aac|ac3|dts|5\.1|10bit|hdr|remux|proper)\b"
    ).unwrap();

    let normalized = re.replace_all(name, "");

    // 移除额外的分隔符和空格
    let re_sep = regex::Regex::new(r"[\._\-\s]+").unwrap();
    re_sep.replace_all(&normalized, " ").trim().to_lowercase()
}

fn tokenize_normalized_name(name: &str) -> Vec<String> {
    const STOP_WORDS: &[&str] = &[
        "the", "a", "an", "and", "of", "part", "cut", "edition", "extended", "ultimate",
    ];

    name.split_whitespace()
        .filter(|token| token.len() >= 2)
        .filter(|token| !STOP_WORDS.contains(token))
        .map(|token| token.to_string())
        .collect()
}

fn extract_year_token(name: &str) -> Option<String> {
    static YEAR_RE: once_cell::sync::Lazy<regex::Regex> =
        once_cell::sync::Lazy::new(|| regex::Regex::new(r"\b(19|20)\d{2}\b").unwrap());

    YEAR_RE.find(name).map(|m| m.as_str().to_string())
}

fn build_similarity_bucket_keys(normalized_name: &str) -> Vec<String> {
    let tokens = tokenize_normalized_name(normalized_name);
    if tokens.is_empty() {
        return vec![];
    }

    let year = extract_year_token(normalized_name).unwrap_or_else(|| "unknown".to_string());
    let token_count = tokens.len();
    let len_bucket = normalized_name.len() / 5;
    let first = tokens[0].chars().take(4).collect::<String>();
    let second = tokens
        .get(1)
        .map(|token| token.chars().take(4).collect::<String>())
        .unwrap_or_default();
    let longest = tokens
        .iter()
        .max_by_key(|token| token.len())
        .map(|token| token.chars().take(4).collect::<String>())
        .unwrap_or_default();

    let mut keys = vec![
        format!("first:{}:{}:{}", year, token_count, first),
        format!("pair:{}:{}:{}:{}", year, token_count, first, second),
        format!(
            "longest:{}:{}:{}:{}",
            year, len_bucket, token_count, longest
        ),
    ];

    if year != "unknown" {
        keys.push(format!("yearless-first:{}:{}", token_count, first));
        keys.push(format!(
            "yearless-longest:{}:{}:{}",
            len_bucket, token_count, longest
        ));
    }

    keys
}

/// 内部实现：查找相似文件（基于文件名模糊匹配），可选任务上下文用于长任务管理。
async fn find_similar_files_internal(
    db: &SqlitePool,
    threshold: f64,
    ctx: Option<&TaskContext>,
) -> anyhow::Result<Vec<SimilarFileGroup>> {
    use strsim::jaro_winkler;

    // 获取所有视频文件
    let files: Vec<MediaFile> = sqlx::query_as(&format!(
        "SELECT {} FROM media_files WHERE file_type = 'video' ORDER BY name",
        DEDUPE_MEDIA_FILE_FIELDS
    ))
    .fetch_all(db)
    .await?;

    if files.len() < 2 {
        return Ok(vec![]);
    }

    // 标准化所有文件名，并建立多组候选桶，避免 O(n^2) 全量比较
    let normalized: Vec<(usize, String)> = files
        .iter()
        .enumerate()
        .map(|(i, f)| (i, normalize_filename(&f.name)))
        .collect();

    let mut buckets: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, normalized_name) in &normalized {
        for bucket_key in build_similarity_bucket_keys(normalized_name) {
            buckets.entry(bucket_key).or_default().push(*index);
        }
    }

    let mut candidate_pairs: HashSet<(usize, usize)> = HashSet::new();
    for indices in buckets.values() {
        if indices.len() < 2 {
            continue;
        }

        // 超大桶通常说明键过于宽泛，跳过它以避免退化回近似 O(n^2)
        if indices.len() > 200 {
            continue;
        }

        for i in 0..indices.len() {
            for j in (i + 1)..indices.len() {
                let left = indices[i];
                let right = indices[j];
                let pair = if left < right {
                    (left, right)
                } else {
                    (right, left)
                };
                candidate_pairs.insert(pair);
            }
        }
    }

    // 使用 Union-Find 来分组
    let mut parent: Vec<usize> = (0..files.len()).collect();

    fn find(parent: &mut [usize], i: usize) -> usize {
        if parent[i] != i {
            parent[i] = find(parent, parent[i]);
        }
        parent[i]
    }

    fn union(parent: &mut [usize], i: usize, j: usize) {
        let pi = find(parent, i);
        let pj = find(parent, j);
        if pi != pj {
            parent[pi] = pj;
        }
    }

    let candidate_pairs: Vec<(usize, usize)> = candidate_pairs.into_iter().collect();
    let total = candidate_pairs.len();

    if let Some(ctx) = ctx {
        ctx.report_progress(5.0, Some(&format!("Prepared {} candidate pairs", total)))
            .await;
    }

    // 只比较桶内候选对，避免对整个媒体库做全量两两比较
    for (idx, (i, j)) in candidate_pairs.iter().enumerate() {
        if let Some(ctx) = ctx {
            if ctx.is_cancelled().await {
                return Err(anyhow::anyhow!("similar files analysis cancelled"));
            }

            if idx == 0 || idx % 500 == 0 {
                let progress = if total == 0 {
                    100.0
                } else {
                    5.0 + (idx as f64 / total as f64) * 95.0
                };
                ctx.report_progress(progress.min(99.0), Some("Analyzing similar files"))
                    .await;
            }
        }

        let sim = jaro_winkler(&normalized[*i].1, &normalized[*j].1);
        if sim >= threshold {
            union(&mut parent, *i, *j);
        }
    }

    if let Some(ctx) = ctx {
        ctx.report_progress(100.0, Some("Similar files analysis completed"))
            .await;
    }

    // 收集分组
    let mut groups: std::collections::HashMap<usize, Vec<usize>> = std::collections::HashMap::new();
    for i in 0..files.len() {
        let root = find(&mut parent, i);
        groups.entry(root).or_default().push(i);
    }

    // 过滤只保留有多个文件的组
    let result: Vec<SimilarFileGroup> = groups
        .into_iter()
        .filter(|(_, indices)| indices.len() > 1)
        .map(|(_, indices)| {
            let group_files: Vec<MediaFile> = indices.iter().map(|&i| files[i].clone()).collect();
            let rep_name = group_files
                .first()
                .map(|f| f.name.clone())
                .unwrap_or_default();

            // 计算组内平均相似度
            let mut total_sim = 0.0;
            let mut count = 0;
            for i in 0..indices.len() {
                for j in (i + 1)..indices.len() {
                    total_sim += jaro_winkler(&normalized[indices[i]].1, &normalized[indices[j]].1);
                    count += 1;
                }
            }
            let avg_sim = if count > 0 {
                total_sim / count as f64
            } else {
                1.0
            };

            SimilarFileGroup {
                representative_name: rep_name,
                similarity: avg_sim,
                files: group_files,
            }
        })
        .collect();

    Ok(result)
}

/// 查找相似文件（基于文件名模糊匹配）
pub async fn find_similar_files(
    db: &SqlitePool,
    threshold: f64,
) -> anyhow::Result<Vec<SimilarFileGroup>> {
    find_similar_files_internal(db, threshold, None).await
}

/// 查找相似文件（长任务版本，带 TaskContext）。
pub async fn find_similar_files_with_ctx(
    db: &SqlitePool,
    threshold: f64,
    ctx: &TaskContext,
) -> anyhow::Result<Vec<SimilarFileGroup>> {
    find_similar_files_internal(db, threshold, Some(ctx)).await
}
