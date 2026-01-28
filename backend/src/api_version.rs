//! API 版本控制中间件
//!
//! 支持向后兼容的API版本控制
//! 自动路由到对应的版本处理函数

use axum::{
    extract::Request,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::Header;
use axum_extra::typed_header::TypedHeader;
use std::collections::HashMap;
use tower::ServiceBuilder;

/// API版本头
pub const API_VERSION_HEADER: &str = "x-api-version";

/// 支持的API版本
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ApiVersion {
    V1,
    V2,
    Latest,
}

impl ApiVersion {
    /// 从字符串解析版本
    pub fn from_str(s: &str) -> Option<Self> {
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

    /// 获取版本号
    pub fn version_number(&self) -> u32 {
        match self {
            ApiVersion::V1 => 1,
            ApiVersion::V2 => 2,
            ApiVersion::Latest => 2, // 当前最新版本
        }
    }
}

impl Default for ApiVersion {
    fn default() -> Self {
        ApiVersion::Latest
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
    // 从Accept头或自定义头获取版本
    let version = extract_api_version(&headers);

    // 将版本信息添加到请求扩展中
    let context = ApiVersionContext {
        version,
        requested_version: headers
            .get(API_VERSION_HEADER)
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string()),
    };

    request.extensions_mut().insert(context);

    // 添加版本头到响应
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
            if let Some(version) = ApiVersion::from_str(version_str) {
                return version;
            }
        }
    }

    // 检查Accept头中的版本信息
    if let Some(accept_header) = headers.get(header::ACCEPT) {
        if let Ok(accept_str) = accept_header.to_str() {
            // 解析类似 "application/vnd.cine.v1+json" 的格式
            if accept_str.contains("vnd.cine.") {
                let parts: Vec<&str> = accept_str.split("vnd.cine.").collect();
                if parts.len() > 1 {
                    let version_part = parts[1].split('+').next().unwrap_or("");
                    if let Some(version) = ApiVersion::from_str(version_part) {
                        return version;
                    }
                }
            }
        }
    }

    // 检查URL路径中的版本
    // 这个需要由路由器处理，这里只是示例

    // 默认使用最新版本
    ApiVersion::Latest
}

/// 创建版本化路由的辅助函数
pub fn versioned_route<F, T>(path: &str, handler_v1: F, handler_v2: Option<T>) -> axum::Router
where
    F: axum::handler::Handler<(), ()>,
    T: axum::handler::Handler<(), ()>,
{
    axum::Router::new().route(
        path,
        axum::routing::get(move |req: axum::extract::Request| async move {
            let context = req
                .extensions()
                .get::<ApiVersionContext>()
                .cloned()
                .unwrap_or_default();

            match context.version {
                ApiVersion::V1 => handler_v1.call(req, ()).await,
                ApiVersion::V2 | ApiVersion::Latest => {
                    if let Some(handler) = handler_v2 {
                        handler.call(req, ()).await
                    } else {
                        handler_v1.call(req, ()).await
                    }
                }
            }
        }),
    )
}

/// API版本协商器
pub struct ApiVersionNegotiator {
    supported_versions: HashMap<String, ApiVersion>,
    default_version: ApiVersion,
}

impl ApiVersionNegotiator {
    pub fn new() -> Self {
        let mut supported_versions = HashMap::new();
        supported_versions.insert("v1".to_string(), ApiVersion::V1);
        supported_versions.insert("v2".to_string(), ApiVersion::V2);
        supported_versions.insert("latest".to_string(), ApiVersion::Latest);

        Self {
            supported_versions,
            default_version: ApiVersion::Latest,
        }
    }

    /// 协商API版本
    pub fn negotiate(&self, requested: Option<&str>) -> ApiVersion {
        if let Some(version_str) = requested {
            if let Some(version) = self.supported_versions.get(version_str) {
                return *version;
            }
        }
        self.default_version
    }

    /// 获取支持的版本列表
    pub fn supported_versions(&self) -> Vec<String> {
        self.supported_versions.keys().cloned().collect()
    }
}

impl Default for ApiVersionNegotiator {
    fn default() -> Self {
        Self::new()
    }
}

/// API版本错误响应
#[derive(Debug)]
pub enum ApiVersionError {
    UnsupportedVersion(String),
    InvalidVersionFormat(String),
}

impl IntoResponse for ApiVersionError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiVersionError::UnsupportedVersion(version) => (
                StatusCode::BAD_REQUEST,
                format!("Unsupported API version: {}", version),
            ),
            ApiVersionError::InvalidVersionFormat(format) => (
                StatusCode::BAD_REQUEST,
                format!("Invalid API version format: {}", format),
            ),
        };

        let body = serde_json::json!({
            "error": message,
            "supported_versions": ["v1", "v2", "latest"],
        });

        (status, axum::Json(body)).into_response()
    }
}

/// 版本兼容性检查装饰器
pub fn with_version_compatibility<F, Fut>(handler: F) -> impl Fn(Request) -> Fut
where
    F: Fn(Request, ApiVersion) -> Fut,
    Fut: std::future::Future<Output = Response> + Send,
{
    move |req: Request| {
        let version = req
            .extensions()
            .get::<ApiVersionContext>()
            .map(|ctx| ctx.version)
            .unwrap_or_default();

        handler(req, version)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;

    #[test]
    fn test_api_version_parsing() {
        assert_eq!(ApiVersion::from_str("v1"), Some(ApiVersion::V1));
        assert_eq!(ApiVersion::from_str("v2"), Some(ApiVersion::V2));
        assert_eq!(ApiVersion::from_str("latest"), Some(ApiVersion::Latest));
        assert_eq!(ApiVersion::from_str("invalid"), None);
    }

    #[test]
    fn test_version_extraction() {
        let mut headers = HeaderMap::new();

        // 测试自定义头
        headers.insert(API_VERSION_HEADER, "v2".parse().unwrap());
        assert_eq!(extract_api_version(&headers), ApiVersion::V2);

        // 测试Accept头
        headers.clear();
        headers.insert("accept", "application/vnd.cine.v1+json".parse().unwrap());
        assert_eq!(extract_api_version(&headers), ApiVersion::V1);
    }

    #[test]
    fn test_version_negotiator() {
        let negotiator = ApiVersionNegotiator::new();

        assert_eq!(negotiator.negotiate(Some("v1")), ApiVersion::V1);
        assert_eq!(negotiator.negotiate(Some("v2")), ApiVersion::V2);
        assert_eq!(negotiator.negotiate(Some("invalid")), ApiVersion::Latest);
        assert_eq!(negotiator.negotiate(None), ApiVersion::Latest);
    }
}
