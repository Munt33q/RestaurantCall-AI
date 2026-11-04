ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS submission_attempted_at timestamptz;
