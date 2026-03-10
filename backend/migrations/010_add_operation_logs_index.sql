-- 优化操作日志列表查询：ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at DESC);
