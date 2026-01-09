-- 操作日志表：用于记录文件变更，支持撤销 (Undo)
CREATE TABLE IF NOT EXISTS operation_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL, -- rename, delete, move, trash, restore
    file_id TEXT,
    old_path TEXT NOT NULL,
    new_path TEXT,
    created_at TEXT NOT NULL
);

-- 扫描历史表：保存目录扫描结果摘要
CREATE TABLE IF NOT EXISTS scan_history (
    directory TEXT PRIMARY KEY,
    total_files INTEGER NOT NULL DEFAULT 0,
    total_size INTEGER NOT NULL DEFAULT 0,
    file_types_json TEXT, -- 各类型文件统计 JSON
    last_scanned_at TEXT NOT NULL
);

-- 为操作日志添加索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_file_id ON operation_logs(file_id);
