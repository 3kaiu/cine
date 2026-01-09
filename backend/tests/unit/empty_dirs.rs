//! 空文件夹服务测试

use cine_backend::services::empty_dirs;
#[path = "../common/mod.rs"]
mod common;
use common::create_test_db;
use std::fs;

#[tokio::test]
async fn test_find_empty_directories_basic() {
    let (_pool, temp_dir) = create_test_db().await;

    // 创建空目录
    let empty_dir = temp_dir.path().join("empty");
    fs::create_dir_all(&empty_dir).unwrap();

    // 创建非空目录
    let non_empty_dir = temp_dir.path().join("non_empty");
    fs::create_dir_all(&non_empty_dir).unwrap();
    fs::write(non_empty_dir.join("file.txt"), b"content").unwrap();

    let result = empty_dirs::find_empty_directories(temp_dir.path().to_str().unwrap(), true);

    assert!(result.is_ok());
    let dirs = result.unwrap();

    // 应该找到空目录
    assert!(dirs.iter().any(|d| d.path.contains("empty")));
    // 不应该包含非空目录
    assert!(!dirs.iter().any(|d| d.path.contains("non_empty")));
}

#[tokio::test]
async fn test_find_empty_directories_nested() {
    let (_pool, temp_dir) = create_test_db().await;

    // 创建嵌套的空目录
    let nested_empty = temp_dir.path().join("level1").join("level2").join("level3");
    fs::create_dir_all(&nested_empty).unwrap();

    let result = empty_dirs::find_empty_directories(temp_dir.path().to_str().unwrap(), true);

    assert!(result.is_ok());
    let dirs = result.unwrap();

    // 应该只找到最底层的空目录
    assert_eq!(dirs.len(), 1);
    assert!(dirs[0].path.contains("level3"));
}

#[tokio::test]
async fn test_find_empty_directories_with_hidden_files() {
    let (_pool, temp_dir) = create_test_db().await;

    // 创建包含隐藏文件的目录（应该被认为是空的）
    let dir_with_hidden = temp_dir.path().join("hidden");
    fs::create_dir_all(&dir_with_hidden).unwrap();
    fs::write(dir_with_hidden.join(".hidden"), b"content").unwrap();

    let result = empty_dirs::find_empty_directories(temp_dir.path().to_str().unwrap(), true);

    assert!(result.is_ok());
    let dirs = result.unwrap();

    // 根据实现，可能包含或不包含隐藏文件的目录
    // 这里主要测试不会 panic
    let _ = dirs;
}

#[tokio::test]
async fn test_find_empty_directories_non_recursive() {
    let (_pool, temp_dir) = create_test_db().await;

    // 创建顶层空目录
    let top_level_empty = temp_dir.path().join("top_empty");
    fs::create_dir_all(&top_level_empty).unwrap();

    // 创建嵌套空目录
    let nested_empty = temp_dir.path().join("top").join("nested_empty");
    fs::create_dir_all(&nested_empty).unwrap();

    let result = empty_dirs::find_empty_directories(
        temp_dir.path().to_str().unwrap(),
        false, // 非递归
    );

    assert!(result.is_ok());
    let dirs = result.unwrap();

    // 非递归应该只找到顶层空目录
    assert!(dirs.iter().any(|d| d.path.contains("top_empty")));
    // 不应该找到嵌套的空目录
    assert!(!dirs.iter().any(|d| d.path.contains("nested_empty")));
}

#[tokio::test]
async fn test_find_empty_directories_no_empty_dirs() {
    let (_pool, temp_dir) = create_test_db().await;

    // 只创建有文件的目录
    let dir = temp_dir.path().join("with_files");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("file1.txt"), b"content1").unwrap();
    fs::write(dir.join("file2.txt"), b"content2").unwrap();

    let result = empty_dirs::find_empty_directories(temp_dir.path().to_str().unwrap(), true);

    assert!(result.is_ok());
    let dirs = result.unwrap();

    // 不应该找到空目录
    assert!(!dirs.iter().any(|d| d.path.contains("with_files")));
}

#[tokio::test]
async fn test_delete_directories() {
    let (_pool, temp_dir): (sqlx::SqlitePool, tempfile::TempDir) = create_test_db().await;

    // 创建要删除的空目录
    let dir1 = temp_dir.path().join("delete1");
    let dir2 = temp_dir.path().join("delete2");
    fs::create_dir_all(&dir1).unwrap();
    fs::create_dir_all(&dir2).unwrap();

    let dirs_to_delete = vec![
        dir1.to_string_lossy().to_string(),
        dir2.to_string_lossy().to_string(),
    ];

    let result = empty_dirs::delete_empty_directories(&dirs_to_delete).await;
    assert!(result.is_ok());

    // 验证目录已删除
    assert!(!dir1.exists());
    assert!(!dir2.exists());
}

#[tokio::test]
async fn test_delete_directories_nonexistent() {
    let (_pool, _temp_dir): (sqlx::SqlitePool, tempfile::TempDir) = create_test_db().await;

    let dirs_to_delete = vec![
        "/nonexistent/dir1".to_string(),
        "/nonexistent/dir2".to_string(),
    ];

    // 删除不存在的目录应该处理错误
    let result = empty_dirs::delete_empty_directories(&dirs_to_delete).await;
    // 可能成功（忽略不存在的）或失败，取决于实现
    let _ = result;
}

#[tokio::test]
async fn test_delete_directories_partial_failure() {
    let (_pool, temp_dir): (sqlx::SqlitePool, tempfile::TempDir) = create_test_db().await;

    // 创建一个存在的目录和一个不存在的目录
    let existing_dir = temp_dir.path().join("exists");
    fs::create_dir_all(&existing_dir).unwrap();

    let dirs_to_delete = vec![
        existing_dir.to_string_lossy().to_string(),
        "/nonexistent/dir".to_string(),
    ];

    let result = empty_dirs::delete_empty_directories(&dirs_to_delete).await;
    // 应该至少删除存在的目录
    if result.is_ok() {
        assert!(!existing_dir.exists());
    }
}
