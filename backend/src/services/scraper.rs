use crate::config::AppConfig;
use crate::models::{MediaFile, MovieMetadata, TVShowMetadata};
use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::Client;
use serde_json::Value;

// 预编译正则表达式（避免每次调用时重新编译）
static YEAR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(19|20)\d{2}\b").unwrap());

static SEASON_EPISODE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)(?:S|Season|第)(\d+)(?:E|Episode|集)(\d+)").unwrap());

static EP_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)EP?(\d+)").unwrap());

static WHITESPACE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

/// 从文件名提取影视信息（使用预编译正则表达式）
pub fn parse_filename(filename: &str) -> (String, Option<u32>, Option<u32>, Option<u32>) {
    // 移除扩展名
    let name = filename.rsplit('.').skip(1).collect::<Vec<_>>().join(".");

    // 提取年份
    let year = YEAR_RE
        .find(&name)
        .and_then(|m| m.as_str().parse::<u32>().ok());

    // 提取剧集信息：S01E01, S1E1, 第1集, EP01
    let (season, episode) = if let Some(caps) = SEASON_EPISODE_RE.captures(&name) {
        (
            caps.get(1).and_then(|m| m.as_str().parse::<u32>().ok()),
            caps.get(2).and_then(|m| m.as_str().parse::<u32>().ok()),
        )
    } else {
        // 尝试其他格式：EP01, E01
        let episode = EP_RE
            .captures(&name)
            .and_then(|caps| caps.get(1))
            .and_then(|m| m.as_str().parse::<u32>().ok());
        (None, episode)
    };

    // 清理标题（移除年份、集数等信息）
    let mut title = name.clone();
    if let Some(year_match) = YEAR_RE.find(&name) {
        title = title.replace(year_match.as_str(), "").trim().to_string();
    }
    title = SEASON_EPISODE_RE.replace_all(&title, "").to_string();
    title = EP_RE.replace_all(&title, "").to_string();

    // 清理残留的括号和多余空格
    title = title.replace("()", "").replace("[]", "");
    title = WHITESPACE_RE.replace_all(&title, " ").to_string();

    title = title.trim().to_string();

    (title, year, season, episode)
}

/// 从 TMDB 搜索电影（使用共享 HTTP 客户端）
pub async fn search_movie_tmdb(
    client: &Client,
    title: &str,
    year: Option<u32>,
    api_key: &str,
) -> anyhow::Result<Vec<MovieMetadata>> {
    let mut url = format!(
        "https://api.themoviedb.org/3/search/movie?api_key={}&query={}",
        api_key,
        urlencoding::encode(title)
    );

    if let Some(y) = year {
        url.push_str(&format!("&year={}", y));
    }

    let response = client.get(&url).send().await?;
    let json: Value = response.json().await?;

    let results = json
        .get("results")
        .and_then(|r| r.as_array())
        .ok_or_else(|| anyhow::anyhow!("No results in TMDB response"))?;

    let mut movies = Vec::new();
    for result in results {
        let movie = MovieMetadata {
            tmdb_id: result.get("id").and_then(|i| i.as_u64()).map(|i| i as u32),
            title: result
                .get("title")
                .and_then(|t| t.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            original_title: result
                .get("original_title")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string()),
            year: result
                .get("release_date")
                .and_then(|d| d.as_str())
                .and_then(|s| s.split('-').next())
                .and_then(|y| y.parse::<u32>().ok()),
            overview: result
                .get("overview")
                .and_then(|o| o.as_str())
                .map(|s| s.to_string()),
            poster_url: result
                .get("poster_path")
                .and_then(|p| p.as_str())
                .map(|p| format!("https://image.tmdb.org/t/p/w500{}", p)),
            backdrop_url: result
                .get("backdrop_path")
                .and_then(|b| b.as_str())
                .map(|b| format!("https://image.tmdb.org/t/p/w1280{}", b)),
            genres: vec![], // 需要额外API调用获取
            rating: result
                .get("vote_average")
                .and_then(|r| r.as_f64())
                .map(|r| r as f32),
            release_date: result
                .get("release_date")
                .and_then(|d| d.as_str())
                .map(|s| s.to_string()),
        };
        movies.push(movie);
    }

    Ok(movies)
}

