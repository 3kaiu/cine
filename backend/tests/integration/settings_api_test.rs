#[path = "../common/mod.rs"]
mod common;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::util::ServiceExt;

#[tokio::test]
async fn test_settings_health_check_rejects_unsupported_provider() {
    let (router, _app_state, _temp_dir) = common::create_test_router_with_state().await;

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/settings/health-check")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "provider": "unknown"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let message = String::from_utf8(body.to_vec()).unwrap();
    assert!(message.contains("unsupported provider"));
}

#[tokio::test]
async fn test_settings_health_check_validates_required_cloudflare_fields() {
    let (router, _app_state, _temp_dir) = common::create_test_router_with_state().await;

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/settings/health-check")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "provider": "cloudflare_ai",
                        "settings": {
                            "cloudflare_account_id": "cf-account"
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let message = String::from_utf8(body.to_vec()).unwrap();
    assert!(message.contains("cloudflare_api_token is required"));
}

#[tokio::test]
async fn test_settings_health_check_validates_required_tmdb_key() {
    let (router, _app_state, _temp_dir) = common::create_test_router_with_state().await;

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/settings/health-check")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "provider": "tmdb",
                        "settings": {}
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let message = String::from_utf8(body.to_vec()).unwrap();
    assert!(message.contains("tmdb_api_key is required"));
}
