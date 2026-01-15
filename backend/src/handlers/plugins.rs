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
        (status = 200, description = "获取插件列表成功", body = Vec<PluginInfo>)
    )
)]
pub async fn list_plugins(State(state): State<Arc<AppState>>) -> Json<Vec<PluginInfo>> {
    let plugins = state.plugin_manager.list_plugins().await;
    Json(plugins)
}
