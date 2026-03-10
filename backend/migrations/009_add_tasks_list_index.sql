-- 优化任务列表分页查询：ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
