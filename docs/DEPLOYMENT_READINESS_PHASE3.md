# RestaurantCall AI — phase 3 deployment readiness

Investigation and verification: November 3, 2026, America/Chicago, continuing into November 4 UTC. All implementation changes are isolated in `C:\Users\munte\.codex\worktrees\restaurantcall-recovery-phase2\VOXO`, branch `codex/restaurantcall-source-recovery`.

**Decision: hold production release.** The recovered application now has broader regression and browser verification, and three concrete defects were repaired. Real FlatRouter conversation quality and live Telnyx full-review playback acceptance still require provider access and a dedicated acceptance environment. Nothing in this report authorizes deployment or public telephone/order activation.

## Source identity and preservation

Checkpoint **`98ecf05`** preserves the complete phase-2 recovery assembly. Its 113 blueprint-ledger files matched before engineering changes. This is **not** original commit `6de7172bae4e5c805c67c03265f4335aa3244e8b`; that Git object and its ancestry remain unavailable.

The checkpoint, [phase-2 report](SOURCE_RECOVERY_PHASE2.md), archived uploaded originals and phase-2 provenance manifest remain intact. Engineering changes have separate [delta provenance](phase3/evidence/phase3-provenance.json) and [blueprint comparison](phase3/evidence/blueprint-delta.json). The active tree retains 105 of 113 exact blueprint hashes; eight runtime files have intentional engineering changes. All 113 checkpoint hashes still match, and all 157 archived original artifacts reverified unchanged. The phase-3 audit also checks changed artifacts for exact matches to supplied provider keys and the Vercel CLI token.

All 22 missing historical test/helper paths now exist. They are **reconstructed from documented behavior**, not recovered historical bytes. The three `sip-*` tests exercise shared checkout/language safeguards; they do not claim to restore or test the missing managed SIP trial runtime. Petra tests establish recovered dataset consistency, not independent verification of the original photographs.

## Changes delivered

| Change | Evidence and resulting behavior |
|---|---|
| Unicode playback acknowledgement | A failing regression showed that different Arabic strings and missing Hindi playback could satisfy the old ASCII-only comparison. Shared `playbackMatches` retains Unicode letters, marks and numbers, requires a nonempty expected transcript, and is used by both controller and authoritative acknowledgement endpoint. Wrong delivery IDs and incomplete/incorrect playback remain insufficient. |
| Acceptance-ticket isolation | `isTest` reaches the order API. Test tickets have a separate kitchen filter, no normal kitchen metrics/actions, no server-authorized kitchen advancement, no cash-collection action, and independent suppression at notification enqueue and dispatch. Malformed consented test jobs are still suppressed. |
| Simulator completion | The UI previously treated a fallback `<Hangup>` after a live `<Gather>` as immediate completion. It now requires a terminal response without Gather/Connect. Browser testing reproduced the premature end and verified the complete repaired checkout. |
| Test execution safety | The default runner strips inherited production database/provider credentials. Database tests require an explicit `recovery_*` URI and nonproduction branch declaration. The historical live-health test no longer defaults to a production endpoint; it requires an explicit local target. |

Acceptance tickets still reserve inventory under the recovered order contract. The staff simulator intentionally creates ordinary demo tickets and reserves inventory. Both must use a dedicated synthetic tenant/database for acceptance; these changes do not promise inventory isolation in a live restaurant. Broader SQL analytics still include recorded test orders.

## Verified results

| Check | Result | Evidence |
|---|---|---|
| Complete default test suite | 155 tests: 145 passed, 0 failed, 10 intentionally skipped (nine DB cases plus the unconfigured local live-model probe) | [log](phase3/evidence/unit-final.log) |
| Fresh real Neon database integration | 10 cases passed, 0 failed, 0 skipped; includes one SQL-free preflight case and nine database cases | [log](phase3/evidence/database-final.log) |
| Browser E2E against local production build | 12 workflow checks passed; no page errors | [result](phase3/evidence/browser-result.json), [log](phase3/evidence/browser-run.log), [test-ticket screenshot](phase3/evidence/browser-test-orders.png) |
| TypeScript | Passed | [log](phase3/evidence/typecheck-final.log) |
| Next production build | Passed | [log](phase3/evidence/next-build-final.log) |
| Relay and monitor bundles | Built for Node 24, without deployment | [relay](phase3/evidence/relay-build-final.log), [monitor](phase3/evidence/monitor-build-final.log) |
| Actual local HTTP timeout and cancellation | Primary deadline elapsed, independent fallback extracted both items, pre-cancellation started no requests | [runtime log](phase3/evidence/runtime-contract-final.log) |
| Deployed relay/monitor negative probes | Relay health 200; invalid relay token 401; monitor GET 405; untrusted monitor POST 401 | [results](phase3/evidence/read-only-runtime.json) |
| Stripe sandbox and signatures | Real test-mode Checkout creation and hosted 4242 test-card completion passed; local signed-webhook checks passed | [results](phase3/evidence/stripe-sandbox-result.json) |

