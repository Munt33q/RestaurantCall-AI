# RestaurantCall AI source recovery — phase 2

Recovery completed November 3, 2026, America/Chicago (November 4 UTC). This report records fresh recovery evidence and isolated verification. Historical development decisions remain documented in `E:\HACKATHONS\VOXO\docs\CHATGPT_PROJECT_HISTORY.md`.

## Outcome

A usable Next.js application, Conversation Relay service, monitor service, eight migrations, dependency locks, menu data and part of the original test suite were recovered in isolation. **All 113 files in the blueprint SHA-256 ledger match exactly.** No application business logic needed speculative reconstruction.

This is a recovery assembly with explicit provenance. **It is not the recovered Git commit `6de7172bae4e5c805c67c03265f4335aa3244e8b`.** That commit object, its ancestry and the original cloud checkout remain unavailable. Vercel commit metadata identifies other source references; matching file hashes establish file identity within the blueprint ledger, not Git ancestry or completeness of the entire historical repository.

| Item | Location / result |
|---|---|
| Original workspace | `E:\HACKATHONS\VOXO`, preserved |
| Recovery worktree | `C:\Users\munte\.codex\worktrees\restaurantcall-recovery-phase2\VOXO` |
| Recovery branch | `codex/restaurantcall-source-recovery` |
| Git base | `0cdb16ac4a748e9b94bda6a6621c084b2902fbe3` |
| Blueprint | `E:\HACKATHONS\RestaurantCall_AI_System_Blueprint.md` |
| Blueprint document SHA-256 | `582ea4b42d7d8d8300d86c252a5b3fb07e2887a9bbd38cf4b132061cc6ad2b56` |
| Exact ledger comparison | [113/113 matches](recovery-phase2/evidence/blueprint-final-comparison.json) |
| Per-file provenance | [file-provenance.json](recovery-phase2/evidence/file-provenance.json) |

Changes remain reviewable in the recovery worktree. They have not been merged, pushed or deployed.

## Vercel recovery

Existing local Vercel CLI authentication succeeded. The connected Vercel integration returned authorization/not-found failures for this project; those failures did not establish that deployments were absent. No environment-variable values were exported to the repository.

Project `restaurant-call-ai`, ID `prj_yivvHgKOBtNoQEN9eKhgKXToVSva`, team `team_jApqiQb5LcH7ezTGwK1D9IMg`:

- Enumerated all 44 deployments returned through pagination. All deployment IDs, times, states and available source references are in the [deployment index](recovery-phase2/DEPLOYMENT_INDEX.md).
- Inspected all 44 file/output inventories: 40 returned HTTP 200. Four returned 404: `dpl_CE7kdYwMdgMx91uVZx41Jx5emhCq`, `dpl_H7rwv1LqJNFFEy2GEAXtzzrz88uX`, `dpl_B38LQezw5D6bPhnUxSdSTYsubJm1`, `dpl_GfSDvfMaz5cBC93XLACMnCrtmYHn`.
- Latest listed deployment: `dpl_4Vjh5Rqzs2KSjxEMNCP3JdCzrfEp`, READY, hostname `restaurant-call-pfp6l2snf-vercel-1a62.vercel.app`. Metadata claims source `8d8781dd0ff9ff9165e7729626358d1017c2d5bb`, branch `feat/restaurant-sales-operations`, message “Remove invalid events field blocking Call Control relay start.” This metadata is not a recovered Git object.
- Recovered 128 original uploaded source files from that deployment. Of these, 111 are in the blueprint ledger and all 111 match.
- Recovered 28 additional original files from older retained deployments, choosing the newest available missing paths. This includes 17 historical test files and relay/monitor tooling. Most came from `dpl_F39g5YUs7fv3GexGLbmGozyuGhLN`.
- The Petra deployment metadata `dpl_DmRtgtDLkU85pXoztz2tv5p3Y9Xq` records source reference `9601e4c`, branch `feat/restaurant-sales-operations`, and the photo-menu/health-probe release.

The file-list API exposed retained `src/` uploads separately from output files. Each recovered source response was decoded from base64; **SHA-1 of the downloaded bytes equals its Vercel file UID**. SHA-256 values and byte lengths are recorded independently. These are original uploaded TypeScript and supporting files, not deminified JavaScript or inferred source maps.

