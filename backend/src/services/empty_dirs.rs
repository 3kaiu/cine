use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// 空文件夹分类
#[derive(Debug, Clone, serde::Serialize, utoipa::ToSchema)]
pub struct EmptyDirInfo {
    pub path: String,
    pub category: String, // cache, build, system, other
    pub depth: usize,
}

/// 查找空文件夹
pub fn find_empty_directories(root: &str, recursive: bool) -> anyhow::Result<Vec<EmptyDirInfo>> {
    let root_path = Path::new(root);
    if !root_path.exists() {
        return Err(anyhow::anyhow!("Directory does not exist: {}", root));
    }

    let mut empty_dirs = Vec::new();
    let walker = if recursive {
        WalkDir::new(root).into_iter()
    } else {
        WalkDir::new(root).max_depth(1).into_iter()
    };

    // 先收集所有目录
    let mut dirs: Vec<PathBuf> = Vec::new();
    for entry in walker {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            dirs.push(path.to_path_buf());
        }
    }

    // 按深度排序（从深到浅），这样先检查子目录
    dirs.sort_by(|a, b| {
        let depth_a = a.components().count();
        let depth_b = b.components().count();
        depth_b.cmp(&depth_a)
    });

    // 检查每个目录是否为空
    for dir_path in dirs {
        if is_empty_directory(&dir_path)? {
            let depth = dir_path.components().count();
            let category = categorize_directory(&dir_path);
            empty_dirs.push(EmptyDirInfo {
                path: dir_path.to_string_lossy().to_string(),
                category,
                depth,
            });
        }
    }

    Ok(empty_dirs)
}

/// 检查目录是否为空
fn is_empty_directory(path: &Path) -> anyhow::Result<bool> {
    let mut entries = fs::read_dir(path)?;
    Ok(entries.next().is_none())
}

/// 分类目录类型
fn categorize_directory(path: &Path) -> String {
    let _path_str = path.to_string_lossy().to_lowercase();
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    // 缓存目录
    if name.contains("cache") || name.contains("tmp") || name.contains(".cache") {
        return "cache".to_string();
    }

    // 构建产物目录
    if name == "dist"
        || name == "build"
        || name == "target"
        || name == ".next"
        || name == "out"
        || name == "bin"
        || name == "obj"
        || name == ".gradle"
    {
        return "build".to_string();
    }

    // 系统目录
    if name.starts_with('.')
        && (name == ".git"
            || name == ".vscode"
            || name == ".idea"
            || name == ".ds_store"
            || name == "thumbs.db")
    {
        return "system".to_string();
    }

    // node_modules
    if name == "node_modules" {
        return "build".to_string();
    }

    // 其他
    "other".to_string()
}

/// 批量删除空文件夹
pub async fn delete_empty_directories(dirs: &[String]) -> anyhow::Result<Vec<String>> {
    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    for dir_path in dirs {
        match tokio::fs::remove_dir(dir_path).await {
            Ok(_) => {
                deleted.push(dir_path.clone());
                tracing::info!("Deleted empty directory: {}", dir_path);
            }
            Err(e) => {
                errors.push(format!("Failed to delete {}: {}", dir_path, e));
                tracing::error!("Failed to delete {}: {}", dir_path, e);
            }
        }
    }

    if !errors.is_empty() {
        return Err(anyhow::anyhow!("Some deletions failed: {:?}", errors));
    }

    Ok(deleted)
}
