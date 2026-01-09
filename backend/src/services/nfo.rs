use quick_xml::de::from_str;
use quick_xml::se::to_string;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use tokio::fs;

/// 生成 NFO 文件（Kodi/Jellyfin 格式）
#[allow(dead_code)]
pub async fn generate_nfo_file(
    file_path: &str,
    metadata: &Value,
    media_type: &str, // movie or tvshow
) -> anyhow::Result<String> {
    let media_path = Path::new(file_path);
    let media_dir = media_path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Invalid file path"))?;
    let media_name = media_path
        .file_stem()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid file name"))?;

    let nfo_path = media_dir.join(format!("{}.nfo", media_name));

    let nfo_content = if media_type == "movie" {
        generate_movie_nfo(metadata)?
    } else {
        generate_tvshow_nfo(metadata)?
    };

    fs::write(&nfo_path, nfo_content).await?;

    tracing::info!("Generated NFO file: {:?}", nfo_path);
    Ok(nfo_path.to_string_lossy().to_string())
}

fn generate_movie_nfo(metadata: &Value) -> anyhow::Result<String> {
    let title = metadata
        .get("title")
        .and_then(|t| t.as_str())
        .unwrap_or("Unknown");
    let year = metadata
        .get("year")
        .and_then(|y| y.as_u64())
        .map(|y| y.to_string())
        .unwrap_or_default();
    let overview = metadata
        .get("overview")
        .and_then(|o| o.as_str())
        .unwrap_or("");
    let rating = metadata
        .get("rating")
        .and_then(|r| r.as_f64())
        .map(|r| r.to_string())
        .unwrap_or_default();
    let tmdb_id = metadata
        .get("tmdb_id")
        .and_then(|id| id.as_u64())
        .map(|id| id.to_string())
        .unwrap_or_default();

    let nfo = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
    <title>{}</title>
    <year>{}</year>
    <plot>{}</plot>
    <rating>{}</rating>
    <tmdbid>{}</tmdbid>
</movie>"#,
        escape_xml(title),
        year,
        escape_xml(overview),
        rating,
        tmdb_id
    );

    Ok(nfo)
}

fn generate_tvshow_nfo(metadata: &Value) -> anyhow::Result<String> {
    let name = metadata
        .get("name")
        .and_then(|n| n.as_str())
        .unwrap_or("Unknown");
    let first_air_date = metadata
        .get("first_air_date")
        .and_then(|d| d.as_str())
        .unwrap_or("");
    let overview = metadata
        .get("overview")
        .and_then(|o| o.as_str())
        .unwrap_or("");
    let rating = metadata
        .get("rating")
        .and_then(|r| r.as_f64())
        .map(|r| r.to_string())
        .unwrap_or_default();
    let tmdb_id = metadata
        .get("tmdb_id")
        .and_then(|id| id.as_u64())
        .map(|id| id.to_string())
        .unwrap_or_default();

    let nfo = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
    <title>{}</title>
    <premiered>{}</premiered>
    <plot>{}</plot>
    <rating>{}</rating>
    <tmdbid>{}</tmdbid>
</tvshow>"#,
        escape_xml(name),
        first_air_date,
        escape_xml(overview),
        rating,
        tmdb_id
    );

    Ok(nfo)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "movie")]
pub struct MovieNfo {
    pub title: Option<String>,
    pub originaltitle: Option<String>,
    pub sorttitle: Option<String>,
    pub rating: Option<f64>,
    pub year: Option<u32>,
    pub plot: Option<String>,
    pub tagline: Option<String>,
    pub runtime: Option<u32>,
    pub thumb: Option<String>,
    pub fanart: Option<String>,
    pub tmdbid: Option<String>,
    pub id: Option<String>,
}

/// 读取并解析 NFO 文件
pub async fn read_nfo_file(path: &str) -> anyhow::Result<MovieNfo> {
    let content = fs::read_to_string(path).await?;
    let nfo: MovieNfo = from_str(&content)?;
    Ok(nfo)
}

/// 更新或创建 NFO 文件
pub async fn save_nfo_file(path: &str, nfo: &MovieNfo) -> anyhow::Result<()> {
    let xml = to_string(nfo)?;
    let header = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#;
    let content = format!("{}\n{}", header, xml);
    fs::write(path, content).await?;
    Ok(())
}

fn escape_xml(s: &str) -> String {
    s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")
}
