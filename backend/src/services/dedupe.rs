use sqlx::SqlitePool;
use crate::models::{MediaFile, DuplicateGroup};

/// 查找重复文件（优化版本：使用数据库分组）
pub async fn find_duplicates(db: &SqlitePool) -> anyhow::Result<Vec<DuplicateGroup>> {
    // 优化：在数据库层面进行分组，减少内存占用和网络传输
    // 先查询重复的哈希值和统计信息
    #[derive(sqlx::FromRow)]
    struct DuplicateHash {
        hash_md5: String,
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
        "#
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
            let query = format!(
                "SELECT * FROM media_files WHERE id IN ({})",
                placeholders
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
