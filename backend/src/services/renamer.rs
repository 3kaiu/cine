use crate::models::MediaFile;
use regex::Regex;
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};

/// 生成新文件名
pub fn generate_new_name(file: &MediaFile, template: &str) -> Option<String> {
    // 解析元数据（如果存在）
    let metadata: Option<serde_json::Value> = file
        .metadata
        .as_ref()
        .and_then(|m| serde_json::from_str(m).ok());

    let mut new_name = template.to_string();

    // 替换模板变量
    // {title} - 标题（优先尝试元数据中的标题，通常是刮削到的中文名）
    if let Some(title) = metadata
        .as_ref()
        .and_then(|m| m.get("title").or_else(|| m.get("name")))
        .and_then(|t| t.as_str())
    {
        new_name = new_name.replace("{title}", title);
    } else if let Some(orig_title) = metadata
        .as_ref()
        .and_then(|m| m.get("original_title").or_else(|| m.get("original_name")))
        .and_then(|t| t.as_str())
    {
        new_name = new_name.replace("{title}", orig_title);
    } else {
        // 从文件名提取
        let (title, _, _, _) = crate::services::scraper::parse_filename(&file.name);
        new_name = new_name.replace("{title}", &title);
    }

    // {year} - 年份
    if let Some(year) = metadata.as_ref().and_then(|m| {
        // 优先尝试直接获取年份（支持数字或字符串）
        if let Some(y) = m.get("year") {
            if let Some(n) = y.as_u64() {
                return Some(n as u32);
            }
            if let Some(s) = y.as_str() {
                if let Ok(n) = s.parse::<u32>() {
                    return Some(n);
                }
            }
        }
        // 尝试从 release_date 提取
        m.get("release_date")
            .and_then(|y| y.as_str())
            .and_then(|s| s.split('-').next())
            .and_then(|y| y.parse::<u32>().ok())
    }) {
        new_name = new_name.replace("{year}", &year.to_string());
    }

    // {season:02d} - 季数（格式化）
    let season_re = Regex::new(r"\{season(?::(\d+)d)?\}").unwrap();
    if let Some(caps) = season_re.captures(&new_name) {
        let format = caps
            .get(1)
            .and_then(|m| m.as_str().parse::<usize>().ok())
            .unwrap_or(2);

        if let Some(season) = metadata
            .as_ref()
            .and_then(|m| m.get("season"))
            .and_then(|s| s.as_u64())
            .map(|s| s as u32)
        {
            let formatted = format!("{:0width$}", season, width = format);
            new_name = season_re.replace(&new_name, &formatted).to_string();
        } else {
            // 从文件名提取
            let (_, _, season, _) = crate::services::scraper::parse_filename(&file.name);
            if let Some(s) = season {
                let formatted = format!("{:0width$}", s, width = format);
                new_name = season_re.replace(&new_name, &formatted).to_string();
            }
        }
    }

    // {episode:02d} - 集数（格式化）
    let episode_re = Regex::new(r"\{episode(?::(\d+)d)?\}").unwrap();
    if let Some(caps) = episode_re.captures(&new_name) {
        let format = caps
            .get(1)
            .and_then(|m| m.as_str().parse::<usize>().ok())
            .unwrap_or(2);

        if let Some(episode) = metadata
            .as_ref()
            .and_then(|m| m.get("episode"))
            .and_then(|e| e.as_u64())
            .map(|e| e as u32)
        {
            let formatted = format!("{:0width$}", episode, width = format);
            new_name = episode_re.replace(&new_name, &formatted).to_string();
        } else {
            // 从文件名提取
            let (_, _, _, episode) = crate::services::scraper::parse_filename(&file.name);
            if let Some(e) = episode {
                let formatted = format!("{:0width$}", e, width = format);
                new_name = episode_re.replace(&new_name, &formatted).to_string();
            }
        }
    }

    // {ext} - 扩展名
    let ext = Path::new(&file.name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    new_name = new_name.replace("{ext}", ext);

    // 清理无效字符
    new_name = sanitize_filename(&new_name);

    Some(new_name)
}

/// 清理文件名中的无效字符
pub(crate) fn sanitize_filename(name: &str) -> String {
    // Windows/Linux 文件名无效字符
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    name.chars()
        .filter(|c| !invalid_chars.contains(c))
        .collect()
}

/// 执行文件重命名
pub async fn rename_file(db: &SqlitePool, file_id: &str, new_name: &str) -> anyhow::Result<()> {
    // 获取文件信息
    let file: MediaFile = sqlx::query_as("SELECT * FROM media_files WHERE id = ?")
        .bind(file_id)
        .fetch_one(db)
        .await?;

    let old_path = PathBuf::from(&file.path);
    let mut new_path = old_path.clone();
    new_path.set_file_name(new_name);

    // 重命名文件
    tokio::fs::rename(&old_path, &new_path).await?;

    // 更新数据库
    sqlx::query("UPDATE media_files SET path = ?, name = ?, updated_at = ? WHERE id = ?")
        .bind(new_path.to_string_lossy().to_string())
        .bind(new_name)
        .bind(chrono::Utc::now())
        .bind(file_id)
        .execute(db)
        .await?;

    // 记录操作日志
    let _ = crate::services::log::record_operation(
        db,
        "rename",
        Some(file_id),
        &file.path,
        Some(&new_path.to_string_lossy().to_string()),
    )
    .await;

    Ok(())
}

/// 撤销一次重命名操作
pub async fn undo_rename_by_log(db: &SqlitePool, log_id: &str) -> anyhow::Result<()> {
    let log: crate::models::OperationLog =
        sqlx::query_as("SELECT * FROM operation_logs WHERE id = ?")
            .bind(log_id)
            .fetch_one(db)
            .await?;

    if log.action != "rename" {
        return Err(anyhow::anyhow!(
            "Only rename operations can be undone by this function"
        ));
    }

    let current_path = log
        .new_path
        .ok_or_else(|| anyhow::anyhow!("Missing new_path in log"))?;
    let target_path = log.old_path;

    // 1. 物理磁盘恢复
    if Path::new(&current_path).exists() {
        tokio::fs::rename(&current_path, &target_path).await?;
    } else {
        return Err(anyhow::anyhow!(
            "Current file not found at {}",
            current_path
        ));
    }

    // 2. 数据库恢复
    let new_name = Path::new(&target_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid target path"))?;

    sqlx::query("UPDATE media_files SET path = ?, name = ?, updated_at = ? WHERE id = ?")
        .bind(&target_path)
        .bind(new_name)
        .bind(chrono::Utc::now())
        .bind(&log.file_id)
        .execute(db)
        .await?;

    // 3. 删除该条日志
    sqlx::query("DELETE FROM operation_logs WHERE id = ?")
        .bind(log_id)
        .execute(db)
        .await?;

    Ok(())
}
