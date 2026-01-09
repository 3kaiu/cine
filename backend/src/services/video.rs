use crate::models::VideoInfo;
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

    let video_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"));

    let audio_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("audio"));

    let format = json.get("format");

    // 提取视频信息
    let duration = format
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok());

    let width = video_stream
        .and_then(|s| s.get("width"))
        .and_then(|w| w.as_u64())
        .map(|w| w as u32);

    let height = video_stream
        .and_then(|s| s.get("height"))
        .and_then(|h| h.as_u64())
        .map(|h| h as u32);

    let codec = video_stream
        .and_then(|s| s.get("codec_name"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string());

    let bitrate = format
        .and_then(|f| f.get("bit_rate"))
        .and_then(|b| b.as_str())
        .and_then(|s| s.parse::<u64>().ok());

    let format_name = format
        .and_then(|f| f.get("format_name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());

    let audio_codec = audio_stream
        .and_then(|s| s.get("codec_name"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string());

    let audio_channels = audio_stream
        .and_then(|s| s.get("channels"))
        .and_then(|c| c.as_u64())
        .map(|c| c as u32);

    Ok(VideoInfo {
        duration,
        width,
        height,
        codec,
        bitrate,
        format: format_name,
        audio_codec,
        audio_channels,
    })
}

/// 生成视频缩略图（用于预览）
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
