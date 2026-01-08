use std::path::{Path, PathBuf};
use regex::Regex;
use walkdir::WalkDir;

/// 字幕文件信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct SubtitleInfo {
    pub path: String,
    pub language: String,
    pub format: String, // srt, ass, vtt
    pub size: u64,
}

/// 查找匹配的字幕文件
pub fn find_matching_subtitles(
    video_path: &str,
    subtitle_dir: Option<&str>,
) -> anyhow::Result<Vec<SubtitleInfo>> {
    let video_path = Path::new(video_path);
    let video_name = video_path.file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    // 如果没有指定字幕目录，使用视频文件同目录
    let search_dir = if let Some(dir) = subtitle_dir {
        Path::new(dir)
    } else {
        video_path.parent().unwrap_or(Path::new("."))
    };

    if !search_dir.exists() {
        return Ok(vec![]);
    }

    let mut subtitles = Vec::new();
    let subtitle_exts = ["srt", "ass", "ssa", "vtt", "sub"];

    // 遍历目录查找字幕文件
    for entry in WalkDir::new(search_dir).max_depth(2) {
        let entry = entry?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !subtitle_exts.contains(&ext.as_str()) {
            continue;
        }

        let file_name = path.file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        // 检查文件名是否匹配（支持多种命名格式）
        if is_subtitle_match(video_name, &file_name) {
            let metadata = std::fs::metadata(path)?;
            let language = detect_language(&file_name, &path.to_string_lossy());

            subtitles.push(SubtitleInfo {
                path: path.to_string_lossy().to_string(),
                language,
                format: ext,
                size: metadata.len(),
            });
        }
    }

    // 按语言和格式排序
    subtitles.sort_by(|a, b| {
        a.language.cmp(&b.language)
            .then_with(|| a.format.cmp(&b.format))
    });

    Ok(subtitles)
}

/// 检查字幕文件名是否与视频文件匹配
fn is_subtitle_match(video_name: &str, subtitle_name: &str) -> bool {
    let video_name_lower = video_name.to_lowercase();
    let subtitle_name_lower = subtitle_name.to_lowercase();

    // 完全匹配
    if video_name_lower == subtitle_name_lower {
        return true;
    }

    // 移除常见后缀后匹配
    let video_clean = clean_filename(&video_name_lower);
    let subtitle_clean = clean_filename(&subtitle_name_lower);

    if video_clean == subtitle_clean {
        return true;
    }

    // 检查是否包含视频文件名的主要部分
    let video_parts: Vec<&str> = video_clean.split(&['.', '-', '_', ' '][..]).collect();
    let subtitle_parts: Vec<&str> = subtitle_clean.split(&['.', '-', '_', ' '][..]).collect();

    // 如果字幕文件名包含视频文件名的主要部分
    if video_parts.len() >= 2 {
        let main_part = video_parts[0];
        if subtitle_parts.iter().any(|&part| part == main_part && part.len() > 3) {
            return true;
        }
    }

    false
}

/// 清理文件名（移除常见后缀）
fn clean_filename(name: &str) -> String {
    let re = Regex::new(r"\.(1080p|720p|480p|4k|bluray|webrip|dvdrip|x264|x265|hevc|h264|aac|ac3|dts|mp3|flac)").unwrap();
    re.replace_all(name, "").to_string()
}

/// 检测字幕语言
fn detect_language(filename: &str, path: &str) -> String {
    let lower = filename.to_lowercase() + " " + &path.to_lowercase();

    // 常见语言标识
    let languages = vec![
        ("chinese", "zh", vec!["chinese", "chs", "cht", "zh", "cn", "简体", "繁体", "中文"]),
        ("english", "en", vec!["english", "eng", "en"]),
        ("japanese", "ja", vec!["japanese", "jpn", "ja"]),
        ("korean", "ko", vec!["korean", "kor", "ko"]),
        ("spanish", "es", vec!["spanish", "spa", "es"]),
        ("french", "fr", vec!["french", "fre", "fra", "fr"]),
        ("german", "de", vec!["german", "ger", "de"]),
    ];

    for (name, code, keywords) in languages {
        for keyword in keywords {
            if lower.contains(keyword) {
                return format!("{} ({})", name, code);
            }
        }
    }

    "未知".to_string()
}

/// 下载字幕（从字幕库等）
pub async fn download_subtitle(
    _video_path: &str,
    _language: &str,
    _output_path: &Path,
) -> anyhow::Result<()> {
    // TODO: 实现字幕下载功能
    // 可以集成 opensubtitles.org API 或其他字幕库
    Err(anyhow::anyhow!("字幕下载功能待实现"))
}