The latest output inventory exposed five opaque serverless function identifiers. Attempting to retrieve a lambda identifier through the file-content API returned 404. No source-map filenames were exposed by the inspected inventories. This is a bounded artifact-access limitation, not proof that source maps cannot exist elsewhere. Original source uploads made decompilation unnecessary.

Evidence: [deployment list](recovery-phase2/evidence/vercel-deployment-list.json), [all file inventories](recovery-phase2/evidence/vercel-all-deployment-file-inventories.json), [latest metadata](recovery-phase2/evidence/vercel-latest_metadata.json), [128-file source recovery](recovery-phase2/evidence/vercel-source-recovery.json), [28 supplemental files](recovery-phase2/evidence/vercel-supplemental-source-recovery.json), [lambda retrieval probe](recovery-phase2/evidence/vercel-serverless-artifact-probe.json).

## Source provenance and reconstruction boundary

All 156 original Vercel source downloads are preserved unchanged under `docs/recovery-phase2/originals/vercel/<deployment-id>/<path>`. The active recovery assembly differs from those originals only as documented below.

| Provenance | Applied files / meaning |
|---|---|
| Deployed-artifact recovery, uploaded original source | 153 active files retain the exact downloaded bytes. Includes the recovered Next.js runtime, migrations, manifests, lockfiles and monitor source. |
| Exact blueprint extraction | `relay/index.ts`. The older Vercel relay version remains preserved separately. The extracted version exactly matches ledger SHA-256 `8acd5e6af439a580d47592f48a8d00cab65f884b2662646b28f77f1b9cb92149`. |
| Reconstructed adaptations of historical tests | `frontend/tests/operations.test.ts`: supplied the later notification-consent fields in a mocked order. `frontend/tests/database.integration.test.ts`: supplied the later optional-notes checkout turn. Original tests remain archived unchanged. |
| Reconstructed verification | Three `*.recovery.*` test files, `recovery/` audit/runner tools, recovery ignore/byte-preservation rules, this report and collected evidence indexes. These are new verification work, not original historical source. |
| Original old baseline | Untouched legacy files inherited from `0cdb16a`, including the old Python backend and old release reports. Their presence is not evidence that they belong to the recovered newer deployment. |

The complete manifest records current hashes, source hashes, deployment/file UIDs, original-copy paths, blueprint matches and modification reasons. Generated dependencies/build output are excluded. The self-manifest is explicitly excluded from hashing itself. Recovery-only `.gitattributes` disables Git line-ending conversion for recovered source and preserved originals so later checkouts retain their exact bytes; 156 path rules were checked. The exact blueprint ledger is retained as `recovery/blueprint-ledger.json`; `python recovery/audit-provenance.py` rechecks every ledger file and every archived Vercel download.

No runtime import or dependency had to be guessed to achieve the successful builds. Next.js 14.2.35, React 18.3.1, TypeScript 5.7.2 and service dependency locks came from retained source. Services depend on `@neon/functions` 0.11.0. The local host runs Node 26.13.0; service bundles target Node 24. Successful local builds do not substitute for execution on Neon’s runtime.

## Neon read-only inspection

Project `dawn-haze-46256314`; production branch `br-patient-flower-b8mm4pad`; database `CALLAI`.

Production SQL ran inside explicit read-only transactions and selected schema/catalog information and migration names/hashes only. No customer rows, caller records, transcripts or order contents were selected or copied.

- 25 public tables were identified.
- All eight `app_migrations` entries match the recovered SQL files’ SHA-256 values.
- Applying all eight migrations to a fresh test database produced the same tables, columns, constraints and indexes as the production metadata snapshot.
- This is schema compatibility evidence, not production data correctness, migration-upgrade testing with customer records, or validation of every database role/privilege.

| Function | Active/current deployment observed | Runtime / status |
|---|---|---|
| `restaurantrelay` | 10; created November 3, 2026, 17:33:01 UTC | `nodejs24`, completed |
| `modelwatch` | 1; created November 2, 2026, 12:31:47 UTC | `nodejs24`, completed |

The supported Neon function list/get responses expose current and active deployment metadata. The inspected official API specification exposes deployment creation, but no documented source/bundle download or prior-deployment listing operation. A read-only GET on the deployments path returned 405. No upload, redeployment or environment change was attempted. **Active Neon bundle bytes were not recovered or compared.** Relay and monitor source recovery instead comes from Vercel originals and the exact blueprint relay extraction.

