use axum::{
    extract::State,
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::handlers::AppState;
use crate::services::renamer;

#[derive(Deserialize)]
pub struct RenameRequest {
    pub file_ids: Vec<String>,
    pub template: String, // 例如: "{title}.S{season:02d}E{episode:02d}.{ext}"
    pub preview: Option<bool>,
}

#[derive(Serialize)]
pub struct RenameResponse {
    pub preview: Vec<RenamePreview>,
    pub message: String,
}

#[derive(Serialize)]
pub struct RenamePreview {
    pub file_id: String,
    pub old_name: String,
    pub new_name: String,
}

pub async fn batch_rename(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RenameRequest>,
) -> Result<Json<RenameResponse>, (axum::http::StatusCode, String)> {
    let preview = req.preview.unwrap_or(true);

    // 获取文件列表
    let placeholders = vec!["?"; req.file_ids.len()];
    let query = format!(
        "SELECT * FROM media_files WHERE id IN ({})",
        placeholders.join(",")
    );

    let mut query = sqlx::query_as::<_, crate::models::MediaFile>(&query);
    for file_id in &req.file_ids {
        query = query.bind(file_id);
    }

    let files = query
        .fetch_all(&state.db)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 生成重命名预览
    let preview_list: Vec<RenamePreview> = files
        .iter()
        .filter_map(|file| {
            renamer::generate_new_name(&file, &req.template)
                .map(|new_name| RenamePreview {
                    file_id: file.id.clone(),
                    old_name: file.name.clone(),
                    new_name,
                })
        })
        .collect();

    // 如果只是预览，直接返回
    if preview {
        return Ok(Json(RenameResponse {
            preview: preview_list,
            message: "Preview generated".to_string(),
        }));
    }

    // 执行重命名
    for item in &preview_list {
        if let Err(e) = renamer::rename_file(&state.db, &item.file_id, &item.new_name).await {
            tracing::error!("Failed to rename file {}: {}", item.file_id, e);
        }
    }

    Ok(Json(RenameResponse {
        preview: preview_list,
        message: "Rename completed".to_string(),
    }))
}
