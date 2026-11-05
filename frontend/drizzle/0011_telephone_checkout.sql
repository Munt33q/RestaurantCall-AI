-- Separate Telnyx confirmation leg; no changes to existing order authority.
CREATE TABLE telephone_checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 session_id uuid NOT NULL REFERENCES call_sessions(id),
 source_conversation_id text NOT NULL,
 cart_version integer NOT NULL,
 review_json jsonb NOT NULL,
 review_hash text NOT NULL,
 review_text text NOT NULL,
 notification_channel text NOT NULL CHECK (notification_channel IN ('none','call')),
 notification_consent boolean NOT NULL,
 state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','answering','review','prompt','gather','receipt','done','aborted','ended')),
 call_control_id text UNIQUE,
 call_leg_id text,
 call_session_id text,
 application_id text,
 stage_nonce text NOT NULL,
 stage_issued_at timestamptz NOT NULL DEFAULT now(),
 review_completed_at timestamptz,
 order_id uuid REFERENCES orders(id),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX telephone_checkout_active_session ON telephone_checkouts(session_id)
 WHERE state NOT IN ('done','aborted','ended');
CREATE INDEX telephone_checkout_session ON telephone_checkouts(session_id);
-- Immutable snapshot evidence must never drift after a review has been issued.
CREATE FUNCTION protect_telephone_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.review_json IS DISTINCT FROM OLD.review_json OR NEW.review_hash<>OLD.review_hash
 OR NEW.review_text<>OLD.review_text OR NEW.cart_version<>OLD.cart_version
 OR NEW.session_id<>OLD.session_id OR NEW.restaurant_id<>OLD.restaurant_id
 OR NEW.source_conversation_id<>OLD.source_conversation_id
 OR NEW.notification_channel<>OLD.notification_channel OR NEW.notification_consent<>OLD.notification_consent
 THEN RAISE EXCEPTION 'Telephone review is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER telephone_review_immutable BEFORE UPDATE ON telephone_checkouts FOR EACH ROW EXECUTE FUNCTION protect_telephone_review();

CREATE TABLE telephone_commands (
 id uuid PRIMARY KEY,
 checkout_id uuid NOT NULL REFERENCES telephone_checkouts(id),
 call_control_id text NOT NULL,
 action text NOT NULL CHECK (action IN ('answer','speak','gather','hangup')),
 body_json jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','uncertain')),
 created_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz,
 sent_at timestamptz
);
