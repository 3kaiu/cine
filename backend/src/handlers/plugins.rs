use crate::handlers::AppState;
use crate::services::plugin::PluginInfo;
use axum::{extract::State, response::Json};
use std::sync::Arc;

/// 列出所有加载的插件
#[utoipa::path(
    get,
    path = "/api/plugins",
    tag = "system",
    responses(
        (status = 200, description = "获取插件列表成功", body = Vec<PluginInfo>),
        (status = 501, description = "当前构建未包含插件系统")
    )
)]
pub async fn list_plugins(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<PluginInfo>>, (axum::http::StatusCode, String)> {
    if !crate::services::plugin::PluginManager::is_compiled() {
        return Err((
            axum::http::StatusCode::NOT_IMPLEMENTED,
            "Plugin support is not compiled into this image".to_string(),
        ));
    }

    let plugins = state.plugin_manager.list_plugins().await;
    Ok(Json(plugins))
}
