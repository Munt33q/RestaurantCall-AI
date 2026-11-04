# RestaurantCall AI: Phase 4 voice experience verification

Recorded November 4, 2026. Safe engineering and isolated verification are complete for this feature branch. **Production release remains on hold. Brittany identity/audio, real model acceptance and real telephone playback are not verified.** This report does not claim full voice acceptance or completion of those external gates.

Work is on `codex/phase4-voice-experience`, based on `48d4d27b43d5acfcfb92e7beac8256b166084dea`. That previously local ancestor adds the synthetic model acceptance harness and is included in the feature publication. The published recovery branch remains `recovered/restaurant-sales-2026-11-03` at `3aa6961b6500abc6a09da2d7cdbd2be6cdc40e72`. No force push or merge into master is part of this work. Final publication identity is returned with the GitHub push result; this report is committed within that result.

## Confirmation loop: reproduction and repair

The initial four regression cases produced **three failures and one pass before implementation**: [confirmation-before.txt](phase4/evidence/confirmation-before.txt). These reproduce local failure mechanisms; they are not a captured PSTN diagnosis.

| Reproduced mechanism | Resulting behavior | Repair |
|---|---|---|
| Same final speech retained without an optional caller-speaking event | Repeated `confirm` discarded after review playback | One successfully acknowledged review permits the next same affirmative; simultaneous duplicates remain suppressed |
| Complete playback tokens arrive after speaker-off | Review remains unacknowledged | Reconcile on both event types, requiring full matching text and speaker stop |
| `place it` not mapped to final confirmation | Valid intent cannot advance checkout | Phase-bound affirmative handling, including five-language equivalents and negation safeguards |
| Missing/incomplete playback | Checkout blocked, as required | Preserve this block and issue a fresh tracked review on retry |

The controller no longer treats arbitrary waiting speech as review playback. It rejects stale queued finals after interruption, invalidates interrupted deliveries and does not end the call when backend acknowledgement fails. The action route returns a negative acknowledgement for mismatched delivery identity or text. Interrupting a delivery revokes its identity so a late full-text acknowledgement cannot revive it.

Review readiness uses an explicit full-review marker instead of an English phrase match. Quote changes, unavailable items, missing playback and unrecognized confirmation have separate rejection reasons. Logs record reasons/phase/turn without copying caller speech. Database order insertion, stock reservation, revision/connection identity and quote validation remain authoritative. Completed orders retain an immutable receipt; retries replay the same order number and do not insert another order. Receipt playback remains independently acknowledged.

The focused intermediate after-run passed 27 cases; the final complete suite includes later interruption, transport and language regressions. See [confirmation-after.txt](phase4/evidence/confirmation-after.txt), [unit.txt](phase4/evidence/unit.txt), and [database-final-relay.txt](phase4/evidence/database-final-relay.txt).

## Voice, language and conversation changes

Automatic waiting cues were the app-authored source of repeated thinking filler. They have been removed from the controller. The model prompt now requests short, warm replies without thinking preambles or repeated names. Known catalog availability, totals and unambiguous complete compound additions use deterministic menu/state answers. Ambiguity, unsupported modifiers and uncertain interpretation still require clarification or model reasoning. Models do not author or recalculate financial review amounts.

English, Spanish, Arabic, Urdu and Hindi have app-authored checkout, review, consent, receipt, error and menu-response templates. Urdu is distinct from Hindi. Unicode aliases, native quantity words/digits and spoken/keypad language selection are covered. Preferences remain stable unless explicitly changed; language changes invalidate the previous review. Catalog names and requested notes remain supplied data, rather than invented translations. Native-speaker review, pronunciation and open-ended conversation quality remain unverified.

`ELEVENLABS_VOICE_PREFERENCE` accepts `legacy`, `bella` or `brittany`. Brittany requires the exact account voice ID and an explicit verified-language list; a missing ID, unsupported language or Bella substituted as Brittany fails configuration. **No Brittany ID was found or invented.** Historical Bella ID `hpp4J3VqNfWAUOO0d1Us` is retained for rollback. The current default model remains `eleven_flash_v2_5`; this implementation refuses that Brittany/model selection for Urdu.