Evidence: [functions](recovery-phase2/evidence/neon-functions.json), [function API contract](recovery-phase2/evidence/neon-function-api-contract.json), [production migration metadata](recovery-phase2/evidence/neon-production-migration-metadata.json), [migration checksum comparison](recovery-phase2/evidence/migration-checksum-comparison.json), [schema comparison](recovery-phase2/evidence/neon-schema-structure-comparison.json).

## Historical execution environment

The recorded path `/workspace/scratch/97a636ad2eaa/restaurant-sales` refers to the original cloud execution environment. It was not treated as a Windows path.

Supported current-task attachments, available conversation history and the known original/archived local Codex tasks were investigated. They did not provide the newer cloud checkout or a supported mount/export. ChatGPT/archived-ChatGPT listing was unavailable for the signed-in account; browser initialization also failed. Local task `01a194a1-bfe9-7fd0-9fa0-380b3a99e669` contains earlier baseline work. Archived local task `01a1a43f-0fd2-73d3-802a-8fdb62892c5e` identifies the already audited blueprint-derived experiment.

This does not establish that the original cloud environment was deleted. No supported export was available in this session. The earlier shared-conversation HTTP recovery succeeded and remains documented in the original project-history report. Exhaustive drive and GitHub scans were not repeated in phase 2. See the [bounded workspace assessment](recovery-phase2/evidence/historical-workspace-assessment.json).

## Isolated verification

Dependencies were installed from recovered locks using `npm ci --ignore-scripts --no-audit --no-fund` in frontend, relay and monitor. Tests and the local Next server were run without live provider credentials. Synthetic callback signatures were generated locally. No actual Stripe charge, Telnyx command, outbound message, model request or phone call was required.

| Check | Result | Evidence |
|---|---|---|
| Frontend TypeScript | Passed | [typecheck log](recovery-phase2/evidence/typecheck-final.log) |
| Offline unit run | 108 cases: 106 passed, 0 failed, 2 DB-dependent skips | [unit log](recovery-phase2/evidence/unit-final.log) |
| Actual disposable Neon integration | 2 passed, 0 failed, 0 skipped | [guarded integration log](recovery-phase2/evidence/database-integration-final-guarded.log) |
| Next.js production build | Passed | [build log](recovery-phase2/evidence/next-build.log) |
| Relay Node-24 bundle | Passed from repository root | [build results](recovery-phase2/evidence/build-results.json) |
| Monitor Node-24 bundle | Passed | [monitor log](recovery-phase2/evidence/monitor-build.log) |
| Local built-server HTTP verification | Passed | [HTTP result](recovery-phase2/evidence/local-http-smoke-result.json) |
| Blueprint file identity | 113/113 exact matches after builds | [final comparison](recovery-phase2/evidence/blueprint-final-comparison.json) |

The two real-database integration tests prove concurrent confirmation idempotency, cash order creation, kitchen response/status transitions, stock reservation once, card pending/paid/expiry transitions, duplicate synthetic Stripe-event handling, and retryable jobs without provider configuration. The new two-distinct-item scenario requires review and confirmation and produces one order, two lines, total 1,946 cents, and stock 9/9 after three duplicate confirmations.

The HTTP test runs the compiled Next server on an ephemeral loopback port. It verifies unauthenticated orders/relay rejection (401), unsigned voice rejection (401), foreign-Origin login rejection (403), valid credential login (303), signed voice/gather handling, authenticated order retrieval, and the same two-item/concurrent-confirmation result. Successful login uses the supported non-browser request without an Origin header; browser same-origin sign-in was not verified. Provider-free health deliberately returns 503 with database/restaurant ready and required provider settings absent. Explicit item-name commands exercise deterministic speech handling; this does not establish natural-language model quality.

Initial verification failures are retained and explained: an older checkout fixture omitted the later notes phase; a reused synthetic database collided on the historical fixed `cs_fixture` identifier; the relay script was first invoked from the service directory instead of repository root. The guarded runner now requires a fresh migrated `recovery_*` database before executing the retained integration fixtures. HTTP fixture readiness/origin/item-command issues were corrected in recovery tooling only. No ledger-listed runtime file was changed to obtain a pass.

