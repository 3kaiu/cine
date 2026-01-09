-- 为媒体文件表添加用于智能治理的列
ALTER TABLE media_files ADD COLUMN tmdb_id INTEGER;
ALTER TABLE media_files ADD COLUMN quality_score INTEGER;

-- 创建索引以优化按影片分组的查询
CREATE INDEX IF NOT EXISTS idx_media_files_tmdb_id ON media_files(tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_files_quality ON media_files(quality_score);
