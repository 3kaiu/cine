use once_cell::sync::Lazy;
use prometheus::{Counter, Gauge, Histogram, HistogramOpts, Opts, Registry};

pub struct Metrics {
    pub scan_duration_seconds: Histogram,
    pub hash_throughput_bytes: Counter,
    pub scrape_requests_total: Counter,
    pub active_tasks: Gauge,
    pub db_query_duration: Histogram,
}

pub static REGISTRY: Lazy<Registry> = Lazy::new(|| Registry::new());

pub static METRICS: Lazy<Metrics> = Lazy::new(|| {
    let scan_duration_seconds = Histogram::with_opts(
        HistogramOpts::new("cine_scan_duration_seconds", "Duration of directory scans")
            .buckets(vec![0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 300.0]),
    )
    .unwrap();

    let hash_throughput_bytes = Counter::with_opts(Opts::new(
        "cine_hash_throughput_bytes",
        "Total bytes hashed",
    ))
    .unwrap();

    let scrape_requests_total = Counter::with_opts(Opts::new(
        "cine_scrape_requests_total",
        "Total TMDB scrape requests",
    ))
    .unwrap();

    let active_tasks = Gauge::with_opts(Opts::new(
        "cine_active_tasks_total",
        "Number of currently active tasks",
    ))
    .unwrap();

    let db_query_duration = Histogram::with_opts(
        HistogramOpts::new(
            "cine_db_query_duration_seconds",
            "Duration of database queries",
        )
        .buckets(vec![0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1.0]),
    )
    .unwrap();

    REGISTRY
        .register(Box::new(scan_duration_seconds.clone()))
        .unwrap();
    REGISTRY
        .register(Box::new(hash_throughput_bytes.clone()))
        .unwrap();
    REGISTRY
        .register(Box::new(scrape_requests_total.clone()))
        .unwrap();
    REGISTRY.register(Box::new(active_tasks.clone())).unwrap();
    REGISTRY
        .register(Box::new(db_query_duration.clone()))
        .unwrap();

    Metrics {
        scan_duration_seconds,
        hash_throughput_bytes,
        scrape_requests_total,
        active_tasks,
        db_query_duration,
    }
});
