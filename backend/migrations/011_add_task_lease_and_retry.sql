-- Add task lease/heartbeat and retry support
-- These fields enable soft leasing for distributed workers and bounded retries.

ALTER TABLE tasks ADD COLUMN lease_until DATETIME;
ALTER TABLE tasks ADD COLUMN lease_renewed_at DATETIME;
ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;

-- Support lease reclamation and monitoring queries
CREATE INDEX IF NOT EXISTS idx_tasks_status_lease_until ON tasks(status, lease_until);

