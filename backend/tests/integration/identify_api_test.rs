//! Identify API 集成测试

#[path = "../common/mod.rs"]
mod common;

use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use tower::util::ServiceExt;

async fn insert_test_file(pool: &sqlx::SqlitePool, file_id: &str, name: &str, path: &str) {
    sqlx::query(
        "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(file_id)
    .bind(path)
    .bind(name)
    .bind(1024_i64)
    .bind("video")
    .bind(chrono::Utc::now())
    .bind(chrono::Utc::now())
    .bind(chrono::Utc::now())
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn test_identify_preview_handles_empty_title_without_network() {
    let (router, app_state, _temp_dir) = common::create_test_router_with_state().await;
    let pool = &app_state.db;

    insert_test_file(pool, "file-preview-empty", ".mkv", "/tmp/.mkv").await;

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/identify/preview")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "file_id": "file-preview-empty",
                        "allow_ai": false
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let result = &payload["results"][0];

    assert_eq!(result["file_id"], "file-preview-empty");
    assert_eq!(result["parse"]["title"], "");
    assert_eq!(result["parse"]["parser_provider"], "rules");
    assert!(result["candidates"].as_array().unwrap().is_empty());
    assert!(result["recommended"].is_null());
    assert_eq!(result["needs_review"], true);
}

#[tokio::test]
async fn test_identify_preview_batch_creates_scrape_task_with_identify_operation() {
    let (router, app_state, _temp_dir) = common::create_test_router_with_state().await;
    let pool = &app_state.db;
    insert_test_file(pool, "file-a", ".mkv", "/tmp/a.mkv").await;
    insert_test_file(pool, "file-b", ".mkv", "/tmp/b.mkv").await;

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/identify/preview/batch")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "file_ids": ["file-a", "file-b"],
                        "allow_ai": false
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let task_id = payload["task_id"].as_str().unwrap();

    let task = common::wait_for_task_terminal_state(pool, task_id).await;
    let task_payload: Value = serde_json::from_str(task.payload.as_deref().unwrap()).unwrap();
    let task_result: Value = serde_json::from_str(task.result.as_deref().unwrap()).unwrap();

    assert_eq!(task.task_type, "scrape");
    assert_eq!(task.status, "completed");
    assert_eq!(task_payload["operation"], "identify_preview");
    assert_eq!(task_payload["allow_ai"], false);
    assert_eq!(task_payload["file_ids"].as_array().unwrap().len(), 2);
    assert_eq!(task_result["results"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn test_identify_apply_batch_creates_scrape_task_with_selection_payload() {
    let (router, app_state, _temp_dir) = common::create_test_router_with_state().await;
    let pool = &app_state.db;

    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/identify/apply/batch")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "selections": [{
                            "file_id": "file-apply-1",
                            "provider": "tmdb",
                            "external_id": "438631",
                            "media_type": "movie",
                            "lock_match": true,
                            "download_images": false,
                            "generate_nfo": false
                        }]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let task_id = payload["task_id"].as_str().unwrap();

    let task = common::wait_for_task_terminal_state(pool, task_id).await;
    let task_payload: Value = serde_json::from_str(task.payload.as_deref().unwrap()).unwrap();

    assert_eq!(task.task_type, "scrape");
    assert_eq!(task.status, "failed");
    assert_eq!(task_payload["operation"], "identify_apply");
    assert_eq!(task_payload["selections"][0]["provider"], "tmdb");
    assert_eq!(task_payload["selections"][0]["external_id"], "438631");
    assert_eq!(task_payload["selections"][0]["lock_match"], true);
}