`VOICE_LANGUAGE_PROFILES_JSON` holds explicit per-language synthesis/recognition profiles and evidence references. Empty is the safe default. A profile is a release declaration, not proof of recognition or audio quality. English Flux cannot be reused as a non-English profile, and Urdu rejects Flash/Turbo v2.5 profiles. The Call Control start payload supplies declared profiles; dynamic language frames change both STT and TTS fields before subsequent speech. Simulated relay tests verify message order, not provider acceptance.

The durable relay grant records `call-control` versus `texml`; cross-transport reuse is rejected. Non-English activation requires the configured Call Control path. The older TeXML/Gather paths cannot activate those profiles and remain blocked from claiming multilingual support. TeXML's hardcoded voice configuration is not claimed to support Brittany. The five-language greeting is present behind the existing language feature flag; its actual pronunciation and recognition behavior are unverified. It deliberately does not introduce the assistant as Brittany before that identity is verified.

No production setting was changed. [frontend/.env.example](../frontend/.env.example) retains legacy voice selection, language selection disabled and empty language profiles. For a later isolated acceptance environment, verify the account voice, selected model, recognition model and language codes, then supply the exact Brittany settings and profile evidence. For Bella rollback use `ELEVENLABS_VOICE_PREFERENCE=bella`; remove unaccepted profiles and disable language selection. Applying any production configuration still requires explicit approval.

## Verification evidence

| Check | Result and scope |
|---|---|
| Final offline suite | **194 cases: 183 passed, 0 failed, 11 skipped**. Skips are database prerequisites and the unconfigured actual-model probe. [unit.txt](phase4/evidence/unit.txt) |
| Database migrations and full integration suite | Eight migrations applied to a fresh empty database on a disposable Neon branch; **11/11 passed**. Concurrency, quotes, stock, payment lifecycle, recovery, notifications and receipt behavior covered. [database.txt](phase4/evidence/database.txt) |
| Final affected database checks | **2/2 passed** after the final interruption/transport changes. Real action route/controller, missing and late proof, one order/stock reservation, receipt retry, stale acknowledgement rejection and durable transport binding. [database-final-relay.txt](phase4/evidence/database-final-relay.txt) |
| Browser | **12/12 workflow assertions passed**, no page errors, using isolated Playwright Chromium and synthetic data. Login protection/invalid login, dashboard, menu creation/availability, ordering/review/cash confirmation, kitchen lifecycle, receipt, calls/transcript, analytics and acceptance-ticket isolation. [browser-result.json](phase4/evidence/browser-result.json) |
| Five-language text/controller scenarios | Five synthetic conversations: early confirmation blocked, late proof followed by the same affirmative advances, one simulated commit each, no repeated filler. Actual recognizer, synthesizer, model and telephone were not used. [conversations.json](phase4/evidence/conversations.json) |
| Model timeout/fallback | Actual loopback HTTP stalled-primary timeout at approximately 500 ms and successful synthetic fallback with validated cart edit. This verifies timeout/fallback plumbing, not FlatRouter or DeepSeek intelligence. [unit.txt](phase4/evidence/unit.txt) |
| Actual model probe | Preflight **exited 2 before requests** because dedicated acceptance credentials were unavailable. [model-acceptance-preflight.txt](phase4/evidence/model-acceptance-preflight.txt) |
| Typecheck and builds | Frontend TypeScript, Next.js production build, relay and monitor Node 24 target bundles passed. Local runtime: Node 26.13.0. No service deployment. [verification.json](phase4/evidence/verification.json) |
| Provenance/publication audit | Original recovery checkpoint and archived bytes checked separately from new engineering changes; changed files hashed, supplied credentials and high-confidence secret patterns scanned. [provenance.json](phase4/evidence/provenance.json) |

Local deterministic turn latency in the five synthetic scenarios: median **0.107 ms**, maximum **23.392 ms**. These exclude database, network, model, recognition, synthesis and telephone time. They must not be reported as real conversation latency. Browser timing is also not voice latency.

