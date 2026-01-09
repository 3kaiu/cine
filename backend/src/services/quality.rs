use crate::models::VideoInfo;

/// 计算媒体质量得分 (0-100)
/// 算法考虑：分辨率、码率、是否有中文字幕
pub fn calculate_quality_score(info: &VideoInfo) -> i32 {
    let mut score = 0;

    // 1. 分辨率得分 (Max 50)
    if let (Some(w), Some(h)) = (info.width, info.height) {
        if w >= 3840 || h >= 2160 {
            score += 50; // 4K
        } else if w >= 1920 || h >= 1080 {
            score += 35; // 1080p
        } else if w >= 1280 || h >= 720 {
            score += 20; // 720p
        } else {
            score += 10; // SD
        }
    }

    // 2. 码率得分 (Max 20)
    if let Some(bitrate) = info.bitrate {
        let mbps = bitrate as f64 / 1_000_000.0;
        if mbps >= 60.0 {
            // 原盘级别
            score += 20;
        } else if mbps >= 30.0 {
            score += 15;
        } else if mbps >= 15.0 {
            score += 10;
        } else if mbps >= 5.0 {
            score += 5;
        }
    }

    // 3. 动态范围得分 (Max 15)
    if info.is_dolby_vision.unwrap_or(false) {
        score += 15; // DV 最高优先级
    } else if info.is_hdr10_plus.unwrap_or(false) {
        score += 12;
    } else if info.is_hdr.unwrap_or(false) {
        score += 10;
    }

    // 4. 来源质量得分 (Max 10)
    if let Some(ref source) = info.source {
        match source.as_str() {
            "BluRay" => score += 10,
            "iTunes" | "WEB-DL" => score += 7,
            "HDTV" => score += 3,
            _ => {}
        }
    }

    // 5. 字幕得分 (Max 10) - 权重稍微调低，因为画质是核心
    if info.has_chinese_subtitle.unwrap_or(false) {
        score += 10;
    }

    // 6. 音轨得分 (Max 15)
    if let Some(channels) = info.audio_channels {
        if channels >= 8 {
            score += 15; // 7.1 / Atmos
        } else if channels >= 6 {
            score += 10; // 5.1
        } else if channels >= 2 {
            score += 5;
        }
    }

    // 归一化处理（如果有溢出则上限100）
    score.min(100)
}
