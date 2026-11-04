# ElevenLabs Phase 5 readiness

Branch: `feat/elevenlabs-brittany-webhooks`.

The preview archive was audited and integrated as a guarded adapter. The Next.js tool route is `POST /api/elevenlabs/tools`, and the trusted session-binding route is `POST /api/elevenlabs/session`. Both are disabled by default. No deployed URL, agent ID, voice ID, API key, phone-number ID or provider entitlement is invented.

Implemented and verified locally:

- Bearer authentication with timing-safe comparison and bounded request bodies.
- Tenant selection from the deployment configuration; no model-supplied restaurant ID.
- Active, unexpired conversation binding to an existing `call_sessions` row, with unique ElevenLabs conversation IDs and cross-session rejection.
- Live menu search, cart edits, cart reads, customer name/validated phone capture, provisional notification preference, authoritative quote preview and conversation-scoped order status.
- Existing quote, promotion, inventory, notification and order tables are reused. Migration `0009_elevenlabs_integration.sql` adds only the conversation binding column and unique index.
- `confirm_order` remains blocked with `CHECKOUT_DISABLED`. ElevenLabs tool callbacks do not provide the Phase 4 full-review playback evidence required to make checkout safe, so no order is created and no order number is announced.
- Existing Telnyx messaging, ready-call and Stripe safeguards remain unchanged. No SMS or outbound call was sent.

Verification:

- Full local suite: 199 tests, 187 passed, 0 failed, 12 skipped.
- Frontend typecheck passed.
- Local Next.js production build passed.
- Fresh disposable Neon branch: migration 0009 applied; binding/menu/cart integration passed 1/1; branch deleted and temporary connection state removed.
- Route authentication tests run locally; no provider requests were made.

Open release gates:

- ElevenLabs Brittany voice ID, supported languages, audio quality and actual agent acceptance remain unverified.
- A trusted telephony/session-initiation service must call the binding route with the verified provider call ID. The current feature does not infer that binding from a model-supplied conversation ID.
- A provider-backed equivalent of `tokensPlayed` plus `agentSpeaking` is still required before enabling `confirm_order`. A transcript, LLM boolean or tool callback is insufficient evidence.
- The requested 10% tax and 20% dine-in service charge are not activated. Existing restaurants store configurable tax, but order type and approved service-charge policy are absent; changing charges requires business/legal approval and a separate schema/pricing change.
- Existing Vercel deployment failures and real provider acceptance remain separate release gates. No production deployment or configuration change was made.
