# Phase 6 release readiness

Status: **local engineering verified; production release and real-provider acceptance blocked by user choice.** The user requested preparation without live testing. Do not interpret a Ready Preview, synthetic provider request or injected HTTP response as a successful telephone call or delivered SMS.

## Implementation and provenance

Work continues from `037889c8c314cb61651aaca76e5c1ae172589fac` on `feat/elevenlabs-brittany-webhooks`. This is recovered and subsequently engineered source, not original commit `6de7172`. Historical recovered originals and earlier verification evidence remain preserved. `evidence/provenance.json` classifies new and modified files, checks archive bytes and the recovery checkpoint's blueprint hashes, and scans publication paths for private credentials and oversized artifacts.

The existing order engine, restaurant/menu/pricing policy, inventory reservation, order tables, kitchen workflows, notification jobs, suppression and signed delivery handlers are reused. No alternate demo checkout or duplicate business tables were introduced. Synthetic acceptance records are inserted only into a separate empty database, through the actual production order code; their `is_test=false` proves normal ticket/payment behavior within that disposable tenant, not permission to create production orders.

Implemented:

- Authenticated provider initiation binds restaurant, configured agent/destination, verified provider caller context and conversation. Preview caller allowlisting, per-call tool credentials and rebinding protection prevent model-controlled identity claims from establishing trust.
- Pickup name and special instructions are collected. The independent customer review page provides final name/complete-order confirmation and optional per-order notification consent. Only its authenticated same-origin browser grant can commit the order, atomically and idempotently.
- Exact menu/pricing/promotions/stock are revalidated before commit. Changed drafts and prices invalidate prior proofs. A saved receipt provides the actual order reference; the model tool cannot create an order or invent confirmation authority.
- Cash-only mode blocks card orders. Cash remains unpaid, including zero-total orders, until the existing staff collection action records payment.
- Existing dashboard polling shows normal saved orders, notes, totals and notification job status. Staff can advance confirmed → preparing → ready → completed and record cash.
- ElevenLabs HMAC terminal callbacks close matching bound sessions without persisting transcripts/audio/analysis. Original relay playback checks remain intact. The web review is the explicitly permitted independent confirmation alternative; no playback acknowledgement is fabricated.
- SMS requires profile/registration/sender attestations, per-order consent, no suppression, appropriate kitchen status and delivery flags. Definite rate limits have bounded retries; ambiguous submissions remain uncertain for operator review. Signed callbacks cannot downgrade terminal delivery and duplicate events do not resend messages.
- Optional one-time ready call retains the Telnyx TeXML/Polly fallback and signed per-job callbacks. It is not verified Brittany outbound SIP.

## Verification evidence

`evidence/database-tests.json`: complete frontend suite on schema-only Neon branch `br-misty-shadow-b8v5hmz2`, empty database `recovery_phase6_1793852368`: **219 tests, 218 passed, zero failed, one skipped** (the explicitly live-model-chain test).

Coverage includes legacy relay confirmations/interruption/reconnect contracts, catalog/pricing/inventory, tenant isolation, simultaneous confirmation idempotency, stale reviews, name/notes capture, zero-total cash, signed ElevenLabs termination, signed Telnyx receipt rejection/replay, STOP suppression, bounded 429 retries, uncertain outcomes and one-time ready-call callbacks. Provider HTTP transports are injected; no real submission was made. Repeat-run fixture identifiers were corrected to avoid collisions between separate disposable test runs.

`npm run typecheck` and `npm run build` passed. Production tsconfig remains scoped to deployable sources; test files execute through the existing TypeScript test runner.

`evidence/browser-result.json`: Playwright Chromium against `next start` production output verified staff login/rejection, actual initiation/tool HTTP endpoints, real database menu/cart/name/notes, model-confirmation refusal, customer full review and opt-in, saved cash order/reference, dashboard automatic visibility, notes and pending SMS, kitchen transitions, staff cash collection, call history, menu edit/availability, analytics and no uncaught page errors. No simulator checkout was used. `customer-review.png` and `order-detail.png` contain synthetic data only.

