# RestaurantCall AI — integration master plan and debugging log

## Completion gate
No workflow is complete until its end-to-end verification passes. Never record credentials, customer data, or secret environment values here. Use sandbox/test environments; live charges, customer communications, new financial commitments and destructive production changes require explicit approval.

## Discovery (2026-11-07)
- Authenticated GitHub access restored by project owner after password-reset requirement.
- Repository: Munt33q/RestaurantCall-AI, default branch master; backend Python/FastAPI, frontend TypeScript.
- Vercel project accessible at vercel.com/vercel-1a62/restaurant-call-ai.
- Public frontend restaurant-call-ai.vercel.app redirects to /login; authenticated workflow not yet verified.
- backend/app/main.py currently holds MENU, ORDERS, CALL_SESSIONS and WEBHOOK_EVENTS in process memory. Durable persistence and webhook idempotency require verification/implementation before production readiness.
- Static review: place_order decrements inventory as it processes each line, before all subsequent lines are validated. A rejected multi-line order can consume stock. Duplicate item lines also require aggregate validation. Repair and regression tests are priority work.
- No end-to-end integration has been verified in this session.

## Prioritized execution
- [ ] Inventory branches, deployment source commit, frontend/backend hosting, existing tests and integration modules.
- [ ] Establish CI tests; repair atomic order validation/inventory handling and test rejected/duplicate-line orders.
- [ ] Verify authentication/authorization on menu, orders, administration and webhook routes.
- [ ] Neon: confirm project and isolated development branch; versioned schema/migrations; durable orders, inventory, call sessions and webhook-event uniqueness; transactional stock reservations.
- [ ] Vercel: verify frontend/backend URLs, environment-variable names/scopes (never log values), health checks, preview deployment and production deployment provenance.
- [ ] Stripe test mode: server-priced checkout, signed webhook verification, durable event deduplication, order/payment reconciliation, failure/retry/refund handling. No live transactions.
- [ ] Clover sandbox: authentication, merchant mapping, menu sync, idempotent order delivery and retry reconciliation.
- [ ] TextBee: ordinary account setup, device prerequisite discovery, server-side credentials, delivery tracking. No messages to real customers without approval.
- [ ] Voice: preserve current Twilio/voice system; verify signatures, conversation state, order confirmation and error handling.
- [ ] ElevenLabs: document adapter and configuration requirements for a later phase; do not switch current voice provider.
- [ ] Run full sandbox E2E: menu sync -> call/order -> quote -> test checkout -> signed payment event -> POS delivery -> approved test notification -> dashboard reconciliation.

## Debugging log
| Date | Observation | Action/result |
| --- | --- | --- |
| 2026-11-07 | GitHub required password reset | Owner restored access; repository readable. |
| 2026-11-07 | GitHub page JavaScript execution blocked by CSP | Use supported GitHub UI; no security controls bypassed. |
| 2026-11-07 | Public frontend redirects to login | Dashboard/order journey remains unverified. |
| 2026-11-07 | Inventory mutation occurs before complete validation | Identified by static inspection; fix/test pending. |

## Resume protocol
Read this file and relevant code/tests, inspect current branch/deployment, then resume the first incomplete priority. Record concrete changes, test output and blockers; do not mark configuration or deployment as verified merely because a dashboard is accessible.
