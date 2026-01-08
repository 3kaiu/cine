-- 添加数据库索引以优化查询性能

-- 文件哈希索引（用于去重查询）
CREATE INDEX IF NOT EXISTS idx_media_files_hash_md5 ON media_files(hash_md5);

-- 文件类型索引（用于类型过滤）
CREATE INDEX IF NOT EXISTS idx_media_files_file_type ON media_files(file_type);

-- 文件大小索引（用于大小范围查询）
CREATE INDEX IF NOT EXISTS idx_media_files_size ON media_files(size);

-- 文件路径索引（用于路径查询和去重）
CREATE INDEX IF NOT EXISTS idx_media_files_path ON media_files(path);

-- 最后修改时间索引（用于缓存验证）
CREATE INDEX IF NOT EXISTS idx_media_files_last_modified ON media_files(last_modified);

-- 复合索引：类型+大小（用于常见查询组合）
CREATE INDEX IF NOT EXISTS idx_media_files_type_size ON media_files(file_type, size);

-- 复合索引：哈希+大小（用于去重排序）
CREATE INDEX IF NOT EXISTS idx_media_files_hash_size ON media_files(hash_md5, size) WHERE hash_md5 IS NOT NULL;
