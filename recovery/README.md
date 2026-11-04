# Isolated RestaurantCall AI recovery tooling

These files are reconstructed verification tools, not historical application source.

See [the phase-two report](../docs/SOURCE_RECOVERY_PHASE2.md) for source provenance, exact commands, test results, credential handling and disposable-database requirements.

- `audit-provenance.py`: offline per-file integrity/provenance audit.
- `blueprint-ledger.json`: extracted source checksum ledger and blueprint document identity.
- `inspect-db.mjs`: schema/migration metadata reads in explicit read-only transactions.
- `run-db-tests.mjs`: fresh `recovery_*` database guard and two isolated integration fixtures; JSON credentials only on stdin.
- `http-smoke.mjs`: compiled Next server on loopback, generated test signing/authentication secrets and synthetic order checks; JSON credentials only on stdin.

Do not use the recovered default full test command without reviewing `live-model-chain.test.ts`, which targets production by default. The offline command is `npm --prefix frontend run test:unit`.
