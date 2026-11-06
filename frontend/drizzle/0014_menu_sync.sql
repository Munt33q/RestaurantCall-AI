ALTER TABLE promotions ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS menu_sync_jobs (
 restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id),document_id text,agent_id text,branch_id text,
 content_hash text,last_synced_at timestamptz,last_error text,attempts integer NOT NULL DEFAULT 0,
 next_at timestamptz NOT NULL DEFAULT now(),synced_revision integer,updated_at timestamptz NOT NULL DEFAULT now()
);
