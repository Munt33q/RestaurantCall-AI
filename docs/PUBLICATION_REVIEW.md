# Source publication review

Reviewed November 3, 2026, America/Chicago, continuing into November 4 UTC.

Destination: `Munt33q/RestaurantCall-AI`, new branch `recovered/restaurant-sales-2026-11-03`. Production release remains on hold.

The reviewed recovery checkpoint is `98ecf05dfe10dc1a39344a64211ff92878190c26`; the engineering commit is `89716026293334ff63a07edcfbc4dd829a7a9db5`. Neither is original missing commit `6de7172`. Both are preserved in history. The user expressly approved a subsequent publication cleanup commit, so the publication HEAD differs from the engineering commit. No history rewrite, force push, merge or branch deletion is authorized.

## Provenance and publication cleanup

- The phase-3 audit was executed with evidence writes captured in memory. All 113 checkpoint blueprint hashes, 105 active exact blueprint hashes, eight intentional runtime deltas, 157 archived originals and 22 reconstructed historical test/helper paths verified. All 95 engineering-manifest file hashes matched before publication cleanup.
- Removed 99 inherited tracked npm-cache files, totaling 287,146,426 bytes, from the latest Git tree and ignored the local cache. Local cache files are retained. These objects already exist in public `master` history; preserving history means they remain reachable in older commits.
- Redacted four occurrences of two expired synthetic relay JWTs from `database-affected.log`. Both signatures were independently verified against the documented fixture signing key. They belonged to synthetic calls in the deleted disposable database branch, not production credentials. Their historical diagnostic bytes remain in the engineering commit. No original recovered source was altered.
- Regenerated phase-3 delta provenance for the cleanup; the original engineering manifest remains in `8971602`. Recovery checkpoint and archived original source bytes are unchanged.

## Sensitive-content review

Official Gitleaks 8.30.1 was downloaded from its project release and its SHA-256 matched the published release checksum. An unfiltered, fully redacted Git scan covered all five commits reachable from the engineering HEAD and approximately 287 MB of patch content. It reported 16 candidates, each reviewed:

| Candidates | Review |
|---|---|
| 4 JWT occurrences | Two expired synthetic tokens; signatures verified with the fixture key; redacted from latest evidence. |
| 4 generic-key candidates | Deliberate test signing/provider fixtures and an explicitly invalid token used for a negative probe. |
| 5 generic-key candidates | SHA-256 values in the blueprint ledger, not credentials. |
| 1 authorization header | Official Telnyx guide's literal `YOUR_API_KEY` placeholder. |
| 2 generic-key candidates | Public Prisma package metadata dependency version strings for `@prisma/credentials-store` in the inherited cache. |

A separate exact-match scan read all 457 unique Git blobs reachable from the engineering HEAD, totaling 290,556,906 bytes, including binary cache blobs. It compared in memory against supplied and locally available provider credentials, GitHub authentication and the Vercel CLI token: **zero known credential matches**. No credential values or raw authentication configuration were written to this report. Scanner findings were reviewed without disabling GitHub secret protection or adding scanner suppression rules.

Tracked-path and content checks found no credential environment files, private keys, customer database dumps or private production transcripts. Only `.env.example` templates are tracked; provider secret fields are blank or explicit placeholders. SQL consists of migrations and synthetic seed/verification code. Recovered production database evidence is schema/migration metadata. The three screenshots were visually reviewed and contain synthetic local or Stripe sandbox fixtures. Public provider-documentation examples and existing Git author metadata are distinguished from customer records.

After excluding the cache, the engineering tree contains 484 files totaling 3,813,384 bytes. Its largest retained evidence file is a 1,199,201-byte deployment file inventory supporting recovery provenance. No source/evidence blob approaches GitHub's large-file limit. Dependencies, build outputs and local credentials remain ignored. Scanner tooling and raw redacted scan reports are stored outside this repository.

## Provider boundary

A read-only Vercel project check returned `gitProviderOptions.createDeployments = disabled` and `disableRepositoryDispatchEvents = true`; the linked production branch is `master`. No provider settings were changed. The publication branch has no GitHub Actions workflow files. Source publication does not authorize a Vercel or Neon deployment, production changes, live routing, ordering, messaging or payment configuration changes.

Push completion must be checked against the exact local publication commit and both reviewed ancestors. The phase-3 release gates remain those documented in `DEPLOYMENT_READINESS_PHASE3.md`. Subsequent engineering commits must be reported before further publication.