An attempted full rerun on an already-used test database hit static fixture provider-ID collisions. A fresh empty database was created on the same disposable branch and the full suite passed. A subsequent extra test initially closed the singleton fixture connection before the next test; combining those checks within the fixture lifecycle fixed that test-only issue. Earlier diagnostic logs are retained and explicitly superseded by the final passing evidence; neither failure is presented as production behavior.

The branch `br-solitary-dream-b82g5d2t`, including its synthetic databases, was deleted after verification. A follow-up read returned HTTP 404; the temporary credential file was removed. [disposable-cleanup.json](phase4/evidence/disposable-cleanup.json). No production customer data was copied into the repository or the test database.

## External release gates still open

| Gate | Exact missing evidence |
|---|---|
| Brittany identity and voice quality | No usable ElevenLabs account credential; exact Brittany catalogue ID, model/language support, synthesized samples, warmth/pacing/pronunciation and human audio review remain unverified |
| Actual interpretation and conversation quality | No usable dedicated FlatRouter/DeepSeek acceptance key; Vercel primary model value encrypted/unreadable, fallback value returned `deepseek-flash`; primary identity and real response quality/latency not verified |
| Five-language voice support | No live recognizer/synthesizer acceptance for any new profile; Urdu needs a separately accepted STT/TTS combination. No silent Hindi substitution or claimed verified fallback |
| Telnyx financial review playback | Current Call Control documentation retrieved during inspection does not establish the `info/tokensPlayed` plus `info/agentSpeaking` proof required by checkout. Actual event formats, complete review playback, interruptions and receipt acknowledgement require a controlled trace; missing evidence continues to block checkout |
| Real speech transport and reconnect | Local signed identity/replacement/reconnect tests passed; deployed Neon/telephone interoperability, reconnect audio and final receipt delivery remain unverified |
| Existing Phase 3 release gates | Actual Stripe sandbox provider delivery, scheduler/notification acceptance, staff identity and data lifecycle decisions remain governed by [DEPLOYMENT_READINESS_PHASE3.md](DEPLOYMENT_READINESS_PHASE3.md); synthetic payment tests do not replace them |

Read-only provider findings: [provider-inspection.json](phase4/evidence/provider-inspection.json). Official Telnyx references inspected were the [Conversation Relay guide](https://developers.telnyx.com/docs/voice/programmable-voice/conversation-relay.md), [Call Control start API](https://developers.telnyx.com/api-reference/call-commands/start-conversation-relay.md), and [Sukhan reference](https://developers.telnyx.com/docs/voice/tts/providers/telnyx/sukhan.md). These establish configuration candidates, not account entitlement or PSTN acceptance. Documentation body hashes/statuses are recorded; no full third-party documents are published. ElevenLabs/Deepgram documentation requests returned 403 in this environment.

The authenticated browser integration was unavailable under the current Work settings. Native Edge inspection was stopped when URL permission could not be established. Local Playwright supplied the isolated browser coverage. No actual telephone call or audio sample was reviewed.

## Provenance and publication boundaries

The original `6de7172bae4e5c805c67c03265f4335aa3244e8b` checkout was never recovered. This remains the recovered assembly plus new engineering, never that original commit. The audit verifies **113 checkpoint blueprint hashes** and **157 byte-identical archived original files**. Phase 4 runtime modifications, new regression contracts and synthetic evidence are individually classified and hashed. Earlier recovery/Phase 3 reports and support tooling are preserved relative to the Phase 4 baseline.

The feature publication includes source, tests, authored reports and synthetic evidence. No environment credentials, private production transcripts, customer records, dependency caches, generated service bundles or unnecessary build directories are included. The scan also covers every outgoing file version in the previously local acceptance-tooling ancestor. Its credential-stripping test contains a literal fake database endpoint with no credentials; this exact fixture is recorded as a reviewed synthetic exception, rather than presented as a live secret.

The read-only [publication preflight](phase4/evidence/publication-preflight.json) confirmed Vercel Git automatic deployment disabled, public master unchanged and the recovery branch at its previous publication SHA. A push authorizes source publication only. No production deployment, environment change, telephone routing change, public ordering activation, real payment or customer message is authorized by this report. Do not request release approval as though the remaining verification gates have passed.