/// 从 TMDB 搜索剧集（使用共享 HTTP 客户端）
pub async fn search_tv_tmdb(
    client: &Client,
    title: &str,
    year: Option<u32>,
    api_key: &str,
) -> anyhow::Result<Vec<TVShowMetadata>> {
    let mut url = format!(
        "https://api.themoviedb.org/3/search/tv?api_key={}&query={}",
        api_key,
        urlencoding::encode(title)
    );

    if let Some(y) = year {
        url.push_str(&format!("&first_air_date_year={}", y));
    }

    let response = client.get(&url).send().await?;
    let json: Value = response.json().await?;

    let results = json
        .get("results")
        .and_then(|r| r.as_array())
        .ok_or_else(|| anyhow::anyhow!("No results in TMDB response"))?;

    let mut shows = Vec::new();
    for result in results {
        let show = TVShowMetadata {
            tmdb_id: result.get("id").and_then(|i| i.as_u64()).map(|i| i as u32),
            name: result
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("Unknown")
                .to_string(),
            original_name: result
                .get("original_name")
                .and_then(|n| n.as_str())
                .map(|s| s.to_string()),
            first_air_date: result
                .get("first_air_date")
                .and_then(|d| d.as_str())
                .map(|s| s.to_string()),
            overview: result
                .get("overview")
                .and_then(|o| o.as_str())
                .map(|s| s.to_string()),
            poster_url: result
                .get("poster_path")
                .and_then(|p| p.as_str())
                .map(|p| format!("https://image.tmdb.org/t/p/w500{}", p)),
            backdrop_url: result
                .get("backdrop_path")
                .and_then(|b| b.as_str())
                .map(|b| format!("https://image.tmdb.org/t/p/w1280{}", b)),
            genres: vec![],
            rating: result
                .get("vote_average")
                .and_then(|r| r.as_f64())
                .map(|r| r as f32),
            seasons: vec![], // 需要额外API调用获取
        };
        shows.push(show);
    }

    Ok(shows)
}

/// 执行元数据刮削（使用共享 HTTP 客户端）
pub async fn scrape_metadata(
    client: &Client,
    file: &MediaFile,
    _source: &str,
    auto_match: bool,
    config: &AppConfig,
) -> anyhow::Result<Value> {
    let api_key = config
        .tmdb_api_key
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("TMDB API key not configured"))?;

    // 解析文件名
    let (title, year, season, episode) = parse_filename(&file.name);

    // 判断是电影还是剧集
    let is_tv_show = season.is_some() || episode.is_some();

    if is_tv_show {
        // 搜索剧集
        let shows = search_tv_tmdb(client, &title, year, api_key).await?;

        if shows.is_empty() {
            return Err(anyhow::anyhow!("No TV show found"));
        }

        // 如果自动匹配，选择第一个结果
        let selected = if auto_match && !shows.is_empty() {
            &shows[0]
        } else {
            // 返回所有结果供用户选择
            return Ok(serde_json::to_value(shows)?);
        };

        Ok(serde_json::to_value(selected)?)
    } else {
        // 搜索电影
        let movies = search_movie_tmdb(client, &title, year, api_key).await?;

        if movies.is_empty() {
            return Err(anyhow::anyhow!("No movie found"));
        }

        // 如果自动匹配，选择第一个结果
        let selected = if auto_match && !movies.is_empty() {
            &movies[0]
        } else {
            // 返回所有结果供用户选择
            return Ok(serde_json::to_value(movies)?);
        };

        Ok(serde_json::to_value(selected)?)
    }
}

/// 批量刮削元数据（使用共享 HTTP 客户端）
#[allow(dead_code)]
pub async fn batch_scrape_metadata(
    client: &Client,
    files: &[MediaFile],
    source: &str,
    auto_match: bool,
    config: &AppConfig,
    download_images: bool,
    generate_nfo: bool,
) -> anyhow::Result<Vec<(String, Result<Value, String>)>> {
    let mut results = Vec::new();

    for file in files {
        let result = match scrape_metadata(client, file, source, auto_match, config).await {
            Ok(metadata) => {
                // 如果成功，下载图片和生成 NFO
                if download_images || generate_nfo {
                    let poster_url = metadata.get("poster_url").and_then(|u| u.as_str());
                    let backdrop_url = metadata.get("backdrop_url").and_then(|u| u.as_str());

                    // 下载图片
                    if download_images {
                        if let Err(e) = crate::services::poster::download_media_images(
                            &file.path,
                            poster_url,
                            backdrop_url,
                        )
                        .await
                        {
                            tracing::warn!("Failed to download images for {}: {}", file.path, e);
                        }
                    }

                    // 生成 NFO
                    if generate_nfo {
                        let media_type = if file.name.contains("S") || file.name.contains("E") {
                            "tvshow"
                        } else {
                            "movie"
                        };
                        if let Err(e) = crate::services::nfo::generate_nfo_file(
                            &file.path, &metadata, media_type,
                        )
                        .await
                        {
                            tracing::warn!("Failed to generate NFO for {}: {}", file.path, e);
                        }
                    }
                }

                Ok(metadata)
            }
            Err(e) => Err(e.to_string()),
        };

        results.push((file.id.clone(), result));
    }

    Ok(results)
}
