//! 工具函数模块

pub mod logging;

/// 格式化文件大小为人类可读格式
///
/// # 示例
/// ```
/// let size = format_size(1536);
/// assert_eq!(size, "1.50 KB");
/// ```
#[allow(dead_code)]
pub fn format_size(bytes: i64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    format!("{:.2} {}", size, UNITS[unit_index])
}

/// 格式化时长为人类可读格式
///
/// # 示例
/// ```
/// let duration = format_duration(3665.0);
/// assert_eq!(duration, "1:01:05");
/// ```
#[allow(dead_code)]
pub fn format_duration(seconds: f64) -> String {
    let hours = (seconds / 3600.0) as u32;
    let minutes = ((seconds % 3600.0) / 60.0) as u32;
    let secs = (seconds % 60.0) as u32;

    if hours > 0 {
        format!("{}:{:02}:{:02}", hours, minutes, secs)
    } else {
        format!("{}:{:02}", minutes, secs)
    }
}
