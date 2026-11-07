# Core infrastructure audit — evidence and execution log

## Scope / safety
Follow-up to premature merge d1605bf (PR #1). PR #2 / agent/core-security-audit is NOT approved to merge until all checks and diff review pass. No production database migrations, live charges, customer notifications or live voice changes performed in this audit.

## Verified evidence
- PR #1 changed the Python order validation, regression tests, CI and master plan. Its prior green regression run is not security or production verification.
- Added security/regression workflow in PR #2 (initial commit df72604).
- Run 42370704786 failed both dependency audits. Backend job 128398039432 reported 18 advisory entries (including duplicates) across python-dotenv 1.0.1, pytest 8.3.3 and Starlette 0.41.3. Fix versions reported: dotenv 1.2.2, pytest 9.0.3; Starlette advisories extend through fixes at 1.3.1. Do NOT force an incompatible Starlette upgrade under FastAPI 0.115.5.
- Frontend audit also failed; Next.js critical advisory reported. Detailed compatible lockfile remediation pending.
- Initial audit failures skipped subsequent regression/build steps. Workflow now explicitly runs these steps after audit failure while retaining failed audit job status; security findings are NOT suppressed.
- Updated dotenv and pytest pins on this branch; passing installation/audit/regression results remain required.

## Architecture findings (source inspection, not runtime proof)
- Current master includes Next.js API routes under frontend/app/api including orders and Stripe webhook; frontend/lib/repository.ts and frontend/lib/db/{index,schema}.ts exist. Do not create a second schema or duplicate order service.
- Python backend has process-memory state and needs classification as active or legacy before replacing persistence there.
- Stripe dashboard previously pointed to /api/stripe/webhook on the Vercel frontend. Dashboard configuration alone does not prove delivery or successful payment reconciliation.
- Runtime call routing, authoritative database/schema, migration application and deployed environment mapping remain unverified.

## Remaining dependency order
1. Finish full PR #1 diff/compatibility review, verify d1605bf deployment, document rollback deployment (not yet done).
2. Remediate dependency audit findings with compatible versions and lockfile; collect build/typecheck/regression outputs independently.
3. Verify authoritative deployed order path and database, migration history and staging isolation.
4. Repair transactional inventory, idempotent order creation/status history and persistent webhook reconciliation in the existing active path. Concurrency/failure tests required.
5. Complete test-mode Checkout and signed duplicate/out-of-order/expiry reconciliation; real staging E2E with DB receipts required.
6. Only after core passes: Clover sandbox, TextBee authorized recipients, Brittany authenticated staging tools. No production voice replacement.

## Rollback
No new merge or production deployment authorized by this branch. Existing production deployment must be preserved. For PR #1, use a reviewed revert PR if runtime regressions are confirmed; do not blindly reset master because subsequent commits contain separate work.

## Completion status
None of Neon ordering, Stripe E2E, Clover, TextBee or Brittany staging has passed the required end-to-end completion gate in this audit.
