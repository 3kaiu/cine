-- 创建统一任务表
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL, -- pending, running, paused, completed, failed, cancelled
    description TEXT,
    payload TEXT, -- JSON 格式参数
    result TEXT,  -- JSON 格式结果或错误信息
    progress REAL NOT NULL DEFAULT 0.0,
    node_id TEXT, -- 执行该任务的节点 ID (Master 或 Worker ID)
    error TEXT,
    duration_secs REAL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    started_at DATETIME,
    finished_at DATETIME
);

-- 创建索引以加快查询
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_node_id ON tasks(node_id);
