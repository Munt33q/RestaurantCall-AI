# Telephone checkout engineering verification

November 5, 2026. Baseline: `72d4731daf4895ab51d105b7912835bfe8e7b0a5`, branch `feat/elevenlabs-brittany-webhooks`.

**Status: locally verified implementation; Preview deployment and actual provider acceptance blocked. Telephone-only customer checkout is not approved for live use.**

## Implemented

- Brittany's conversational ordering and all nine tool interfaces remain in place. An authenticated `confirm_order` request prepares an immutable authoritative review; it cannot create an order or supply confirmation evidence.
- A separate Telnyx Call Control webhook verifies raw-body Ed25519 signatures and fresh timestamps. Incoming admission requires the configured application and destination, original verified caller, source conversation, private per-call HMAC, unexpired review and exact cart version. It binds control, leg and session IDs. A second leg cannot reuse the prepared review.
- The command sequence is answer, full review speech, verified completed event, separate instruction speech, verified completed event, plain digit gather. No gather is issued during either speech. Only authenticated `call.gather.ended` with valid digit 1 and exact current HMAC stage state can commit. An AI yes, transcript, boolean, unsolicited early DTMF or a cancelled speech event cannot authorize an order.
- Final submission recomputes the complete review under database locks and reuses `insertOrder`. Stock, pricing, promotions, tax, tenant ownership and one-order-per-session authority remain transactional. Repeated or concurrent events reserve stock once. Cash remains unpaid and creates no Stripe job.
- The saved database order number is spoken by a subsequent Telnyx command. A completed receipt event is recorded independently. Uncertain receipt delivery does not delete the order or invent another number.
- A durable command outbox uses stable provider command IDs, leases and bounded retries; superseded stages cannot dispatch an older pending command. Ambiguous work beyond the retry window requires reconciliation.
- Callback choice is part of the immutable full review. Consented callbacks queue only at kitchen completion; no consent produces no job. SMS remains disabled for telephone mode, and the test environment disables all outbound notifications and Stripe credentials.
- Existing signed web review remains available when telephone mode is off, incomplete, unsupported for the selected language, or over the provider's complete-review length limit.

## Verified locally

| Check | Result | Evidence |
| --- | --- | --- |
| Typecheck | Passed | `evidence/typecheck.log` |
| Next.js production build | Passed | `evidence/build.log` |
| Full regression suite with real disposable PostgreSQL | 235 tests: 234 passed, 0 failed, 1 skipped | `evidence/regression-tests.json`, `.log` |
| Browser flow on local production build | Passed; no uncaught page errors | `evidence/browser-result.json`, `evidence/dashboard-telephone-order.png` |
| Historical-source preservation and sensitive-content scan | See generated manifest | `evidence/provenance.json` |

The single skipped test is the opt-in live model-chain test; no model/provider acceptance is implied. Database tests used the existing explicitly verified disposable Neon branch `br-misty-shadow-b8v5hmz2`, database `recovery_phase6_1793852368`, with independent synthetic tenants. No Production records were copied. Migration checksums through `0013` match the applied disposable ledger.

Regression coverage includes forged signatures/headers, wrong call identities, altered stage state, early digits, interrupted playback, correct independent instruction completion, valid/invalid/timeout/cancelled digits, expiry, explicit decline, cross-call token replay, tenant switching, price/stock/cart changes, immutable review enforcement, concurrent duplicate events, source ElevenLabs session ending after transfer, uncertain command retries, receipt-persistence fault rollback, no-consent behavior, completion callback scheduling and web fallback.

The browser harness used actual login, initiation/tool HTTP routes, production UI and dashboard polling. Telnyx responses and signed provider events were synthetic and confined to the local harness process. They were never submitted to Telnyx, ElevenLabs or a deployed Preview. The browser observed saved reference `30120326`, total `$10.82` and notes, then completed the same kitchen order and verified one unsent consented callback job. This establishes application-to-database-to-dashboard behavior, not an audible real telephone order.

## Regression repairs found during this work

1. `notification_jobs_kind_check` omitted `completed` although the current application queues completion notifications. Additive migration `0012` retains existing kinds and admits completion jobs. An old test expecting a callback while merely ready now asserts no job before completion.
2. PostgreSQL JSONB reorders quote properties. After complete-review hash verification, telephone checkout passes the freshly computed canonical quote to the existing order engine. It never relaxes price comparison.
3. Receipt persistence is outside the insert savepoint's validation catch. A deliberately injected database failure after order insertion proved the entire event, inventory reservation and order roll back; retry then succeeds once.

The Windows runner's `uv_os_get_passwd ENOMEM` arose in the restricted execution environment. Running the unchanged Node/tsx runner in the normal Windows user environment executed the complete suite successfully. No operating-system shim or test-pass monkeypatch was added.

Reproduce from the repository root in an authenticated normal user environment:

```powershell
node recovery/telephone/run-database.mjs
```

It reads the existing private disposable-state file from the local temp directory and refuses the known Production branch. The private file is not included in this change. From `frontend`, `npm run typecheck`, `npm run build`, and `node --import tsx ../recovery/telephone/browser.mts` reproduce the other checks. The database runner invokes the same `scripts/test.mjs` used by `npm test`, with the disposable URI only. Local live-provider calls are not enabled.

## Remaining external acceptance blockers

1. **Vercel access:** existing CLI credential and separately saved credential return HTTP 403 for the known project; the connected Vercel integration returns HTTP 404 for `prj_yivvHgKOBtNoQEN9eKhgKXToVSva` in team `team_jApqiQb5LcH7ezTGwK1D9IMg`. A team-access consent request has been initiated and requires the account owner to complete it. The browser connector also reports a closed transport. No replacement project was created.
2. **No current Preview:** no deployment of these changes exists or has been verified. The prior Preview is not evidence for this implementation. Restoring project access is necessary to inspect current settings, deploy the feature Preview against the isolated database, verify callback reachability and repeat acceptance there.
3. **Provider access/configuration unknown:** Telnyx/ElevenLabs account keys are unavailable through the currently denied environment access. Flag/secret presence is unknown, rather than proven missing. No test agent, Call Control app, trunk permissions, custom header propagation or provider logs were actually inspected in this continuation.
4. **SIP handoff:** official documentation supports the building blocks, but an actual API-accepted secret-header rule, destination route, REFER exchange, caller identity and uninterrupted audio have not been established. Direct SIP IDs cannot simply be used with Telnyx bridge commands. The handoff must fail closed if these identities differ.
5. **Actual playback and keypad semantics:** require provider evidence that client state correlates with the correct completed speech, the caller hears the entire review, and digits pressed during speech are not buffered into the later gather. Test retry/reordering behavior and audible saved-number receipt. No local contract test proves these facts.
6. **Approval:** real calls and any Production activation remain blocked pending explicit authorization. Restore and inspect Preview first. Production is additionally hard-blocked in the new adapter. No public routing changes, Production migrations, messages, calls, charges or deployments were made.

Provider setup and the precise real-call acceptance matrix are in [PROVIDER_SETUP.md](PROVIDER_SETUP.md). This implementation is new engineering derived from the recovered application. It is not the missing original `6de7172` snapshot. Preserved recovery artifacts and previous evidence remain unchanged.
