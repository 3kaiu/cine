use cine_backend::services::hasher;
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use std::fs::File;
use std::io::Write;
use tempfile::TempDir;

fn create_test_file(size_mb: usize) -> (TempDir, std::path::PathBuf) {
    let temp_dir = tempfile::tempdir().unwrap();
    let file_path = temp_dir.path().join("test_file.bin");
    let mut file = File::create(&file_path).unwrap();

    let chunk = vec![0u8; 1024 * 1024];
    for i in 0..size_mb {
        let fill = (i % 251) as u8;
        let mut block = chunk.clone();
        block.fill(fill);
        file.write_all(&block).unwrap();
    }
    file.sync_all().unwrap();

    (temp_dir, file_path)
}

fn bench_quick_hash(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut group = c.benchmark_group("quick_hash");

    for size in [100_usize, 512].iter() {
        let (_temp_dir, file_path) = create_test_file(*size);
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{size}MB")),
            size,
            |b, _| {
                b.iter(|| {
                    rt.block_on(async {
                        hasher::calculate_quick_hash(&file_path).await.unwrap();
                    });
                });
            },
        );
    }

    group.finish();
}

fn bench_full_hash(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let mut group = c.benchmark_group("full_hash");

    for size in [10_usize, 100].iter() {
        let (_temp_dir, file_path) = create_test_file(*size);
        group.bench_with_input(
            BenchmarkId::from_parameter(format!("{size}MB")),
            size,
            |b, _| {
                b.iter(|| {
                    rt.block_on(async {
                        hasher::calculate_full_hash_benchmark(&file_path)
                            .await
                            .unwrap();
                    });
                });
            },
        );
    }

    group.finish();
}

criterion_group!(benches, bench_quick_hash, bench_full_hash);
criterion_main!(benches);
