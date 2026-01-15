use crate::models::{DuplicateGroup, MediaFile};
use sqlx::SqlitePool;

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
        "#,
    )
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
            let query = format!("SELECT * FROM media_files WHERE id IN ({})", placeholders);

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
        let files: Vec<MediaFile> = sqlx::query_as(
            "SELECT * FROM media_files WHERE tmdb_id = ? ORDER BY quality_score DESC, size DESC",
        )
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

/// 查找相似文件（基于文件名模糊匹配）
pub async fn find_similar_files(
    db: &SqlitePool,
    threshold: f64,
) -> anyhow::Result<Vec<SimilarFileGroup>> {
    use strsim::jaro_winkler;

    // 获取所有视频文件
    let files: Vec<MediaFile> =
        sqlx::query_as("SELECT * FROM media_files WHERE file_type = 'video' ORDER BY name")
            .fetch_all(db)
            .await?;

    if files.len() < 2 {
        return Ok(vec![]);
    }

    // 标准化所有文件名
    let normalized: Vec<(usize, String)> = files
        .iter()
        .enumerate()
        .map(|(i, f)| (i, normalize_filename(&f.name)))
        .collect();

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

    // 比较所有对（O(n^2)，对于大数据集可能需要优化）
    for i in 0..normalized.len() {
        for j in (i + 1)..normalized.len() {
            let sim = jaro_winkler(&normalized[i].1, &normalized[j].1);
            if sim >= threshold {
                union(&mut parent, i, j);
            }
        }
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
