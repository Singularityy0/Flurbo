# Evidence and privacy betas

Implementation status, 25 September 2026. These are separate experiments. They do not change the deployed pools, payout rules, resolver or settlement monitor.

## Evidence review

`/evidence` requires a Mera session. Only the configured operator can request a report. The two frozen official GitHub release questions are supported; practice fixtures are excluded. The source is fetched from a fixed official endpoint and archived in durable Redis with its SHA-256 digest, HTTP status, observation time, pool and rules hash. A missing response is never evidence of NO. A changed source, invalid identity/date or incomplete observation window requires human review. A matching publication can produce candidate YES only after the observation window ends.

The optional Gemini adapter explains normalized public facts. It does not receive release-body instructions, wallet details, private notes or signing credentials. Schema checks prevent a model from changing the deterministic recommendation or inventing citation IDs; they do not prove that its prose is correct. Reports cannot sign, assert, challenge, vote or finalize anything. A wrong uncontested assertion can still finalize through the existing resolver.

### Hosting settings

The existing durable Redis and published pilot configuration are required. Add these server-side settings to Render, never frontend configuration:

```
FLURBO_EVIDENCE_OPERATOR=0x2ff9ca4cb64fa82915144e8d9cf6a6ceddaa35e3
FLURBO_EVIDENCE_MODEL=gemini-2.5-flash-lite
FLURBO_EVIDENCE_GEMINI_KEY=<enter directly in hosting secrets>
FLURBO_EVIDENCE_FREE_TIER_CONFIRMED=true
```

Use a Google AI Studio project that has not been linked to billing. The confirmation flag is an operator attestation, **not a billing check**. Our code cannot verify Google's billing state. Leave the key/confirmation unset until that is confirmed; deterministic source reports still work.

The adapter permits at most 20 attempts per UTC day across service replicas/restarts, plus one source read per event per minute. Failed provider calls consume the app allowance. There are no automatic retries or paid-provider fallbacks. Google's own free limits may be lower and can change; inspect the actual project limits in AI Studio. Free-tier data may be used to improve Google's products; only public normalized evidence is submitted. An unavailable or invalid response is labelled as unavailable, not presented as AI output.

Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [billing](https://ai.google.dev/gemini-api/docs/billing).

Archive keys intentionally retain source/report evidence. Quota controls bound model calls, not total Redis retention; inspect storage usage before expanding beyond the two operator-only questions. Raw response changes conservatively cause abstention; no automatic revision acceptance is implemented.

## Privacy proof lab

`/privacy-lab/` is a standalone public demonstration with no account or assets. It generates four simulated note identities locally, downloads/restores an encrypted note backup and generates a real Semaphore membership proof in the browser. All four identities come from the same browser: this is **not an anonymity set of four independent people**. Nothing migrates or hides existing Flurbo bets.

The separate `experiments/privacy-beta` vault rehearsal deposits four equal lots of a local test token and withdraws one using a proof and separate relay sender. It tests note ownership and withdrawal, not private trading. There is no public Monad vault deployment, hosted relayer, AUSD integration or private portfolio yet. The browser and vault demonstrations are separate flows.

The vault binds proofs to its chain/address/asset/lot scope, recipient and deadline. It keeps its own spent-nullifier registry so a third party validating a proof on Semaphore cannot consume a withdrawal entitlement. Exact transfers and remaining backing are checked. Assets with transfer fees or rebasing are unsupported. Notes require encrypted backups; Mera login cannot restore a lost secret/password. AES-GCM backups use PBKDF2-SHA256 with 600,000 iterations and fresh salt/IV.

Asset, amount, deposit address, withdrawal recipient and timing remain visible. Funding links, reused wallets, small groups, direct wallet submission, network metadata, compromised frontend delivery or device compromise can destroy privacy. The prototype is unaudited; no real-value deployment is supported. Semaphore verification hides which group member created a proof; it does not hide all transaction metadata or provide private market execution.

### Reproduce locally

From the repository root, with Node and Foundry Anvil installed:

```bash
npm --prefix experiments/privacy-beta ci --ignore-scripts --no-audit --no-fund
npm --prefix experiments/privacy-beta run build
node --test experiments/privacy-beta/test/notes.test.mjs
node experiments/privacy-beta/scripts/demo.mjs
```

The rehearsal starts its own disposable Anvil at port 18559, refuses an occupied port and uses only Anvil accounts. It never reads a user keystore or external RPC setting. The public result is written to `target/privacy-beta/local-report.json`. The local token is LAB, not Agora AUSD.

SDK/contracts are pinned to Semaphore 4.14.3. Its depth-8 proving artifacts are version 4.13.0. The build verifies pinned SHA-256 hashes and serves artifacts from this site's origin. The pins were obtained from the official artifact service and checked with the local verifier; this is not an independent trusted-setup audit. Dependencies/artifacts require network access on a clean build. Browser proof generation requires a secure context and WebAssembly. The lab alone permits `wasm-unsafe-eval` and blob workers; the main app CSP is unchanged.

## Validation and release boundary

Automated evidence tests cover source/window/revision abstention, hostile source text, model schema constraints, provider errors, durable caps and operator/session/origin enforcement. Provider responses in tests are fixtures; no live Gemini request has been validated with a user key.

The real local cryptographic rehearsal rejects redirected payouts, wrong scopes/roots, forged proofs, expired deadlines and repeated withdrawals; it checks exact recipient payment and remaining backing. Browser tests exercise encrypted recovery, real proof generation, production CSP, source escaping and mobile layout. These tests are evidence, not a proof of protocol security.

The web Docker build now includes both pages and the self-hosted proof artifacts. Commit/push and wait for the normal Render deployment before opening the hosted pages. No contract transaction is required for the browser proof lab. Before any public funded privacy vault, review the written ADR in the ignored planning directory, verify the exact asset/verifier deployment, test on Monad and complete a dedicated contract/security review. Private trading needs further protocol design; this release does not implement it.

References: [Semaphore documentation](https://docs.semaphore.pse.dev/), [proofs](https://docs.semaphore.pse.dev/guides/proofs), [contract implementation](https://github.com/semaphore-protocol/semaphore/blob/main/packages/contracts/contracts/Semaphore.sol).
