use std::{path::{Path, PathBuf}, sync::Arc};

use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    body::Body,
    extract::{State, WebSocketUpgrade},
    http::{Request, StatusCode, Uri},
    response::IntoResponse,
    routing::{delete, get, post},
    Extension, Router,
};
use tower::ServiceExt;
use tower_http::{compression::CompressionLayer, cors::CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use utoipa::OpenApi;

use crate::graphql::CineSchema;
use crate::handlers;
use crate::handlers::AppState;
use crate::openapi;

async fn graphql_handler(
    Extension(schema): Extension<CineSchema>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(req.into_inner()).await.into()
}

fn frontend_root() -> Option<PathBuf> {
    let app_home = std::env::var("APP_HOME").ok().map(PathBuf::from);

    let candidates = [
        std::env::var("CINE_FRONTEND_DIST").ok().map(PathBuf::from),
        app_home.as_ref().map(|app_home| app_home.join("frontend")),
        Some(PathBuf::from("./frontend/dist")),
        Some(PathBuf::from("./app/frontend")),
        Some(PathBuf::from("../frontend/dist")),
    ];

    candidates
        .into_iter()
        .flatten()
        .find(|path| path.join("index.html").is_file())
}

fn frontend_service(root: &Path) -> ServeDir<ServeFile> {
    ServeDir::new(root).not_found_service(ServeFile::new(root.join("index.html")))
}

async fn frontend_handler(uri: Uri) -> impl IntoResponse {
    const RESERVED_PREFIXES: [&str; 6] =
        ["/api", "/graphql", "/metrics", "/ws", "/swagger-ui", "/api-docs"];

    if RESERVED_PREFIXES
        .iter()
        .any(|prefix| uri.path().starts_with(prefix))
    {
        return (StatusCode::NOT_FOUND, "Not Found").into_response();
    }

    let Some(frontend_root) = frontend_root() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "Frontend assets are not available",
        )
            .into_response();
    };

    let service = frontend_service(&frontend_root);
    match service
        .oneshot(
            Request::builder()
                .uri(uri)
                .body(Body::empty())
                .expect("failed to build frontend asset request"),
        )
        .await
    {
        Ok(response) => response.into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to serve frontend").into_response(),
    }
}

