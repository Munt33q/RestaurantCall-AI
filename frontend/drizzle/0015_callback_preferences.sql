ALTER TABLE orders ADD COLUMN IF NOT EXISTS callback_stages jsonb NOT NULL DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_accepted_at timestamptz;
ALTER TABLE notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check CHECK(kind IN('confirmed','preparing','ready','completed','accepted','payment_link','draft_recovery'));
