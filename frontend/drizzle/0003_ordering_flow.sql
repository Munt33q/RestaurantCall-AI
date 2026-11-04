ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS item_number integer;
CREATE UNIQUE INDEX IF NOT EXISTS menu_item_number_unique ON menu_items(restaurant_id,item_number);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES call_sessions(id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_session_unique ON orders(session_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_session_id text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_unique ON orders(checkout_session_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sms_status text NOT NULL DEFAULT 'not_requested';
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS state_json jsonb NOT NULL DEFAULT '{"phase":"ordering","items":[],"customerName":"","paymentMethod":null}'::jsonb;
CREATE TABLE IF NOT EXISTS voice_requests (
 session_id uuid NOT NULL REFERENCES call_sessions(id), turn integer NOT NULL,
 response_xml text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,turn)
);
CREATE TABLE IF NOT EXISTS payment_jobs (
 order_id uuid PRIMARY KEY REFERENCES orders(id), status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz, last_error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_jobs_pending ON payment_jobs(next_attempt_at) WHERE status='pending';