pub fn build_app_router(
    app_state: Arc<AppState>,
    graphql_schema: CineSchema,
    cors: CorsLayer,
    compression: CompressionLayer,
) -> Router {
    let monitoring_routes = Router::new()
        .route(
            "/api/monitoring/trends",
            get(handlers::performance_monitor::get_performance_trends),
        )
        .route(
            "/api/monitoring/resources",
            get(handlers::performance_monitor::get_resource_history),
        )
        .route(
            "/api/monitoring/anomalies",
            get(handlers::performance_monitor::get_performance_anomalies),
        )
        .route(
            "/api/monitoring/health",
            get(handlers::performance_monitor::get_system_health),
        )
        .route(
            "/api/monitoring/metrics",
            get(handlers::performance_monitor::get_detailed_metrics),
        );

    let api_routes = Router::new()
        .route("/api/health", get(handlers::health_check))
        .route(
            "/api/metrics",
            get(handlers::metrics::get_dashboard_metrics),
        )
        .route("/metrics", get(handlers::metrics::get_metrics))
        .merge(monitoring_routes)
        .route("/api/scan", post(handlers::scan::scan_directory))
        .route("/api/files", get(handlers::scan::list_files))
        .route("/api/files/:id/info", get(handlers::video::get_video_info))
        .route(
            "/api/files/:id/subtitles",
            get(handlers::subtitle::find_subtitles),
        )
        .route(
            "/api/files/:id/subtitles/search",
            get(handlers::subtitle::search_remote_subtitles),
        )
        .route(
            "/api/files/:id/subtitles/download",
            post(handlers::subtitle::download_remote_subtitle),
        )
        .route("/api/scrape", post(handlers::scrape::scrape_metadata))
        .route(
            "/api/scrape/batch",
            post(handlers::scrape::batch_scrape_metadata),
        )
        .route("/api/rename", post(handlers::rename::batch_rename))
        .route("/api/dedupe", post(handlers::dedupe::find_duplicates))
        .route(
            "/api/dedupe/movies",
            get(handlers::dedupe::find_duplicate_movies),
        )
        .route(
            "/api/dedupe/similar",
            get(handlers::dedupe::find_similar_files),
        )
        .route(
            "/api/dedupe/similar/task",
            post(handlers::dedupe::start_similar_files_task),
        )
        .route("/api/empty-dirs", get(handlers::dedupe::find_empty_dirs))
        .route(
            "/api/empty-dirs/delete",
            post(handlers::dedupe::delete_empty_dirs),
        )
        .route("/api/large-files", get(handlers::dedupe::find_large_files))
        .route("/api/files/:id/move", post(handlers::file_ops::move_file))
        .route("/api/files/:id/copy", post(handlers::file_ops::copy_file))
        .route(
            "/api/files/batch-move",
            post(handlers::file_ops::batch_move_files),
        )
        .route(
            "/api/files/batch-copy",
            post(handlers::file_ops::batch_copy_files),
        )
        .route("/api/trash", get(handlers::trash::list_trash))
        .route("/api/trash/:id", post(handlers::trash::move_to_trash))
        .route(
            "/api/trash/:id/restore",
            post(handlers::trash::restore_from_trash),
        )
        .route(
            "/api/trash/:id/delete",
            delete(handlers::trash::permanently_delete),
        )
        .route("/api/trash/cleanup", post(handlers::trash::cleanup_trash))
        .route("/api/logs", get(handlers::log::list_operation_logs))
        .route("/api/logs/:id/undo", post(handlers::log::undo_operation))
        .route("/api/history", get(handlers::history::list_scan_history))
        .route(
            "/api/watch-folders",
            get(handlers::watcher::list_watch_folders).post(handlers::watcher::add_watch_folder),
        )
        .route(
            "/api/watch-folders/:id",
            delete(handlers::watcher::delete_watch_folder),
        )
        .route(
            "/api/files/:id/nfo",
            get(handlers::nfo::get_nfo).put(handlers::nfo::update_nfo),
        )
        .route(
            "/api/settings",
            get(handlers::settings::get_settings).post(handlers::settings::update_settings),
        )
        .route("/api/plugins", get(handlers::plugins::list_plugins))
        .route(
            "/api/queue/stats",
            get(handlers::queue_stats::get_queue_stats),
        )
        .route(
            "/api/queue/history",
            get(handlers::queue_stats::get_execution_history),
        )
        .nest("/api/tasks", handlers::tasks::task_routes());

    let ws_routes = Router::new()
        .route(
            "/ws",
            get(
                |ws: WebSocketUpgrade, state: State<Arc<AppState>>| async move {
                    crate::websocket::ws_handler(ws, state).await
                },
            ),
        )
        .route(
            "/api/ws/worker",
            get(
                |ws: WebSocketUpgrade, state: State<Arc<AppState>>| async move {
                    ws.on_upgrade(|socket| async move {
                        state.distributed.handle_worker_socket(socket).await
                    })
                },
            ),
        );

    let swagger = utoipa_swagger_ui::SwaggerUi::new("/swagger-ui")
        .url("/api-docs/openapi.json", openapi::ApiDoc::openapi());

    if let Some(frontend_root) = frontend_root() {
        tracing::info!("Serving frontend assets from {}", frontend_root.display());
    } else {
        tracing::warn!("Frontend assets were not found; UI routes will be unavailable");
    }

    Router::new()
        .route("/graphql", post(graphql_handler))
        .layer(Extension(graphql_schema))
        .merge(api_routes)
        .merge(ws_routes)
        .merge(swagger)
        .fallback(get(frontend_handler))
        .layer(cors)
        .layer(compression)
        .layer(axum::middleware::from_fn(
            crate::api_version::api_version_middleware,
        ))
        .with_state(app_state)
}