### Disposable database lifecycle

Created only `br-wandering-grass-b87yx3w5`, name `codex-recovery-phase2-20261103`, requesting `init_source: schema-only`. Neon reported `parent-schema`; it is a detached schema copy and does not retain a `parent_id` in its later GET response. The copied 25 tables were verified empty before testing. Fresh databases `recovery_phase2_clean` and `recovery_phase2_final` were created within that branch for migrations and synthetic fixtures.

After all tests, this branch was deleted. The subsequent branch GET returned 404. [Deletion confirmation](recovery-phase2/evidence/neon-disposable-branch-deletion-confirmation.json) and the [empty-table check](recovery-phase2/evidence/neon-disposable-empty-schema.json) are retained. No production database/branch was deleted or modified.

### Reproducing verification

From the recovery worktree, install dependencies as above. The following commands require no production provider credentials:

```powershell
python recovery/audit-provenance.py
npm --prefix frontend run typecheck
npm --prefix frontend run test:unit
npm --prefix frontend run build
node relay/build.mjs
node frontend/node_modules/esbuild/bin/esbuild monitor/index.ts --bundle --platform=node --target=node24 --format=esm --outfile=monitor/dist/index.mjs
```

For database tests, create a new schema-only disposable Neon branch, create a fresh `recovery_*` database and apply `frontend/scripts/migrate.mjs` using that database URL only. Obtain its connection URI for the exact disposable branch via the Neon API. Supply JSON `{uri,branchId,disposableConfirmed:true}` through stdin to `node recovery/run-db-tests.mjs`; never write credentials into a tracked file. Branch-ID confirmation and database naming are guardrails; the runner does not independently authenticate branch identity through Neon’s API. It also rejects a database already containing restaurants/orders because the original payment fixture uses fixed identifiers. Supply `{uri}` through stdin to `node recovery/http-smoke.mjs` for local HTTP checks. Delete only that disposable branch when finished.

The recovered `npm test` includes `live-model-chain.test.ts`, which targets a production URL by default. It was intentionally not run. Use `test:unit` for the offline suite. Next may regenerate the non-ledger `next-env.d.ts`; the recovery assembly preserves its original uploaded bytes after verification.

## Remaining gaps and takeover gates

- Original checkout, commit `6de7172...`, complete Git lineage and a supported cloud workspace export are unavailable.
- Of 39 test/helper paths listed by the blueprint, 17 original test files were recovered; 22 paths remain missing. Their exact names are listed in [historical test-source coverage](recovery-phase2/evidence/historical-test-source-coverage.json). The earlier 180-test historical claim has not been reproduced. New recovery tests cover selected later requirements, not the entire missing suite.
- Neon active relay/monitor bundles and prior-deployment artifacts were not downloadable through the inspected supported API. Source identity does not prove current deployed bundle equivalence.
- Browser rendering and browser sign-in, actual Node-24 Neon execution, live model/fallback latency, real Stripe sandbox service exchange, outbound notification delivery and PSTN audio remain outside these isolated tests.
- The latest historical release boundary still requires uninterrupted telephone review playback and an explicitly marked order reaching the kitchen before public real ordering. That acceptance was not inferred from builds or simulated callbacks. SMS historical release restrictions remain relevant until freshly verified.

The source-recovery dependency for continuing local engineering is now substantially resolved. The next engineering work can use this verified assembly to restore missing regression coverage and investigate the telephone acceptance gap. Any deployment, production test order, routing change or public release needs its own explicit authorization and a concrete acceptance plan.

## Preservation and data handling

The original workspace’s 143 pre-existing non-documentation files were checked against the phase-one preservation snapshot: zero changed. Its pre-existing dirty ignore file and untracked checkout handler remain untouched. Recovery-only source work is confined to the attached recovery worktree; original-workspace changes in this phase are documentation pointers.

Production SQL retrieved schema/migration metadata only. Known Vercel/Neon credential bytes were checked in memory against recovery source, originals, evidence and tooling: no matches. No environment files or production customer rows were copied into the recovery tree. Build output and dependency directories are ignored. Evidence: [source preservation](recovery-phase2/evidence/original-workspace-preservation.json), [sensitive-content audit](recovery-phase2/evidence/sensitive-content-audit.json).
