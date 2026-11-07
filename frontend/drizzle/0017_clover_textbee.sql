ALTER TABLE orders ADD COLUMN IF NOT EXISTS clover_order_id text UNIQUE;
CREATE TABLE IF NOT EXISTS clover_jobs (
  order_id uuid PRIMARY KEY REFERENCES orders(id),
  status text NOT NULL DEFAULT 'pending',
  provider_id text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clover_jobs_pending_idx ON clover_jobs(status,next_attempt_at);
