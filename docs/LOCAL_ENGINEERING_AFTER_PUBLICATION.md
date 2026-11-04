# Local engineering after source publication

GitHub publication succeeded to `Munt33q/RestaurantCall-AI`, branch `recovered/restaurant-sales-2026-11-03`, at **`3aa6961b6500abc6a09da2d7cdbd2be6cdc40e72`**. Remote refs and GitHub's comparison API verified the exact HEAD and both ancestors: recovery checkpoint `98ecf05dfe10dc1a39344a64211ff92878190c26` and engineering commit `89716026293334ff63a07edcfbc4dd829a7a9db5`. Public `master` remains `0cdb16ac4a748e9b94bda6a6621c084b2902fbe3`.

The user approved a separate cache/evidence cleanup commit, superseding the earlier requirement for publication HEAD to equal `8971602`. Automatic approval review initially blocked publication of archived metadata under source-only authorization. After a concrete disclosure of deployment/schema/OIDC claim metadata, author emails, synthetic screenshots and expired fixture tokens retained in history, the user explicitly approved publishing the listed evidence to the public branch. The same push then succeeded; no rejection or secret protection was bypassed.

## New local work

`recovery/phase3/model-acceptance.mts` and its contract helper prepare the remaining real-model acceptance gate. This is new support code, not original recovered source. No application runtime imports it. These changes and their evidence are **local only**; the published branch remains at the publication commit above.

The tool requires explicit dedicated `ACCEPTANCE_*` credentials, strips inherited application/database/signing/payment/telephone credentials, runs model monitoring in test mode and never persists an order. Its nine synthetic scenarios cover compound additions, ambiguity, offered-choice context, quantity replacement, price accuracy, allergen uncertainty, injection, stock availability and Spanish response preference. Primary mode requires actual successful primary HTTP interpretation. Fallback mode simulates primary 503s on loopback and requires actual fallback HTTP interpretation. Both modes reject deterministic parsing as proof of real-model success.

Instructions and limits: `recovery/phase3/MODEL_ACCEPTANCE.md`.

## Verification

| Check | Result |
|---|---|
| Full guarded offline suite | 161 tests; **151 passed, 0 failed, 10 skipped**. The existing nine DB cases and unconfigured local model probe remain skipped. See `phase3/evidence/unit-after-publication.log`. |
| New tool regressions | Six passed. Includes an actual interpretation/cart-engine traversal of all nine scenarios with mocked provider replies. This validates the harness, not a real provider. |
| Missing-configuration guard | Exited 2 before any requests, without credential output. See `phase3/evidence/model-acceptance-preflight.json`. |
| Typecheck | Frontend typecheck and standalone acceptance-runner TypeScript compilation passed. |
| Production build | Passed locally without provider/database credentials; no deployment. See `phase3/evidence/build-after-publication.log`. |

Real FlatRouter/DeepSeek acceptance remains **unrun** because dedicated approved credentials are unavailable. Automated text assertions are narrower than human conversation review. Real Telnyx playback, actual Stripe callback delivery, operations scheduling, staff identity and data lifecycle decisions remain open as documented in `DEPLOYMENT_READINESS_PHASE3.md`. Existing real disposable-database and browser results were not repeated because application runtime and schema were unchanged.

No provider setting, live routing, production record, payment configuration or customer messaging changed. Production release remains on hold. No subsequent commit may be pushed without reporting it to the user.
