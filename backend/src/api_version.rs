//! API 版本控制中间件
//!
//! 支持向后兼容的API版本控制

use axum::{
    extract::Request,
    http::{header, HeaderMap, HeaderValue},
    middleware::Next,
    response::Response,
};
use std::str::FromStr;

/// API版本头
pub const API_VERSION_HEADER: &str = "x-api-version";

/// 支持的API版本
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum ApiVersion {
    V1,
    V2,
    #[default]
    Latest,
}

impl ApiVersion {
    /// 从字符串解析版本
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "1" | "v1" | "1.0" => Some(ApiVersion::V1),
            "2" | "v2" | "2.0" => Some(ApiVersion::V2),
            "latest" => Some(ApiVersion::Latest),
            _ => None,
        }
    }

    /// 转换为字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ApiVersion::V1 => "v1",
            ApiVersion::V2 => "v2",
            ApiVersion::Latest => "latest",
        }
    }
}

impl FromStr for ApiVersion {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse(s).ok_or(())
    }
}

/// API版本上下文
#[derive(Debug, Clone)]
pub struct ApiVersionContext {
    pub version: ApiVersion,
    pub requested_version: Option<String>,
}

impl Default for ApiVersionContext {
    fn default() -> Self {
        Self {
            version: ApiVersion::Latest,
            requested_version: None,
        }
    }
}

/// API版本中间件
pub async fn api_version_middleware(
    headers: HeaderMap,
    mut request: Request,
    next: Next,
) -> Response {
    let version = extract_api_version(&headers);

    let context = ApiVersionContext {
        version,
        requested_version: headers
            .get(API_VERSION_HEADER)
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string()),
    };

    request.extensions_mut().insert(context);

    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::HeaderName::from_static(API_VERSION_HEADER),
        HeaderValue::from_str(version.as_str()).unwrap(),
    );

    response
}

/// 从请求头提取API版本
fn extract_api_version(headers: &HeaderMap) -> ApiVersion {
    // 优先检查自定义版本头
    if let Some(version_header) = headers.get(API_VERSION_HEADER) {
        if let Ok(version_str) = version_header.to_str() {
            if let Some(version) = ApiVersion::parse(version_str) {
                return version;
            }
        }
    }

    // 检查Accept头中的版本信息
    if let Some(accept_header) = headers.get(header::ACCEPT) {
        if let Ok(accept_str) = accept_header.to_str() {
            if accept_str.contains("vnd.cine.") {
                let parts: Vec<&str> = accept_str.split("vnd.cine.").collect();
                if parts.len() > 1 {
                    let version_part = parts[1].split('+').next().unwrap_or("");
                    if let Some(version) = ApiVersion::parse(version_part) {
                        return version;
                    }
                }
            }
        }
    }

    ApiVersion::Latest
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;

    #[test]
    fn test_api_version_parsing() {
        assert_eq!(ApiVersion::parse("v1"), Some(ApiVersion::V1));
        assert_eq!(ApiVersion::parse("v2"), Some(ApiVersion::V2));
        assert_eq!(ApiVersion::parse("latest"), Some(ApiVersion::Latest));
        assert_eq!(ApiVersion::parse("invalid"), None);
    }

    #[test]
    fn test_version_extraction() {
        let mut headers = HeaderMap::new();

        headers.insert(API_VERSION_HEADER, "v2".parse().unwrap());
        assert_eq!(extract_api_version(&headers), ApiVersion::V2);

        headers.clear();
        headers.insert("accept", "application/vnd.cine.v1+json".parse().unwrap());
        assert_eq!(extract_api_version(&headers), ApiVersion::V1);
    }
}