Isolated Vercel Preview: **Ready**, https://restaurant-call-amrafmqo5-vercel-1a62.vercel.app, deployment `dpl_8PhNyNLHCpBa5KpiNzcPHdwoYwbY`, source commit `4572bf88d6c43a4530604a03af0e8d6ec821e171`. `evidence/preview-deployment.json` records the unchanged production deployment identity. `evidence/preview-browser-result.json` records **all ten remote browser checks passed, zero uncaught page errors**, using the same actual customer/order/dashboard paths as local verification and a separately seeded synthetic Preview tenant. The screenshots `preview-customer-review.png` and `preview-order-detail.png` contain synthetic data only. Vercel Authentication remained enabled; a one-hour deployment-scoped private share session was used for automation, then its link was revoked. No protection token or session cookie is published.

The engineering implementation is commit `4572bf8`; the following verification-only commit adds remote evidence and fixes acceptance/audit tooling. Its frontend source must match that deployed commit exactly. A Git-triggered Preview that inherits shared account settings is not the isolated acceptance deployment above and was not used for order testing.

## Migration and configuration

Migration `0010_elevenlabs_checkout.sql` is additive: agent/called-number/binding-source columns on `call_sessions`, review-code hash/expiry on `draft_carts`, and a partial unique hash index. All migrations 0001–0010 were applied and their SHA-256 checksums verified on the disposable database; the ledger is in `evidence/database-tests.json`. No production migration was applied. The new code must not be activated against production until migration compatibility is approved and verified.

See `PROVIDER_CONFIGURATION.md`, `BRITTANY_INSTRUCTIONS.md`, the nine tool worksheets in `config/elevenlabs-webhook-tool-blueprints.json`, and the disabled defaults in `frontend/.env.example`. Secrets and disposable connection state remain outside Git in the existing private temporary settings. No shared Preview or production environment variable was edited. An isolated deployment may use only its per-deployment test settings.

The disposable Neon branch is retained while an acceptance Preview depends on it. It contains schema and synthetic records only. Remove the acceptance Preview and its private settings, then delete precisely that disposable branch when no longer needed; do not remove the production parent or unrelated branches.

## Remaining launch gates

| Gate | Current status / required decision |
|---|---|
| Real inbound Telnyx SIP → ElevenLabs | Blocked by user choice; no controlled agent/owned acceptance number authorized |
| Agent/model/voice/languages/G711U | Preserve existing configuration; verify exact account settings and actual audio/latency/interruptions before release |
| Complete spoken review | No adequate independent live playback evidence verified; customer web review implemented instead; human telephone/code-entry usability still required |
| Session ending | Synthetic HMAC terminal callback verified; actual webhook event format, timing, retries and long-call payload size need provider acceptance |
| Real SMS | No usable account key exposed by read-only provider inspection; registration, sender/profile, STOP/HELP replies, submission and delivery need controlled acceptance |
| Outbound ready call | Injected TeXML fallback verified; no actual call or ElevenLabs Brittany outbound acceptance; requires consented owned-number test and fallback voice approval |
| Notification recovery schedule | Inherited daily Vercel cron insufficient for timely recovery; approve a supported minute-level scheduler and verify backlog/uncertain monitoring |
| Production delivery flags | Read-only inspection observed SMS false and inherited `OUTBOUND_UPDATES_ENABLED=true`; untouched. Reconcile the latter to the release-hold policy with explicit authorization |
| Production database/menu/tax | Existing authoritative restaurant/menu/stock/tax must be reviewed by owner; no new tax or service charge activated; approve migration 0010 and verify grants/backups |
| Staff and security settings | Set strong distinct secrets and actual staff access, verify provider callback access through deployment protection/firewall, retention and rate limits |
| Production deployment | Requires explicit approval after all preceding gates, a scoped migration plan and controlled real-order acceptance |

The safe local engineering, publication audit, Preview build and isolated browser verification are complete. Production readiness is **not claimed**. Do not promote the synthetic acceptance Preview to production: its database and credentials are intentionally disposable. Create a separately approved production deployment after activation gates pass.
