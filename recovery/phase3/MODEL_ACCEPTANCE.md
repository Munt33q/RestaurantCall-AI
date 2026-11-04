# Isolated real-model acceptance

This tool is new local engineering support. It is not original recovered source and is not evidence that a real model has passed.

From `frontend`, use `node --import tsx ../recovery/phase3/model-acceptance.mts --live`. The runner requires dedicated `ACCEPTANCE_AI_API_KEY`, `ACCEPTANCE_AI_BASE_URL` (HTTPS) and `ACCEPTANCE_AI_MODEL` process variables. It does not load environment files or reuse ambient application credentials. Configure the approved provider's model explicitly; current deployment configuration is not inferred by this tool.

For a controlled primary outage followed by actual fallback interpretation, add `--fallback` and supply `ACCEPTANCE_DEEPSEEK_API_KEY`, `ACCEPTANCE_DEEPSEEK_BASE_URL` (HTTPS) and `ACCEPTANCE_DEEPSEEK_MODEL`. An ephemeral loopback server returns 503 for primary attempts; only the configured fallback receives real requests. This is controlled failover evidence, not a real primary provider outage or timeout SLA. Existing HTTP regression tests exercise deadlines and cancellation separately.

Each mode makes nine synthetic interpretation attempts: compound additions, ambiguous burger, contextual offered choice, quantity replacement, price question, unknown allergen safety, instruction injection, unavailable stock and Spanish response preference. The actual interpretation and cart-engine functions run with `NODE_ENV=test`, no database/signing/telephone/payment credentials and no monitoring writes. No order is persisted or submitted. All cases require validated AI interpretation and a successful HTTP attempt from the intended provider. Deterministic parsing, error fallbacks and a successful HTTP response containing invalid model behavior cannot satisfy the gate.

The JSON report includes scenario IDs, contract failures and selected attempt metadata. It excludes raw responses, provider request IDs, credentials and conversation transcripts. A failed scenario produces a nonzero exit. Missing configuration exits before any requests. Inspect failed scenarios using approved synthetic debugging before relaxing an assertion.

Automated checks establish narrow text contracts. Human review of conversation quality, latency budgets and multilingual speech, actual Telnyx playback, reconnection and Stripe callback acceptance remain separate release gates. This runner must not be pointed at the production application health endpoint.
