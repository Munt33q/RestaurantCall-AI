# Integration Status

## Neon PostgreSQL

- **Implemented:** Schema SQL exists at `backend/alembic/versions/0001_initial.sql`; SQLAlchemy, Alembic, and psycopg dependencies are declared for the production ORM/migration path.
- **Tested with mocks:** In-memory menu, stock, order, and status behavior remains available for local UI testing.
- **Live integration verified:** No.
- **Blocked:** `DATABASE_URL` and `DIRECT_DATABASE_URL` are missing from the protected environment. The pooled application URL and direct migration URL are required.
- **Blocked:** The current runtime still uses the in-memory demo store in `backend/app/main.py`; PostgreSQL persistence cannot be verified or enabled until those URLs and installable database dependencies are available.

## FlatRouter voice pipeline

- **Implemented:** Backend-only FlatRouter HTTP client using `AI_BASE_URL` and `AI_API_KEY`; Twilio speech `<Gather>` to `/twilio/gather`; FlatRouter tool-calling turn; Twilio `<Say>` response; per-call session state and timeout parameters.
- **Tested with mocks:** Source-level syntax verified. Live HTTP and Twilio requests are not available in this environment.
- **Live integration verified:** No.
- **Blocked:** No documented FlatRouter Realtime audio WebSocket was available to validate. The current path depends on Twilio speech recognition and TTS, plus FlatRouter Chat Completions. A public HTTPS `PUBLIC_BACKEND_URL` and a real test call are required.

## Stripe

- **Implemented:** Stripe `t=...,v1=...` signature verification, duplicate event suppression, and `checkout.session.completed` order payment/status updates.
- **Tested with mocks:** No webhook test runner is available in the current environment.
- **Live integration verified:** No.
- **Blocked:** `STRIPE_WEBHOOK_SECRET` is missing. Create a Stripe test-mode webhook endpoint or use Stripe CLI and set its signing secret.

## Twilio

- **Implemented:** Voice webhook, speech gather loop, and response TwiML.
- **Tested with mocks:** XML generation is implemented but not exercised by a request test.
- **Live integration verified:** No.
- **Blocked:** The backend is not deployed to a public HTTPS endpoint, so Twilio cannot reach it.
