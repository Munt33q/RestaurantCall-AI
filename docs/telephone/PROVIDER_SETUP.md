# Telephone confirmation Preview setup

Prepared November 5, 2026. This is a setup and acceptance procedure, not a record of a successful provider call. No account or routing changes have been applied.

## Supported boundary and open questions

Brittany retains the existing nine authenticated ElevenLabs ordering tools. `confirm_order` can prepare a backend review, returning `TELEPHONE_TRANSFER_REQUIRED` without saving an order. The proposed handoff uses ElevenLabs `transfer_to_number` with SIP REFER into a dedicated Telnyx Call Control application. The confirmation application answers, speaks the immutable review, waits for `call.speak.ended` with `status=completed`, speaks a separate keypad instruction, waits for its completed event, and only then starts plain `gather`.

Telnyx's bridge API requires two Call Control legs. An ElevenLabs SIP Call-ID is not a Call Control ID. No bridge command is issued against the existing direct SIP identifier. The REFER approach creates a new leg whose Telnyx-generated control, leg and session identifiers are independently authenticated and stored.

The official Call Control application contract supports `inbound.sip_subdomain` and `sip_subdomain_receive_settings`. This is distinct from credential connections' SIP URI calling preference. A SIP URI for the assigned subdomain has the form `sip:checkout@ASSIGNED_SUBDOMAIN.sip.telnyx.com`. The actual destination and received `to` representation must be verified in the test account, not guessed from this example.

Unverified: whether this account's trunk accepts REFER, which side originates the replacement INVITE, whether the original caller stays connected with working two-way audio, whether original caller E.164 is retained in `from`, whether both custom headers reach the new Call Control INVITE, and whether ElevenLabs accepts a `secret__` variable specifically in REFER headers. General dynamic-variable documentation restricts secrets to headers; transfer documentation supports dynamic custom SIP headers, but this combination still needs account-level validation. If it fails, do not substitute an LLM-visible bearer value or relax caller matching. Retain web confirmation; reassess a Call-Control-owned initial call separately.

## Isolated Preview configuration

1. Restore access to the existing Vercel project `restaurant-call-ai` in team `vercel-1a62`. Use an isolated Preview with the disposable Neon branch/database and a synthetic restaurant. Do not reuse the Production database URL or tenant. Apply migrations through `0013` only there. Existing `0010` remains unchanged; `0011` stores immutable telephone reviews, `0012` repairs completion-job kinds, and `0013` binds command dispatch to the current stage.
2. Create or identify a dedicated TEST Telnyx Call Control application. Keep public restaurant numbers and their connections unchanged. Its webhook API version must be `2`, webhook URL `https://PREVIEW_HOST/api/telnyx/phone-checkout`, and its SIP subdomain must be assigned to this application. Verify restrictive receive settings permit the owned test trunk. Do not broaden public routing to make the test work.
3. Use a separate ElevenLabs test agent and an owned, explicitly allowlisted test caller. Retain initiation authentication, the per-session tool header, and signed terminal-call webhooks. Ensure Vercel Preview protection permits legitimate provider callbacks using a supported narrowly scoped arrangement. Signature authentication remains mandatory even if a protection exception is required. A browser share link does not prove provider callback access.
4. Store provider keys and these values in secure Preview settings. Keep the feature flag false until the configuration has been inspected and real-call approval obtained. The adapter explicitly refuses `VERCEL_ENV=production`.

| Setting | Required value or source |
| --- | --- |
| `TELNYX_VOICE_CONFIRMATION_ENABLED` | `false` during preparation; `true` only in approved isolated acceptance |
| `TELNYX_CONFIRMATION_APPLICATION_ID` | Dedicated test Call Control application ID |
| `TELNYX_CONFIRMATION_SIP_URI` | Verified SIP destination for that application |
| `TELNYX_CONFIRMATION_DESTINATION` | Exact signed initiation `payload.to` for that destination |
| `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` | Account API credential and webhook verification public key |
| `CUSTOMER_CHECKOUT_SECRET` | Random Preview-only value, at least 32 characters; never in prompts |
| `ELEVENLABS_AGENT_ID`, `ELEVENLABS_INBOUND_NUMBER` | Test agent and its controlled inbound destination |
| `ELEVENLABS_ACCEPTANCE_CALLERS` | Explicit owned test caller allowlist |
| `ELEVENLABS_SESSION_BINDING_ENABLED`, `ELEVENLABS_WEBHOOKS_ENABLED`, `ELEVENLABS_CHECKOUT_ENABLED` | Existing authenticated integration gates, enabled only for the test Preview |
| `ELEVENLABS_SESSION_BINDING_KEY`, `ELEVENLABS_TOOL_API_KEY`, `ELEVENLABS_POST_CALL_SECRET` | Existing secure test integration credentials |
| `RESTAURANT_ORDERING_ENABLED`, `CASH_ONLY_CHECKOUT_ENABLED` | `true` on isolated acceptance tenant |
| `SMS_DELIVERY_ENABLED`, `RECOVERY_SMS_ENABLED`, `OUTBOUND_UPDATES_ENABLED` | `false`; callback jobs may queue, but no real messages or callback calls |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Unset in acceptance; phone path never creates a payment job |
| `DRAFT_RECOVERY_ENABLED`, `RELAY_ENABLED` | `false` for this focused acceptance |

