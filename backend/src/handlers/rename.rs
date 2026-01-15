use axum::{extract::State, response::Json};
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
pub struct RenamePreview {
    pub file_id: String,
    pub old_name: String,
    pub new_name: String,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum RenameActionResponse {
    Preview {
        preview: Vec<RenamePreview>,
        message: String,
    },
    Task(crate::handlers::tasks::TaskActionResponse),
}

pub async fn batch_rename(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RenameRequest>,
) -> Result<Json<RenameActionResponse>, (axum::http::StatusCode, String)> {
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
            renamer::generate_new_name(&file, &req.template).map(|new_name| RenamePreview {
                file_id: file.id.clone(),
                old_name: file.name.clone(),
                new_name,
            })
        })
        .collect();

    // 如果只是预览，直接返回
    if preview {
        return Ok(Json(RenameActionResponse::Preview {
            preview: preview_list,
            message: "Preview generated".to_string(),
        }));
    }

    // 执行重命名任务
    let rename_items: Vec<(String, String)> = preview_list
        .iter()
        .map(|p| (p.file_id.clone(), p.new_name.clone()))
        .collect();
    let count = rename_items.len();

    let task_id = state
        .task_queue
        .submit(
            crate::services::task_queue::TaskType::Rename,
            Some(format!("批量重命名 {} 个文件", count)),
            serde_json::json!({
                "rename_items": rename_items
            }),
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(RenameActionResponse::Task(
        crate::handlers::tasks::TaskActionResponse {
            task_id,
            status: "submitted".to_string(),
            message: format!("Rename task submitted for {} files", count),
        },
    )))
}
