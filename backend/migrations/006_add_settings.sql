-- Settings table: Store application configuration
CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL, -- basic, scheduler, etc.
    key TEXT NOT NULL,
    value TEXT,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- Insert default settings
INSERT OR IGNORE INTO settings (id, category, key, value, description) VALUES
('basic-tmdb-api-key', 'basic', 'tmdb_api_key', '', 'TMDB API Key for metadata scraping'),
('basic-default-dir', 'basic', 'default_dir', '/', 'Default directory for scanning'),
('basic-auto-monitor', 'basic', 'auto_monitor', '1', 'Enable automatic monitoring of changes'),
('scheduler-daily-cleanup', 'scheduler', 'daily_cleanup', '1', 'Enable daily cleanup of empty directories'),
('scheduler-weekly-quality', 'scheduler', 'weekly_quality_update', '1', 'Enable weekly quality score updates');