The 12 browser checks cover unauthenticated redirect, failed login, successful login/dashboard, menu creation and availability, two-item ordering through name/payment/consent/review, explicit submission, kitchen progression, cash receipt, call transcript drawer, analytics and test-ticket isolation. They use a fresh Playwright Chromium context, synthetic records and `localhost`; they do not attach an authenticated personal browser or contact the demo phone line.

Database assertions include concurrent duplicate confirmation reserving stock once, paid-card gating, expiry releasing inventory, tenant/version checks, foreign promotion rejection, quote-change rollback, free-order handling, reviewed catalog replacement, one-time concurrent draft recovery, caller/token scope, expiry cleanup, disabled-feature consent withdrawal, daily recovery submission cap, notification dedup/suppression and durable voice-event reconciliation. Every message transport used by these tests is injected and fake.

## Model configuration and limits

Read-only Vercel inspection confirmed `AI_MODEL=gpt-6-luna`, fallback enabled with `deepseek-flash`, primary timeout 3000 ms and fallback timeout 10000 ms. Production SMS is disabled; outbound updates and relay/live voice are enabled. [Configuration evidence](phase3/evidence/current-model-and-flags.json).

Sensitive Vercel entries are masked; an empty returned value does not mean the deployed configuration is absent. The supplied credential document contains Twilio, Neon and Stripe material, but no usable FlatRouter, DeepSeek or Telnyx key was recovered from it. The original local frontend environment contains no model/provider key. Exhaustive drive/GitHub searches were not repeated.

**Real FlatRouter interpretation and conversation-quality acceptance were not run.** Existing mocked tests and the new real-HTTP fixture prove local validation, fallback, deadline and cancellation behavior; they cannot establish the actual upstream model's latency, availability or dialogue quality. No authenticated production health probe was invoked because it can write model-monitoring records.

Required next step: supply approved provider credentials to an isolated local/staging process and run synthetic multi-turn menus, compound edits, ambiguity, allergy questions, injection attempts, interrupted checkout, fallback outage and language-preference scenarios. Require genuine successful provider-attempt evidence; deterministic parsing alone must not pass a model-health probe.

## Neon relay, monitor and Telnyx acceptance

Read-only Neon metadata still identifies `restaurantrelay` deployment 10 and `modelwatch` deployment 1, Node 24. The relay health build label is `duplex-v1`. The active bundle bytes remain unavailable, so locally tested source is not asserted to be byte-identical to those deployments. [Metadata](phase3/evidence/neon-current-functions.json).

Tests exercise the actual relay handler with the real Neon SDK and a simulated WebSocket platform bridge: signed JWT verification, setup call identity, setup-before-prompt, duplicate nonce rejection, complete/partial playback and interruption callbacks. Actual PostgreSQL tests exercise the action endpoint's connection claim, authoritative Unicode acknowledgement, stale grants, revision invalidation and one idempotent reconnect. This is contract evidence, not a successful real Telnyx call.

The monitor uses Neon's trusted trigger header plus matching invocation ID and schedule name. A preliminary local test incorrectly treated hand-injected trigger headers as a production vulnerability; that hypothesis was rejected after consulting Neon's official gateway contract. Neon strips client-supplied `X-Neon-*` headers at its edge. **No additional monitor secret requirement or monitor source change was retained.** Local negative/positive tests reflect that documented boundary; the production negative probe carried no forged trusted metadata and did not invoke model health. [Contract evidence](phase3/evidence/provider-contracts.json).

Current official Telnyx documentation matches `setup.callSid`/`callControlId`, final `prompt`, eager turn, resumed turn, DTMF and `interrupt.utteranceUntilInterrupt` fields. The Call Control start schema does not expose the TeXML `events` parameter. The inspected guide does not document the `info/tokensPlayed` and `info/agentSpeaking` acknowledgements required by this application's checkout. That absence is not proof that Telnyx cannot provide them; it leaves the historical acceptance gap unresolved. [Documentation comparison](phase3/evidence/telnyx-relay-contract.json).

