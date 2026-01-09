-- Add watch_folders table
CREATE TABLE IF NOT EXISTS watch_folders (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    auto_scrape BOOLEAN DEFAULT 1,
    auto_rename BOOLEAN DEFAULT 0,
    recursive BOOLEAN DEFAULT 1,
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
