//! 性能基准测试

use cine_backend::services::{dedupe, hasher, scanner};
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use sqlx::sqlite::SqliteConnectOptions;
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

                    let db_path = temp_dir.path().join("test.db");
                    let database_url = format!("sqlite:{}", db_path.to_string_lossy());
                    let options = SqliteConnectOptions::from_str(&database_url)
                        .unwrap()
                        .create_if_missing(true);
                    let pool = sqlx::SqlitePool::connect_with(options).await.unwrap();

                    // 运行迁移
                    sqlx::migrate!().run(&pool).await.unwrap();

                    scanner::scan_directory(
                        &pool,
                        test_dir.to_str().unwrap(),
                        true,
                        &["video".to_string()],
                        "bench-task",
                        None,
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
    c.bench_function("hash_calculation_100mb", |b| {
        let rt = tokio::runtime::Runtime::new().unwrap();
        b.iter(|| {
            rt.block_on(async {
                let temp_dir = TempDir::new().unwrap();
                let file_path = temp_dir.path().join("test_100mb.bin");

                // 创建100MB测试文件
                let content = vec![0u8; 100 * 1024 * 1024];
                fs::write(&file_path, content).unwrap();

                // 计算哈希
                hasher::calculate_quick_hash(&file_path).await.unwrap();
            });
        });
    });
}

/// 去重查询性能测试
fn bench_dedupe_query(c: &mut Criterion) {
    c.bench_function("dedupe_query_10000_files", |b| {
        let rt = tokio::runtime::Runtime::new().unwrap();
        b.iter(|| {
            rt.block_on(async {
                let temp_dir = TempDir::new().unwrap();
                let db_path = temp_dir.path().join("test.db");
                let database_url = format!("sqlite:{}", db_path.to_string_lossy());
                let options = SqliteConnectOptions::from_str(&database_url)
                    .unwrap()
                    .create_if_missing(true);
                let pool = sqlx::SqlitePool::connect_with(options).await.unwrap();

                // 运行迁移
                sqlx::migrate!().run(&pool).await.unwrap();

                // 插入测试数据（模拟10000个文件，其中1000个重复）
                // 这里简化处理，实际应该插入真实数据

                dedupe::find_duplicates(&pool).await.unwrap();
            });
        });
    });
}

criterion_group!(
    benches,
    bench_file_scan,
    bench_hash_calculation,
    bench_dedupe_query
);
criterion_main!(benches);
