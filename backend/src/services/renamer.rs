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

    // 解析视频信息（如果存在）
    let video_info: Option<crate::models::VideoInfo> = file
        .video_info
        .as_ref()
        .and_then(|v| serde_json::from_str(v).ok());

    // {resolution} - 分辨率 (4K, 1080p, 720p等)
    if new_name.contains("{resolution}") {
        if let Some(ref info) = video_info {
            if let (Some(w), Some(h)) = (info.width, info.height) {
                let resolution = if w >= 3840 || h >= 2160 {
                    "4K"
                } else if w >= 1920 || h >= 1080 {
                    "1080p"
                } else if w >= 1280 || h >= 720 {
                    "720p"
                } else {
                    "SD"
                };
                new_name = new_name.replace("{resolution}", resolution);
            } else {
                // 没有分辨率信息时，移除{resolution}
                new_name = new_name.replace(" [{resolution}]", "");
                new_name = new_name.replace("{resolution}", "");
            }
        } else {
            // 没有视频信息时，移除{resolution}
            new_name = new_name.replace(" [{resolution}]", "");
            new_name = new_name.replace("{resolution}", "");
        }
    }

    // {quality} - 质量标签（综合分辨率、HDR、来源等）
    if let Some(ref info) = video_info {
        let mut quality_parts = Vec::new();

        // 分辨率
        if let (Some(w), Some(h)) = (info.width, info.height) {
            if w >= 3840 || h >= 2160 {
                quality_parts.push("4K");
            } else if w >= 1920 || h >= 1080 {
                quality_parts.push("1080p");
            } else if w >= 1280 || h >= 720 {
                quality_parts.push("720p");
            }
        }

        // HDR信息（优先级：DV > HDR10+ > HDR）
        if info.is_dolby_vision.unwrap_or(false) {
            quality_parts.push("DV");
        } else if info.is_hdr10_plus.unwrap_or(false) {
            quality_parts.push("HDR10+");
        } else if info.is_hdr.unwrap_or(false) {
            quality_parts.push("HDR");
        }

        // 来源（只在有值时添加）
        if let Some(ref source) = info.source {
            match source.as_str() {
                "BluRay" => quality_parts.push("BluRay"),
                "iTunes" => quality_parts.push("iTunes"),
                "WEB-DL" => quality_parts.push("WEB-DL"),
                "HDTV" => quality_parts.push("HDTV"),
                _ => {}
            }
        }

        // 如果模板中有{quality}但质量信息为空，则移除整个{quality}标签（包括方括号）
        if new_name.contains("{quality}") {
            if !quality_parts.is_empty() {
                new_name = new_name.replace("{quality}", &quality_parts.join(" "));
            } else {
                // 移除 {quality} 及其可能的方括号和空格
                new_name = new_name.replace(" [{quality}]", "");
                new_name = new_name.replace("{quality}", "");
            }
        }
    } else if new_name.contains("{quality}") {
        // 没有视频信息时，也移除{quality}
        new_name = new_name.replace(" [{quality}]", "");
        new_name = new_name.replace("{quality}", "");
    }

    // {hdr} - HDR类型
    if new_name.contains("{hdr}") {
        if let Some(ref info) = video_info {
            let hdr_type = if info.is_dolby_vision.unwrap_or(false) {
                "DV"
            } else if info.is_hdr10_plus.unwrap_or(false) {
                "HDR10+"
            } else if info.is_hdr.unwrap_or(false) {
                "HDR"
            } else {
                ""
            };
            if !hdr_type.is_empty() {
                new_name = new_name.replace("{hdr}", hdr_type);
            } else {
                // 如果没有HDR信息，移除{hdr}及其可能的方括号和空格
                new_name = new_name.replace(" [{hdr}]", "");
                new_name = new_name.replace("{hdr}", "");
            }
        } else {
            // 没有视频信息时，移除{hdr}
            new_name = new_name.replace(" [{hdr}]", "");
            new_name = new_name.replace("{hdr}", "");
        }
    }

    // {source} - 来源
    if new_name.contains("{source}") {
        if let Some(ref info) = video_info {
            if let Some(ref source) = info.source {
                new_name = new_name.replace("{source}", source);
            } else {
                // 没有来源信息时，移除{source}
                new_name = new_name.replace(" [{source}]", "");
                new_name = new_name.replace("{source}", "");
            }
        } else {
            // 没有视频信息时，移除{source}
            new_name = new_name.replace(" [{source}]", "");
            new_name = new_name.replace("{source}", "");
        }
    }

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

/// 批量执行物理磁盘重命名
pub async fn batch_rename(
    db: &SqlitePool,
    rename_items: Vec<(String, String)>, // (file_id, new_name)
    mut ctx: crate::services::task_queue::TaskContext,
) -> anyhow::Result<()> {
    let total = rename_items.len();

    for (index, (file_id, new_name)) in rename_items.into_iter().enumerate() {
        // 检查暂停/取消
        if ctx.check_pause().await {
            return Err(anyhow::anyhow!("Rename task cancelled"));
        }

        // 执行单个文件重命名
        if let Err(e) = rename_file(db, &file_id, &new_name).await {
            tracing::error!("Failed to rename file {}: {}", file_id, e);
        }

        // 报告进度
        let completed = index + 1;
        let progress = (completed as f64 / total as f64) * 100.0;
        ctx.report_progress(
            progress,
            Some(&format!("Renaming {}/{} files", completed, total)),
        )
        .await;
    }

    Ok(())
}

/// 执行单个文件重命名
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
