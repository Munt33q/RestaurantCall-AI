CREATE TABLE IF NOT EXISTS model_call_events (
 id bigserial PRIMARY KEY,restaurant_id uuid NOT NULL REFERENCES restaurants(id),provider text NOT NULL,model text NOT NULL,ok boolean NOT NULL,error_code text,http_status integer,elapsed_ms integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_events_window ON model_call_events(restaurant_id,provider,created_at DESC);
CREATE TABLE IF NOT EXISTS model_provider_state (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id),provider text NOT NULL,open_until timestamptz,last_success_at timestamptz,PRIMARY KEY(restaurant_id,provider)
);
CREATE TABLE IF NOT EXISTS model_incidents (
 id bigserial PRIMARY KEY,restaurant_id uuid NOT NULL REFERENCES restaurants(id),provider text NOT NULL,failure_count integer NOT NULL,last_error text NOT NULL,opened_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS model_one_active_incident ON model_incidents(restaurant_id,provider) WHERE resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS model_health_status (
 restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id),checked_at timestamptz NOT NULL DEFAULT now(),ok boolean NOT NULL,result_json jsonb NOT NULL
);
