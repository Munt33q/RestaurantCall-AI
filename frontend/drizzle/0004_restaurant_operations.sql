ALTER TABLE orders ADD COLUMN IF NOT EXISTS notification_channel text NOT NULL DEFAULT 'none' CHECK(notification_channel IN ('none','sms','call'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notification_consent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_sms_consent boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_sms_consent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_version integer NOT NULL DEFAULT 1;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS outcome text;
CREATE TABLE IF NOT EXISTS order_events (
 id bigserial PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), event_key text NOT NULL,
 kind text NOT NULL, actor text NOT NULL DEFAULT 'system', data_json jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,event_key)
);
CREATE TABLE IF NOT EXISTS notification_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 order_id uuid NOT NULL REFERENCES orders(id), event_key text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN('confirmed','preparing','ready','payment_link')),
 channel text NOT NULL CHECK(channel IN('sms','call')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','dispatching','submitted','delivered','failed','uncertain','suppressed')),
 consent_at timestamptz, attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz,
 provider_id text, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_jobs_due ON notification_jobs(next_attempt_at) WHERE status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS notification_provider_unique ON notification_jobs(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_events_timeline ON order_events(order_id,created_at);
CREATE TABLE IF NOT EXISTS messaging_preferences (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id), phone text NOT NULL,
 sms_opted_out boolean NOT NULL DEFAULT false, last_event_at timestamptz NOT NULL DEFAULT '-infinity', updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(restaurant_id,phone)
);
CREATE TABLE IF NOT EXISTS provider_receipts (
 event_id text PRIMARY KEY, provider_id text NOT NULL, status text NOT NULL,
 occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_receipts_provider ON provider_receipts(provider_id);
ALTER TABLE messaging_preferences ADD COLUMN IF NOT EXISTS last_event_at timestamptz NOT NULL DEFAULT '-infinity';
