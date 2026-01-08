use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::fs::File;
use std::io::Write;
use tempfile::TempDir;

fn create_test_file(size_mb: usize) -> (TempDir, std::path::PathBuf) {
    let temp_dir = tempfile::tempdir().unwrap();
    let file_path = temp_dir.path().join("test_file.bin");
    let mut file = File::create(&file_path).unwrap();
    
    let chunk = vec![0u8; 1024 * 1024]; // 1MB chunk
    for _ in 0..size_mb {
        file.write_all(&chunk).unwrap();
    }
    
    (temp_dir, file_path)
}

fn bench_hash_calculation(c: &mut Criterion) {
    let mut group = c.benchmark_group("hash_calculation");
    
    // 测试不同大小的文件
    for size in [1, 10, 100].iter() {
        let (_temp_dir, file_path) = create_test_file(*size);
        
        group.bench_function(format!("{}MB file", size), |b| {
            b.iter(|| {
                // 这里应该调用实际的哈希计算函数
                // 为了示例，这里只是占位
                black_box(file_path.exists());
            });
        });
    }
    
    group.finish();
}

criterion_group!(benches, bench_hash_calculation);
criterion_main!(benches);
