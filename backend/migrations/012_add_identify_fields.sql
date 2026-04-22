ALTER TABLE media_files ADD COLUMN detected_title TEXT;
ALTER TABLE media_files ADD COLUMN detected_year INTEGER;
ALTER TABLE media_files ADD COLUMN detected_season INTEGER;
ALTER TABLE media_files ADD COLUMN detected_episode INTEGER;
ALTER TABLE media_files ADD COLUMN parser_provider TEXT;
ALTER TABLE media_files ADD COLUMN parse_version TEXT;
ALTER TABLE media_files ADD COLUMN confidence_score REAL;
ALTER TABLE media_files ADD COLUMN review_state TEXT;
ALTER TABLE media_files ADD COLUMN match_provider TEXT;
ALTER TABLE media_files ADD COLUMN match_external_id TEXT;
ALTER TABLE media_files ADD COLUMN locked_match_provider TEXT;
ALTER TABLE media_files ADD COLUMN locked_match_external_id TEXT;
ALTER TABLE media_files ADD COLUMN ai_disabled_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_media_files_review_state ON media_files(review_state);
CREATE INDEX IF NOT EXISTS idx_media_files_match_provider ON media_files(match_provider);
CREATE INDEX IF NOT EXISTS idx_media_files_locked_match_provider ON media_files(locked_match_provider);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    request_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider ON ai_usage_logs(provider);

INSERT OR IGNORE INTO settings (id, category, key, value, description) VALUES
('basic-bgm-api-key', 'basic', 'bgm_api_key', '', 'Bangumi API Key for anime metadata matching'),
('ai-cloudflare-account-id', 'ai', 'cloudflare_account_id', '', 'Cloudflare account id for Workers AI'),
('ai-cloudflare-api-token', 'ai', 'cloudflare_api_token', '', 'Cloudflare API token for Workers AI'),
('ai-cloudflare-model', 'ai', 'cloudflare_ai_model', '@cf/meta/llama-3.1-8b-instruct', 'Workers AI model used for filename parsing'),
('ai-cloudflare-base-url', 'ai', 'cloudflare_ai_base_url', '', 'Optional custom base URL for Workers AI or AI Gateway'),
('ai-mode', 'ai', 'ai_mode', 'assist', 'AI usage mode: disabled, assist, force'),
('ai-budget-mode', 'ai', 'ai_budget_mode', 'strict_free', 'AI budget mode'),
('ai-daily-budget', 'ai', 'ai_daily_budget', '100', 'Maximum AI requests per day under strict free mode');
