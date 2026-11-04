ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS catalog_revision integer NOT NULL DEFAULT 1;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_note text NOT NULL DEFAULT '';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS special boolean NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS special_starts_at timestamptz;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS special_ends_at timestamptz;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS aliases jsonb NOT NULL DEFAULT '[]';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0 CHECK(discount_cents>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb;
CREATE TABLE IF NOT EXISTS promotions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 title text NOT NULL, note text NOT NULL DEFAULT '', kind text NOT NULL CHECK(kind IN('percent','fixed','note')),
 value integer NOT NULL DEFAULT 0 CHECK(value>=0 AND (kind<>'percent' OR value<=10000) AND (kind<>'note' OR value=0)),
 item_ids jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true, starts_at timestamptz, ends_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS promotions_restaurant ON promotions(restaurant_id);
CREATE TABLE IF NOT EXISTS catalog_audit (
 id bigserial PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES restaurants(id), subject_id uuid,
 kind text NOT NULL, data_json jsonb NOT NULL, actor text NOT NULL DEFAULT 'staff', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catalog_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 source text NOT NULL, items_json jsonb NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published')),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS phone_order_history ON orders(restaurant_id,customer_phone,created_at) WHERE session_id IS NOT NULL AND is_test=false;
