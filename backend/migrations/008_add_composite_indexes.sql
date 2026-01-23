-- 添加复合索引优化查询性能
-- 执行时间: 预计较长，建议在低峰期执行

-- 复合索引：文件类型 + 大小（用于大文件查询）
CREATE INDEX IF NOT EXISTS idx_media_files_file_type_size ON media_files(file_type, size DESC);

-- 复合索引：TMDB ID + 质量分数（用于影片去重）
CREATE INDEX IF NOT EXISTS idx_media_files_tmdb_quality ON media_files(tmdb_id, quality_score DESC, size DESC);

-- 复合索引：修改时间 + 文件类型（用于增量扫描）
CREATE INDEX IF NOT EXISTS idx_media_files_modified_type ON media_files(last_modified DESC, file_type);

-- 复合索引：哈希 + 文件类型（用于去重查询优化）
CREATE INDEX IF NOT EXISTS idx_media_files_hash_type ON media_files(hash_md5, file_type);

-- 复合索引：路径前缀（用于目录查询）
CREATE INDEX IF NOT EXISTS idx_media_files_path_prefix ON media_files(substr(path, 1, 100));

-- 复合索引：任务状态 + 创建时间（用于任务调度）
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at DESC);

-- 复合索引：任务类型 + 状态（用于队列统计）
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(task_type, status);

-- 复合索引：任务节点 + 状态（用于分布式调度）
CREATE INDEX IF NOT EXISTS idx_tasks_node_status ON tasks(node_id, status);

-- 复合索引：日志操作 + 时间（用于操作历史）
CREATE INDEX IF NOT EXISTS idx_operation_logs_operation_time ON operation_logs(operation, created_at DESC);

-- 复合索引：设置分类 + 键（用于配置查询）
CREATE INDEX IF NOT EXISTS idx_settings_category_key ON settings(category, key);

-- 分析表以优化查询计划
ANALYZE media_files;
ANALYZE tasks;
ANALYZE operation_logs;
ANALYZE settings;