**Do not bypass the review gate, infer playback from elapsed time, or acknowledge a review merely because text was sent.** Before release, obtain a provider-supported playback contract or a controlled owned-line trace demonstrating complete review proof, interruption invalidation and confirmed order-number playback. The recovered Call Control configuration currently starts English transcription; multilingual text-policy tests do not prove Spanish/Arabic/Hindi speech acceptance. Public routing was not changed and no real call was placed.

## Stripe and notifications

The supplied `sk_test_*` key authenticated to Stripe. Tests call the actual recovered `runPaymentJobs`, create a $1.08 sandbox Checkout with matching order metadata/currency, verify `livemode=false`, check job idempotency, and expire unpaid sessions during cleanup. **Hosted Checkout completed successfully with Stripe's published 4242 test card**, and the provider API confirmed the sandbox session as paid. No real card was used. Optional Link enrollment was disabled; no phone number was supplied. Earlier unpaid diagnostic sessions were expired; the final paid test session remains a synthetic Stripe sandbox record.

The local webhook server uses a random local signing secret and the real Stripe SDK. Missing, stale and body-tampered signatures are rejected. A valid signature with a wrong amount cannot mark the order paid. A correctly bound completion fixture is applied once across duplicate deliveries. **Those events are locally signed fixtures, not webhooks delivered by Stripe.** Real provider-to-app delivery still needs an approved isolated callback destination and matching endpoint secret. No public webhook configuration was changed.

Consent, STOP/suppression, status receipts, recovery withdrawal and daily caps are covered through policy and database tests. The notification tests make zero real customer submissions. No delivery success, registration approval or real recipient receipt is inferred from mocked provider acceptance.

The deployed Vercel operations schedule is `0 6 * * *` (daily), with immediate work attempted on server events. Neon separately has an enabled `model-health-every-minute` trigger with `* * * * *`. The frequent model monitor does not provide frequent payment/recovery processing. [Vercel schedule](phase3/evidence/scheduler-provider.json), [Neon schedule](phase3/evidence/neon-trigger-metadata.json).

## Remaining release gates and approvals

| Gate | Needed evidence or decision |
|---|---|
| Real model chain | Isolated FlatRouter/DeepSeek credentials; real synthetic conversation and failure evidence. |
| Live voice review acceptance | Telnyx read access and a dedicated approved acceptance line/application or provider trace. Prove full review and receipt playback without weakening safeguards. A call that reaches the live backend can write production records and requires explicit approval. |
| Provider-to-app sandbox webhook | Approved isolated callback endpoint and sandbox webhook secret; verify actual Stripe delivery, retries and payment completion rather than only local signatures. |
| Operations recovery timing | Choose and provision an operations schedule appropriate for two-minute retries, payment reservations and draft expiry; verify plan support and scheduler failure monitoring. No active cron change is included. |
| Staff access | Shared staff credentials still lack individual identities and durable login throttling. Select production identity/access controls or independently verified gateway protections before broad staff access. Successful local login tests do not close this gap. |
| Data lifecycle | Seven-day transcript visibility is not automatic database deletion. Confirm retention/deletion requirements and provision approved cleanup. No production records were inspected or deleted. |
| Acceptance isolation | Use a separate test tenant/database; test tickets still reserve stock and contribute to some analytics under the recovered contract. |
| Release authority | Deployment, production schema/configuration changes, telephone routing, public ordering activation and customer messaging require explicit approval. No production release approval is requested while these gates remain open. |

Local Node is 26.13.0 and service bundles target Node 24. Builds do not prove deployed-runtime execution or comprehensive dependency/security certification. No migrations, provider environment variables, public routing or production application data were changed.

## Evidence and repeatability

`recovery/phase3/` contains guarded provisioning/runners, browser and Stripe verifiers, provider diagnostics and a separate provenance audit. Temporary connection credentials were kept outside the repository and removed after testing. Original recovery tooling and phase-2 evidence are preserved. The phase-3 disposable branch `br-soft-leaf-b87ops6p` was deleted and a follow-up GET returned 404. [Cleanup evidence](phase3/evidence/disposable-cleanup.json).

Earlier diagnostic failures are retained as evidence: the Unicode regression failed before the fix; a relay fixture initially omitted a required delivery-turn field; byte-identical JWT comparison was corrected to compare verified grant semantics because JSONB may reorder keys; browser harness waits were corrected to await actual responses; an initial local monitor-auth hypothesis was rejected by the official platform contract. Final logs above distinguish application defects from test-harness corrections.
