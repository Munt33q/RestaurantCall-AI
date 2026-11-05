-- Additive only: reuse existing sessions, drafts, orders and notification jobs.
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS elevenlabs_agent_id text;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS elevenlabs_called_number text;
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS elevenlabs_binding_source text;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS checkout_code_hash text;
ALTER TABLE draft_carts ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS draft_checkout_code_unique ON draft_carts(checkout_code_hash) WHERE checkout_code_hash IS NOT NULL;
