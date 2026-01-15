use reqwest::Client;
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// 下载海报或背景图
///
/// # 参数
/// - `url`: 图片 URL
/// - `output_path`: 输出文件路径
///
/// # 用途
/// 用于从 TMDB 等数据源下载媒体海报和背景图
pub async fn download_image(url: &str, output_path: &Path) -> anyhow::Result<()> {
    let client = Client::new();
    let response = client.get(url).send().await?;

    if !response.status().is_success() {
        return Err(anyhow::anyhow!(
            "Failed to download image: {}",
            response.status()
        ));
    }

    let bytes = response.bytes().await?;

    // 确保目录存在
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // 写入文件
    let mut file = fs::File::create(output_path).await?;
    file.write_all(&bytes).await?;
    file.sync_all().await?;

    tracing::info!("Downloaded image to: {:?}", output_path);
    Ok(())
}

/// 为媒体文件下载海报和背景图
///
/// # 参数
/// - `file_path`: 媒体文件路径
/// - `poster_url`: 海报 URL（可选）
/// - `backdrop_url`: 背景图 URL（可选）
///
/// # 返回值
/// 返回下载后的海报和背景图路径
///
/// # 用途
/// 在元数据刮削流程中自动下载并保存图片到媒体文件同目录
pub async fn download_media_images(
    file_path: &str,
    poster_url: Option<&str>,
    backdrop_url: Option<&str>,
) -> anyhow::Result<(Option<PathBuf>, Option<PathBuf>)> {
    let media_path = Path::new(file_path);
    let media_dir = media_path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Invalid file path"))?;
    let media_name = media_path
        .file_stem()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid file name"))?;

    let mut poster_path = None;
    let mut backdrop_path = None;

    // 下载海报
    if let Some(url) = poster_url {
        let path = media_dir.join(format!("{}.poster.jpg", media_name));
        match download_image(url, &path).await {
            Ok(_) => poster_path = Some(path),
            Err(e) => tracing::warn!("Failed to download poster: {}", e),
        }
    }

    // 下载背景图
    if let Some(url) = backdrop_url {
        let path = media_dir.join(format!("{}.backdrop.jpg", media_name));
        match download_image(url, &path).await {
            Ok(_) => backdrop_path = Some(path),
            Err(e) => tracing::warn!("Failed to download backdrop: {}", e),
        }
    }

    Ok((poster_path, backdrop_path))
}
