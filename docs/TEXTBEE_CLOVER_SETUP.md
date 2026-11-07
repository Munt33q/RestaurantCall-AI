# TextBee and Clover setup

This branch adds two optional background integrations to the existing order flow.

1. Apply `frontend/drizzle/0017_clover_textbee.sql` with a direct `DIRECT_DATABASE_URL`. The migration is additive and creates `orders.clover_order_id` plus `clover_jobs`.
2. Set `TEXTBEE_API_KEY` and `TEXTBEE_DEVICE_ID` to route consented SMS jobs through TextBee. Existing opt-out, consent, deduplication, and hourly limits remain active.
3. Set `CLOVER_API_TOKEN`, `CLOVER_MERCHANT_ID`, and `CLOVER_BASE_URL=https://api.clover.com`. This is the global Clover sandbox API domain used by the configured token. The operations worker submits paid card orders and confirmed cash orders in current operational states (`confirmed`, `preparing`, or `ready`), then records the Clover ID on the order.
4. Run the normal operations job (`POST /api/jobs` or the cron route). Clover failures stay in `clover_jobs` for bounded retries and do not cancel the Neon order.

The dashboard shows SMS status and Clover submission status on each order card. The customer tracking and voice call flows are unchanged.

For a migration evidence report, record `SELECT count(*) FROM orders` and `SELECT count(*) FROM order_items` before and after applying the migration. Never include secret values in reports or commits.