5. Add this rule to the test agent's `transfer_to_number` system tool, using the documented provider schema and the actual verified destination:

```json
{
  "transfer_destination": {
    "type": "sip_uri",
    "sip_uri": "sip:checkout@ASSIGNED_SUBDOMAIN.sip.telnyx.com"
  },
  "transfer_type": "sip_refer",
  "condition": "Only after confirm_order returns TELEPHONE_TRANSFER_REQUIRED for this customer's completed cart.",
  "custom_sip_headers": [
    {
      "type": "dynamic",
      "key": "X-Restaurant-Handoff",
      "value": "{{secret__restaurant_handoff}}"
    }
  ]
}
```

ElevenLabs documents automatic `X-Conversation-ID` and `X-Caller-ID` headers. The application authenticates the conversation header plus the purpose-separated HMAC handoff header; it also requires signed Telnyx destination, application and original caller identity. Never supply this token as a model parameter. Verify the actual settings API accepts the rule and the secret header before enabling it. The handoff token is produced by the existing authenticated initiation route only when telephone configuration is valid.

6. Update the test agent's tool description to match `config/elevenlabs-webhook-tool-blueprints.json`. Explain briefly that the caller will hear a secure final review and confirm with their own keypad. Name and notes must already be collected. Optional completion-callback consent is included in the immutable spoken review and covered by the final customer confirmation. Brittany must not claim that requesting a transfer saves an order. If handoff fails while the original session is active, `review_order` retains the signed web fallback. An ended session requires a fresh call rather than weakening session checks.

## Required actual provider acceptance

Run only after explicit real-call authorization, with an owned test number and synthetic tenant. Do not submit synthetic signed events to deployed webhooks to manufacture acceptance.

| Case | Required observed result |
| --- | --- |
| Handoff | Test caller stays connected; destination creates a Call Control `call.initiated`; required headers, caller and application match without exposing secrets |
| Full review | Actual Telnyx command accepted; caller hears every item, quantity, unit/line price, discount, tax, total, name, notes, cash terms and callback choice |
| Early keypad | Press 1 during review AND during the separate instruction; neither commits. Verify provider does not buffer/reuse those digits when gather opens. This is a hard acceptance gate; no buffering guarantee has been established locally |
| Playback evidence | Actual `call.speak.ended`, correct identities and matching per-command `client_state`, `status=completed`; cancellation/hangup never opens confirmation |
| Confirmation | Only a fresh post-instruction digit 1 produces the corresponding `call.gather.ended` with `status=valid`; verify exact `client_state` echo and command sequencing |
| Decline/silence | 2, invalid input, timeout and hangup create no order |
| Mutation | Changed stock/price/cart requires a fresh review; no partial reservation survives |
| Retries | Duplicate and reordered webhooks produce one order, one inventory reservation and one receipt; stable command IDs deduplicate retries |
| Receipt and dashboard | Actual caller hears the saved eight-character order reference; same row immediately appears through existing dashboard polling with correct total and unpaid cash status |
| Consent | No callback is scheduled before kitchen completion; absent consent schedules none; no outbound delivery while its flag is false |
| Failure | Dropped/failed receipt delivery never undoes a saved order or invents success; inspect saved order before attempting any customer retry |

The adapter retains a short durable command outbox. It retries the same command ID only within 45 seconds; an older uncertain command requires provider reconciliation. Do not create a new command ID to bypass uncertainty. A lost receipt acknowledgement leaves the saved order available on the staff dashboard; it does not authorize a second order.

Initial evaluation is English-only, with a 3,000-character complete-review limit. Unsupported languages or longer reviews retain web fallback. A reliable return transfer to Brittany after decline is not implemented: the confirmation leg explains the fallback and ends. Do not advertise a seamless round trip.

## Official sources inspected November 5, 2026

- [ElevenLabs transfer tool](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/transfer-to-number)
- [ElevenLabs dynamic variables](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables)
- [Telnyx official OpenAPI](https://github.com/team-telnyx/openapi/blob/master/openapi/spec3.json), SHA-256 recorded in `evidence/provider-inspection.json`: application SIP subdomain, incoming custom headers, call identities, speak/gather requests and ended-event status enums.
- [Telnyx speak](https://developers.telnyx.com/api-reference/call-commands/speak-text)
- [Telnyx gather](https://developers.telnyx.com/api-reference/call-commands/gather)
- [Telnyx bridge](https://developers.telnyx.com/api-reference/call-commands/bridge-calls)
