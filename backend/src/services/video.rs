use crate::models::{AudioStreamInfo, SubtitleStreamInfo, VideoInfo};
use serde_json::Value;
use std::process::Command;

/// 使用 ffprobe 提取视频信息（不加载整个文件）
pub async fn extract_video_info(file_path: &str) -> anyhow::Result<VideoInfo> {
    // 检查 ffprobe 是否可用
    let ffprobe_output = Command::new("ffprobe")
        .args(&[
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            file_path,
        ])
        .output()?;

    if !ffprobe_output.status.success() {
        return Err(anyhow::anyhow!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&ffprobe_output.stderr)
        ));
    }

    let json: Value = serde_json::from_slice(&ffprobe_output.stdout)?;

    // 解析视频流信息
    let streams = json
        .get("streams")
        .and_then(|s| s.as_array())
        .ok_or_else(|| anyhow::anyhow!("No streams found"))?;

    let format_node = json.get("format");

    // 提取基本信息
    let duration = format_node
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok());

    let bitrate = format_node
        .and_then(|f| f.get("bit_rate"))
        .and_then(|b| b.as_str())
        .and_then(|s| s.parse::<u64>().ok());

    let format_name = format_node
        .and_then(|f| f.get("format_name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());

    let mut video_info = VideoInfo {
        duration,
        width: None,
        height: None,
        codec: None,
        bitrate,
        format: format_name,
        audio_codec: None,
        audio_channels: None,
        is_hdr: Some(false),
        is_dolby_vision: Some(false),
        is_hdr10_plus: Some(false),
        source: detect_source(file_path),
        has_chinese_subtitle: Some(false),
        audio_streams: Vec::new(),
        subtitle_streams: Vec::new(),
    };

    // 解析流
    for s in streams {
        let codec_type = s.get("codec_type").and_then(|c| c.as_str()).unwrap_or("");
        let codec_name = s
            .get("codec_name")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        match codec_type {
            "video" => {
                video_info.width = s.get("width").and_then(|w| w.as_u64()).map(|w| w as u32);
                video_info.height = s.get("height").and_then(|h| h.as_u64()).map(|h| h as u32);
                video_info.codec = Some(codec_name);

                // HDR / DV / HDR10+ Detection
                let color_transfer = s
                    .get("color_transfer")
                    .and_then(|c| c.as_str())
                    .unwrap_or("");

                if color_transfer == "smpte2084" || color_transfer == "arib-std-b67" {
                    video_info.is_hdr = Some(true);
                }

                // Dolby Vision Detection (look for 'dv' in side data or tags)
                if let Some(side_data) = s.get("side_data_list").and_then(|l| l.as_array()) {
                    for sd in side_data {
                        if let Some(sd_type) = sd.get("side_data_type").and_then(|t| t.as_str()) {
                            if sd_type.contains("Dolby Vision") {
                                video_info.is_dolby_vision = Some(true);
                                video_info.is_hdr = Some(true);
                            }
                        }
                    }
                }

                // Basic HDR10+ check (often indicated in tags or side data too)
                if let Some(tags) = s.get("tags") {
                    if let Some(title) = tags.get("title").and_then(|t| t.as_str()) {
                        let title_low = title.to_lowercase();
                        if title_low.contains("hdr10+") {
                            video_info.is_hdr10_plus = Some(true);
                        }
                    }
                }

                // Filename based detection as fallback
                let path_low = file_path.to_lowercase();
                if path_low.contains("dv") || path_low.contains("dolby vision") {
                    video_info.is_dolby_vision = Some(true);
                }
                if path_low.contains("hdr10+") {
                    video_info.is_hdr10_plus = Some(true);
                }
            }
            "audio" => {
                let channels = s.get("channels").and_then(|c| c.as_u64()).unwrap_or(2) as u32;
                let tags = s.get("tags");
                let language = tags
                    .and_then(|t| t.get("language"))
                    .and_then(|l| l.as_str())
                    .map(|s| s.to_string());
                let title = tags
                    .and_then(|t| t.get("title"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string());

                if video_info.audio_codec.is_none() {
                    video_info.audio_codec = Some(codec_name.clone());
                    video_info.audio_channels = Some(channels);
                }

                video_info.audio_streams.push(AudioStreamInfo {
                    codec: codec_name,
                    channels,
                    language,
                    title,
                });
            }
            "subtitle" => {
                let tags = s.get("tags");
                let language = tags
                    .and_then(|t| t.get("language"))
                    .and_then(|l| l.as_str())
                    .map(|s| s.to_string());
                let title = tags
                    .and_then(|t| t.get("title"))
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string());

                // 中文字幕检测
                let is_chinese = |s: &str| {
                    let s = s.to_lowercase();
                    s.contains("chi")
                        || s.contains("zho")
                        || s.contains("chinese")
                        || s.contains("中文")
                        || s.contains("简体")
                        || s.contains("繁体")
                };

                if let Some(ref l) = language {
                    if is_chinese(l) {
                        video_info.has_chinese_subtitle = Some(true);
                    }
                }
                if let Some(ref t) = title {
                    if is_chinese(t) {
                        video_info.has_chinese_subtitle = Some(true);
                    }
                }

                video_info.subtitle_streams.push(SubtitleStreamInfo {
                    codec: codec_name,
                    language,
                    title,
                    is_external: false,
                });
            }
            _ => {}
        }
    }

    Ok(video_info)
}

/// 生成视频缩略图（用于预览）
///
/// # 参数
/// - `file_path`: 视频文件路径
/// - `output_path`: 缩略图输出路径
/// - `time_offset`: 截取时间点（秒，默认第10秒）
///
/// # 用途
/// 用于生成视频预览图，增强用户界面体验
#[allow(dead_code)]
pub async fn generate_thumbnail(
    file_path: &str,
    output_path: &str,
    time_offset: Option<f64>, // 秒
) -> anyhow::Result<()> {
    let offset = time_offset.unwrap_or(10.0); // 默认第10秒

    let output = Command::new("ffmpeg")
        .args(&[
            "-i",
            file_path,
            "-ss",
            &offset.to_string(),
            "-vframes",
            "1",
            "-vf",
            "scale=320:-1",
            "-y", // 覆盖输出文件
            output_path,
        ])
        .output()?;

    if !output.status.success() {
        return Err(anyhow::anyhow!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// 基于文件名探测视频来源
fn detect_source(path: &str) -> Option<String> {
    let p = path.to_lowercase();
    if p.contains("web-dl") || p.contains("webdl") {
        Some("WEB-DL".to_string())
    } else if p.contains("itunes") || p.contains(" it ") {
        Some("iTunes".to_string())
    } else if p.contains("bluray") || p.contains("bdrip") {
        Some("BluRay".to_string())
    } else if p.contains("hdtv") {
        Some("HDTV".to_string())
    } else if p.contains("dvdrip") {
        Some("DVDRip".to_string())
    } else {
        None
    }
}
