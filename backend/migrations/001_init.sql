-- 创建媒体文件表
CREATE TABLE IF NOT EXISTS media_files (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    hash_xxhash TEXT,
    hash_md5 TEXT,
    video_info TEXT, -- JSON
    metadata TEXT,   -- JSON
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_modified TEXT NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_media_files_path ON media_files(path);
CREATE INDEX IF NOT EXISTS idx_media_files_hash_md5 ON media_files(hash_md5);
CREATE INDEX IF NOT EXISTS idx_media_files_file_type ON media_files(file_type);
CREATE INDEX IF NOT EXISTS idx_media_files_size ON media_files(size);

-- 创建扫描任务表
CREATE TABLE IF NOT EXISTS scan_tasks (
    id TEXT PRIMARY KEY,
    directory TEXT NOT NULL,
    status TEXT NOT NULL,
    total_files INTEGER,
    processed_files INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 创建哈希任务表
CREATE TABLE IF NOT EXISTS hash_tasks (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0.0,
    hash_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES media_files(id)
);
