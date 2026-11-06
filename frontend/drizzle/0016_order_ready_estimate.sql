ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz;
