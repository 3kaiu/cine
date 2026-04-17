//! 性能基准测试

use cine_backend::services::{dedupe, hasher, scanner};
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use sqlx::sqlite::SqliteConnectOptions;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::str::FromStr;
use tempfile::TempDir;

/// 创建测试文件
fn create_test_files(dir: &Path, count: usize) {
    for i in 0..count {
        let file_path = dir.join(format!("test_file_{}.mp4", i));
        fs::write(&file_path, format!("test content {}", i)).unwrap();
    }
}

async fn create_bench_pool(temp_dir: &TempDir) -> sqlx::SqlitePool {
    let db_path = temp_dir.path().join("test.db");
    let database_url = format!("sqlite:{}", db_path.to_string_lossy());
    let options = SqliteConnectOptions::from_str(&database_url)
        .unwrap()
        .create_if_missing(true);
    let pool = sqlx::SqlitePool::connect_with(options).await.unwrap();
    sqlx::migrate!().run(&pool).await.unwrap();
    pool
}

async fn seed_duplicate_files(
    pool: &sqlx::SqlitePool,
    total_files: usize,
    duplicate_group_size: usize,
) {
    let duplicate_groups = total_files / duplicate_group_size.max(1);
    let now = chrono::Utc::now().to_rfc3339();
    let mut duplicate_titles: HashMap<usize, String> = HashMap::new();

    for group in 0..duplicate_groups {
        duplicate_titles.insert(group, format!("Benchmark Movie {}", group));
    }

    for i in 0..total_files {
        let group = i % duplicate_groups.max(1);
        let hash = format!("dup_hash_{}", group);
        let title = duplicate_titles
            .get(&group)
            .cloned()
            .unwrap_or_else(|| format!("Benchmark Movie {}", group));
        let metadata = serde_json::json!({
            "title": title,
            "tmdb_id": group + 1000,
        })
        .to_string();

        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, hash_md5, tmdb_id, metadata, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(format!("/bench/movie_{group}/file_{i}.mkv"))
        .bind(format!("Benchmark.Movie.{group}.{i}.mkv"))
        .bind(2_000_000_i64 + (group as i64 * 1024))
        .bind("video")
        .bind(hash)
        .bind((group + 1000) as i64)
        .bind(metadata)
        .bind(&now)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
    }
}

async fn seed_similar_files(pool: &sqlx::SqlitePool, total_files: usize) {
    let now = chrono::Utc::now().to_rfc3339();

    for i in 0..total_files {
        let franchise = i / 4;
        let variant = i % 4;
        let name = match variant {
            0 => format!("The.Matrix.{franchise}.1999.1080p.BluRay.mkv"),
            1 => format!("Matrix.{franchise}.1999.4K.REMUX.mkv"),
            2 => format!("The.Matrix.Reloaded.{franchise}.2003.1080p.mkv"),
            _ => format!("Inception.{franchise}.2010.1080p.BluRay.mkv"),
        };

        sqlx::query(
            "INSERT INTO media_files (id, path, name, size, file_type, created_at, updated_at, last_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(format!("/bench/similar/{name}"))
        .bind(name)
        .bind(1_500_000_i64 + franchise as i64)
        .bind("video")
        .bind(&now)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
    }
}

/// 文件扫描性能测试
fn bench_file_scan(c: &mut Criterion) {
    let mut group = c.benchmark_group("file_scan");

    for count in [100, 1000, 5000].iter() {
        group.bench_with_input(BenchmarkId::from_parameter(count), count, |b, &count| {
            let rt = tokio::runtime::Runtime::new().unwrap();
            b.iter(|| {
                rt.block_on(async {
                    let temp_dir = TempDir::new().unwrap();
                    let test_dir = temp_dir.path().join("test_media");
                    fs::create_dir_all(&test_dir).unwrap();
                    create_test_files(&test_dir, count);
                    let pool = create_bench_pool(&temp_dir).await;

                    scanner::scan_directory(
                        &pool,
                        test_dir.to_str().unwrap(),
                        true,
                        &["video".to_string()],
                        cine_backend::services::task_queue::TaskContext::for_test("bench-task"),
                    )
                    .await
                    .unwrap();
                });
            });
        });
    }

    group.finish();
}

/// 哈希计算性能测试
fn bench_hash_calculation(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("quick_hash_100mb", |b| {
        b.iter(|| {
            rt.block_on(async {
                let temp_dir = TempDir::new().unwrap();
                let file_path = temp_dir.path().join("test_100mb.bin");
                let content = vec![0u8; 100 * 1024 * 1024];
                fs::write(&file_path, content).unwrap();
                hasher::calculate_quick_hash(&file_path).await.unwrap();
            });
        });
    });

    c.bench_function("full_hash_100mb", |b| {
        b.iter(|| {
            rt.block_on(async {
                let temp_dir = TempDir::new().unwrap();
                let file_path = temp_dir.path().join("test_100mb.bin");
                let content = vec![1u8; 100 * 1024 * 1024];
                fs::write(&file_path, content).unwrap();
                hasher::calculate_full_hash_benchmark(&file_path)
                    .await
                    .unwrap();
            });
        });
    });
}

/// 去重查询性能测试
fn bench_dedupe_query(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut group = c.benchmark_group("dedupe_query");

    for total_files in [1_000_usize, 10_000].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(total_files),
            total_files,
            |b, &count| {
                b.iter(|| {
                    rt.block_on(async {
                        let temp_dir = TempDir::new().unwrap();
                        let pool = create_bench_pool(&temp_dir).await;
                        seed_duplicate_files(&pool, count, 5).await;
                        dedupe::find_duplicates(&pool).await.unwrap();
                    });
                });
            },
        );
    }

    group.finish();
}

fn bench_similar_files(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut group = c.benchmark_group("similar_files");

    for total_files in [1_000_usize, 5_000].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(total_files),
            total_files,
            |b, &count| {
                b.iter(|| {
                    rt.block_on(async {
                        let temp_dir = TempDir::new().unwrap();
                        let pool = create_bench_pool(&temp_dir).await;
                        seed_similar_files(&pool, count).await;
                        dedupe::find_similar_files(&pool, 0.85).await.unwrap();
                    });
                });
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_file_scan,
    bench_hash_calculation,
    bench_dedupe_query,
    bench_similar_files
);
criterion_main!(benches);
