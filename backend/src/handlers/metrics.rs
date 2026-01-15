use crate::services::metrics::{METRICS, REGISTRY};
use axum::{http::StatusCode, response::IntoResponse, response::Json};
use once_cell::sync::Lazy;
use prometheus::{Encoder, TextEncoder};
use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;

static SYSTEM: Lazy<Mutex<System>> = Lazy::new(|| {
    let mut sys = System::new_all();
    sys.refresh_all();
    Mutex::new(sys)
});

#[derive(Serialize)]
pub struct DashboardMetrics {
    pub active_tasks: f64,
    pub total_hashes_bytes: f64,
    pub total_scrapes: f64,
    pub cpu_usage: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub uptime_seconds: u64,
}

pub async fn get_dashboard_metrics() -> Result<Json<DashboardMetrics>, (StatusCode, String)> {
    let mut sys = SYSTEM.lock().map_err(|e| {
        tracing::error!("System metrics lock poisoned: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Lock poisoned".to_string(),
        )
    })?;

    sys.refresh_cpu();
    sys.refresh_memory();

    let cpu_usage = sys.global_cpu_info().cpu_usage();
    let cpu_usage = if cpu_usage.is_finite() {
        cpu_usage
    } else {
        0.0
    };

    let memory_used_bytes = sys.used_memory();
    let memory_total_bytes = sys.total_memory();
    let uptime_seconds = System::uptime();

    Ok(Json(DashboardMetrics {
        active_tasks: METRICS.active_tasks.get(),
        total_hashes_bytes: METRICS.hash_throughput_bytes.get(),
        total_scrapes: METRICS.scrape_requests_total.get(),
        cpu_usage,
        memory_used_bytes,
        memory_total_bytes,
        uptime_seconds,
    }))
}

pub async fn get_metrics() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    let mut buffer = vec![];
    if let Err(e) = encoder.encode(&metric_families, &mut buffer) {
        tracing::error!("Could not encode metrics: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal Server Error".to_string(),
        )
            .into_response();
    }

    match String::from_utf8(buffer) {
        Ok(s) => s.into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal Server Error".to_string(),
        )
            .into_response(),
    }
}
