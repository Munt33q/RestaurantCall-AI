# Brittany live ordering investigation — 2026-11-05

## Result

The current Preview deployment is healthy and the isolated cash checkout fallback is configured. A secure ElevenLabs voice-only order confirmation is **not enabled** because the provider interfaces available to this integration do not supply an authenticated proof that the complete priced review finished playing to the caller.

No Production environment, phone routing, payment configuration, customer data, SMS delivery, or live order was changed.

## Deployment and Preview configuration

- Project: `restaurant-call-ai`
- Branch: `feat/elevenlabs-brittany-webhooks`
- Source commit: `1a438089972f9d1590f598b8e9248e69d7228b2f`
- Preview deployment: `dpl_2ohsR51Vi5Ly5Lu42f9ndzzAFYyx`
- Preview hostname: `restaurant-call-9dn3m3wln-vercel-1a62.vercel.app`
- Deployment state: `READY`
- Region: `iad1`

The following variables were added to the Preview branch only:

- `ELEVENLABS_CHECKOUT_ENABLED=true`
- `RESTAURANT_ORDERING_ENABLED=true`
- `CASH_ONLY_CHECKOUT_ENABLED=true`
- `CUSTOMER_CHECKOUT_SECRET` (new random sensitive value, never committed)

The existing Preview values for the ElevenLabs agent, inbound number, staging Neon connection, session binding key, tool API key, and webhook flags remain scoped to this branch. Production values were not edited.

## Observed application behavior

`frontend/lib/elevenlabs-tools.ts` returns `CUSTOMER_REVIEW_REQUIRED` before any order insert when `confirm_order` is called. This is deliberate: the model's verbal “yes,” a Boolean tool argument, or a transcript cannot authorize a cash order. With the Preview flags enabled, `review_order` can issue the existing signed review code and confirmation URL; `frontend/lib/customer-checkout.ts` then reuses the existing `insertOrder` transaction, inventory checks, quote validation, idempotency, tenant checks, cash-unpaid state, and optional notification consent.

The nine-tool and session security chain is intact:

1. Initiation requires authenticated provider authorization, the configured agent ID and inbound number, a verified caller number, and a provider call identifier.
2. Initiation binds the ElevenLabs conversation to the existing `call_sessions` row and returns a call-specific HMAC secret.
3. Tool requests require both the static ElevenLabs bearer key and the call-specific session HMAC.
4. Tool execution rejects unbound, expired, ended, cross-tenant, or mismatched conversations.
5. The post-call webhook requires a fresh ElevenLabs HMAC over the untouched body and closes only the matching bound session.
6. Migration `0010_elevenlabs_checkout.sql` supplies the agent/called-number/binding fields and checkout grant columns used by this path.

## Provider capability finding

ElevenLabs phone agents support DTMF input, but the documented behavior treats the completed digit sequence as a user turn and states that the first digit can interrupt the agent while it is speaking. The current ElevenLabs initiation, tool, monitoring, and post-call contracts do not expose a signed event equivalent to Telnyx Conversation Relay's `tokensPlayed` plus `agentSpeaking=off` proof for the exact review text. A monitoring or post-call transcript is not playback proof.

Therefore a caller pressing `1` can be an explicit second factor only after a provider-backed playback-completion signal exists. Accepting `1` from the agent's tool payload today would still allow a caller or model to confirm before the full review was heard, so the order engine remains fail-closed and the signed web review remains the supported fallback.

Official provider references reviewed:

- https://elevenlabs.io/docs/eleven-agents/customization/voice-settings
- https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools
- https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-conversation-audio

## Telemetry limits

The connected Vercel MCP account can enumerate the project and deployments, but runtime error/log queries for the team-scoped project returned `403 Forbidden`. No provider call trace was available through that interface, so this report does not invent call counts, request IDs, or failure messages. The concrete application failure is reproducible from the deployed source: `confirm_order` is intentionally blocked pending independent playback proof.

## Verification

- `npm run build`: passed.
- `npm run typecheck`: passed after the build generated `.next/types`.
- Full and focused Node test runs: blocked by Windows `uv_os_get_passwd returned ENOMEM` during `tsx` worker startup; this is an environment limitation, not a test assertion failure.
- Preview deployment: `READY`.
- Production deployment and routing: unchanged.

## Release decision

Preview is prepared for controlled web-review acceptance. Production activation remains blocked until ElevenLabs provides a verifiable playback-completion signal or the voice leg is moved to a transport that supplies one. Do not enable voice-only `confirm_order`, change public routing, create real orders, send customer messages, or alter Production until that evidence and an approved test call exist.
