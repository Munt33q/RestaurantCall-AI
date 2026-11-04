CREATE TABLE IF NOT EXISTS engagement_events (
 id bigserial PRIMARY KEY, session_id uuid NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
 event_key text NOT NULL, kind text NOT NULL, data_json jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,event_key)
);
CREATE INDEX IF NOT EXISTS engagement_events_time ON engagement_events(created_at,kind);
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recoverable_until timestamptz;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_caller_hash text;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_token_hash text;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_token_cipher text;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_code_hash text;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_code_until timestamptz;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_code_issues integer NOT NULL DEFAULT 0;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_consent_at timestamptz;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_language text NOT NULL DEFAULT 'en';
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovery_resumed_session_id uuid REFERENCES call_sessions(id);
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS recovered_from_session_id uuid REFERENCES call_sessions(id);
CREATE UNIQUE INDEX IF NOT EXISTS draft_recovery_token ON draft_carts(recovery_token_hash) WHERE recovery_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS draft_recovery_active_code ON draft_carts(recovery_caller_hash,recovery_code_hash) WHERE recovery_code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS draft_recovery_caller ON draft_carts(recovery_caller_hash,recovery_code_hash);
CREATE TABLE IF NOT EXISTS recovery_attempts (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id), caller_hash text NOT NULL, day date NOT NULL DEFAULT CURRENT_DATE,
 failures integer NOT NULL DEFAULT 0 CHECK(failures>=0), PRIMARY KEY(restaurant_id,caller_hash,day)
);
ALTER TABLE notification_jobs ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS recipient_hash text;
ALTER TABLE notification_jobs ADD COLUMN IF NOT EXISTS draft_session_id uuid REFERENCES draft_carts(session_id);
ALTER TABLE notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check CHECK(kind IN('confirmed','preparing','ready','payment_link','draft_recovery'));
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_subject_check CHECK(
 (kind='draft_recovery' AND order_id IS NULL AND draft_session_id IS NOT NULL AND channel='sms') OR
 (kind<>'draft_recovery' AND order_id IS NOT NULL AND draft_session_id IS NULL));
