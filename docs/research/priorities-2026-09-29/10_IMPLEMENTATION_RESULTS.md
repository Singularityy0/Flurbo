# Correctness implementation: results and next release gate

Date: 29 September 2026. Branch: `product-priorities-correctness`. Base: `fb10b6425bff1fa5db0bfd9eccaee0714d1a90f1`.

Status: the initial M0/M1 correctness slice and M3 settlement framework are implemented and locally verified. General-source worker integration is complete in the uncommitted checkout. A separate authorized public Monad testnet collection is now deployed and verified, and its isolated local monitor/worker is running. End-to-end live settlement and holder redemption remain pending. Nothing was committed, pushed or enabled in Render or GitHub Actions. Existing production markets and journals were not modified. See `11_LIVE_REHEARSAL_RESULTS.md` for live observations.

This is the current handoff. Documents 00 through 07 retain the cloud agent's original research and recommendations; read the corrections and actual implementation status below before acting on them.

## What changed

| Area | Delivered behavior | Boundary |
|---|---|---|
| M0 pricing | Six new pricing property tests cover unary conditional preservation, joint changes, buy/sell paths, correlated and independent states, and fuzz cases | No pricing-engine rewrite or deployed contract change |
| M0 publication | Markdown and the 13-page PDF now describe the factored PilotPool consistently, separate pricing from settlement enumeration, and state implementation limits | Existing logo retained; PDF rendered and visually inspected; binary Git handling added |
| M1 evidence | All four SDKs use complete-capture v2 evidence, distinct publisher/HTTP/retrieval times, explicit event associations, and per-event freshness | This is an SDK compatibility change; legacy evidence does not qualify |
| M1 trade checks | Stale supporting records and unrelated citations cannot inflate the strategy's minimum fresh-evidence count after forecast projection | Raw research records remain available; unknown publication is not relabelled as recent retrieval |
| M3 general rules | Exact numeric comparisons, categorical equality and timestamp comparisons over committed structured rules | New prose or an unsupported source format is not automatically adjudicated |
| M3 adapters | Explicit JSON record extraction and narrow BLS/FOMC archive parsers, with bounded capture and reproducible packets | Current production worker modes are not replaced by this framework |
| M3 exception paths | Separate unavailable, cancelled, late, corrected, revised, conflicting and invalid-source reasons; missing data never becomes NO | Unresolved cases follow the existing contract's timeout-to-VOID path |
| M3 rehearsal | Real archived source evaluation drives hash-bound local resolver deployment, assertions/timeouts, delivery and measured redemption | Retrospective local EVM, not a historical strategy backtest or a cron test |
| Operations | Read-only readiness report and a separate two-event Ethereum Test preparation/deployment/verification/bundle recipe | No public Test deployed; existing Showcase recipe preserved |
| Early participant work | Review packet with payoff examples, policy trade-offs, exit restrictions and an actual-workaround interview | No messages sent and no telemetry added |
| CI | Offline source-to-contract replay, settlement preparation types/tests and the real local-chain SDK dashboard flow added to checks | Remote CI has not run because these changes are not pushed |

## Evidence migration is intentional

See `protocol/specs/research.md` and each SDK README. `flurbo.agent-evidence.v2` requires complete bytes, a full-body hash, final URL, event associations and explicit timestamp provenance. Oversized first chunks, later overflow, failed streams, empty records, partial HTTP responses, duplicate or malformed IDs, and unknown required timestamps fail closed.

Generic HTTP retrieval does not know a publisher's release time. Consequently, existing generic-source agents will abstain under the default release-freshness policy until either:

1. a reviewed source adapter extracts the actual publisher release timestamp; or
2. the operator explicitly chooses background research for the relevant events using `research.evidenceRequirements`.

Background freshness means the page was recently retrieved. It does not mean the publisher recently released the information. Neither evidence text nor a model response can select that policy. Do not globally choose background mode to silence abstentions.

The flat forecast schema stays v1. Its `observedAt` follows the evidence policy, with publication taking precedence for mixed associations. Unknown required publication or unrelated supporting citations are retained in the raw research result but omitted from the flat forecast evidence count. This prevents a successful research validation from becoming a weaker trade check later.

An independent review found and corrected Python raw-ID filtering, malformed-ID exceptions, empty Content-Range handling, Unicode length parity, and source/policy selection by event identity. The shared conformance suite now has 54 research cases. Detailed per-source transport diagnostics remain outside the current array-based retrieval API; when every fetch fails, the aggregate result is `no_sources`.

## What the settlement rehearsal proved

See `docs/DETERMINISTIC_SETTLEMENT.md` for the rules, primary source links and precise boundaries. Run from the repository root:

```sh
node apps/web/scripts/replay-settlement-chain.mjs
```

The command uses checked-in official source captures and local Forge. It accepts no RPC or broadcast argument and uses a separate profile that refuses forks. `FLURBO_REPLAY_FORGE` may identify a local Forge executable if it is not on PATH. The generated result is `target/settlement-replay/chain-report.json`.

| Local scenario | Results | AND units | Actual redemption, six-decimal collateral atoms |
|---|---|---:|---:|
| Short publication allowance excludes the delayed unemployment release | VOID and YES | 1,000,000 | 500,000 |
| Long publication/correction allowance includes it | YES and YES | 1,000,000 | 1,000,000 |

The tests check actual holder balance changes, evidence/rule bindings, delivery and pool collateral coverage. Delivery alone does not send money to holders. The holder separately redeems. These amounts are payout mechanics, not evidence of demand, historical executable quotes or investment performance.

With the stated one-hour gap before the scheduled release and one-hour challenge window, the three policy alternatives have earliest normal capital locks of 26, 98 and 674 hours from trading close. No production policy was selected. Under the existing fixed observation-end contract, extending the correction window also delays normal assertions. Fast ordinary settlement with a separate longer exceptional wait needs a different resolver design, not a backend timer adjustment.

The BLS and Fed captures were fetched in 2026. They are explicitly retrospective and cannot prove complete contemporaneous correction monitoring or information available to a trader in 2025. Synthetic fixtures cover other exception paths separately.

## Local verification

| Check | Result |
|---|---|
| Full ordinary Foundry suite | 314 passed, 0 failed, 0 skipped |
| Integrated official-source local EVM replay | 2 passed; measured payouts above |
| New settlement evaluator tests | 15 passed |
| Web server suite | 308 passed, 0 failed; 48 opt-in tests skipped in this command |
| Separate full web browser suite | 47 passed, 0 failed, 0 skipped |
| SDK dashboard with actual local runtime trades | 1 passed, 0 skipped |
| Web production build/typecheck | Passed |
| TypeScript SDK | 40 nonlocal/nonbrowser tests and 4 local-chain tests passed; final focused 18-test run and typecheck passed after review fixes |
| Python SDK | 31 passed, including 4 actual local-chain tests |
| Rust SDK | 30 test functions passed, including 4 local-chain tests; final shared research conformance passed all 54 cases |
| C++ SDK on MSYS2 UCRT64 | 9 conformance groups, 14 runtime tests and 4 local-chain tests passed; final shared conformance passed all 54 cases; runner/examples compile |
| CRE preparation/verification | Typecheck and 41 tests passed; missing declarations for the new recipe exports corrected |
| Two-event deployment script | Compiled without running or broadcasting |
| Mobile | Typecheck, 35 tests and Android export passed |
| Protocol OpenAPI | YAML parses with 13 paths |
| CI configuration | YAML parses with four jobs |

The remaining skipped web test is the opt-in real PostgreSQL integration, which was not run. The 47 browser tests were run separately as listed. Bundled Chromium could not start on this Windows host; system Chrome successfully ran both browser suites. The SDK dashboard test exposed selectors predating the V2 section navigation and live-trade confirmation. Those selectors were corrected without removing registration, credential, ownership, trade, pause or mobile assertions.

The default test environment initially lacked the Python SDK dependencies and PyYAML. They were installed only into the ignored `target/priorities-python` environment. Foundry/Anvil were used from the existing local installation; C++ used its supported MSYS2 toolchain. No unrelated dependency upgrades were made. Local logs and replay output are under `target/` and are not proposed source files.

## Corrections to the original research summary

- The Ethereum activity adapter already produced YES and NO. The general evidence-assistant branch of the existing worker was YES-only. That distinction is preserved; the new framework independently produces deterministic YES or NO.
- The original local checkout differed from main in `LoaderHost.tsx` as well as browser tests. This work starts from updated main, preserving the loader revisit fix.
- Shared observation identity is not a universal definition of logical dependence. Semantic enforcement remains unchanged; lack of identical observations alone does not prove a semantic rule is useless.
- The 21-day publication plus seven-day correction policy was a proposal, not an approved product setting. The correct lock comparison is from trading close and depends on fixed observation ends and every event finishing.
- Prior deployed-code-to-manifest checks are not independent source-to-bytecode verification. This implementation does not upgrade that claim.

## General-source integration and remaining live acceptance

The subsequent integration now connects the evaluator to the existing transaction worker through the explicit `deterministic-source-v1` mode. Canonical rule hashes bind through the event source identity, draft, event hashes and resolver rules hash. The worker retains source captures before the fixed cutoffs, produces deterministic YES or NO results, verifies public packet readback and preserves evidence identity through proposal retries. These are code changes, not evidence that the hosted production worker has been enabled for the new mode.

Large packets cannot be stuffed into the existing evidence archive's 12,000-character attachment. The integrated packet store retains and verifies full packet bytes before archiving a bounded reference. Production can use the existing durable command interface; the isolated local rehearsal uses persistent file storage and a read-only public evidence gateway. No production storage service or credentials were provisioned or changed in this work. A temporary tunnel is not proof of permanent evidence availability.

Integration verification on 29 September: the ordinary web suite passed 332 tests with 48 opt-in skips, the separate full browser suite passed all 47 tests, CRE preparation and verification passed 47 tests, web typecheck and production build passed, and the two historical source-to-contract replay tests passed again. The final focused rehearsal, UI/configuration and persistence run passed 25 tests with no skips. It covers network-mode isolation, same-origin/host boundaries, atomic configuration publication, concurrent display-cache updates, notification persistence and public packet verification. The remaining ordinary-suite skip is the opt-in PostgreSQL integration. No hosted CI result is claimed for these uncommitted changes.

The fresh public rehearsal completed its bounded lifecycle. After the documented deployment setup fixes and supervised pre-capture process recovery, the worker retained both real USGS snapshots within their immutable windows, automatically asserted NO for both events, finalized normally and delivered the results. Independent chain and public-evidence verification passed. The human holder's winning A NO redemption was verified at 03:07:45 UTC: transaction `0xb5153a71abc2c2a7a0f52cc216ca046c4940c96ad5a3012a0a17af92670a7f42` returned exactly 1 test AUSD, with matching receipt, token transfer, historical balance increase and holdings reduction. Continuous uptime, hosted production scheduling, permanent evidence availability, pending-transaction restart recovery and live disputed settlement remain unproven. This is not authorization to deploy or enable production. See `11_LIVE_REHEARSAL_RESULTS.md` for evidence and limitations and `docs/LOCAL_SETTLEMENT_REHEARSAL.md` for the operating path.

The separate four-SDK live transaction rehearsal also completed successfully on the fresh pool: TypeScript, Python, Rust and C++ each made one verified purchase, with 2.000002 test AUSD spent in total. This exercises native SDK transaction components, not authenticated agent workflows or autonomous forecasting. See `12_LIVE_SDK_TRADE_RESULTS.md`. The local settlement processes required supervised recovery after an unexplained interruption before the source windows, as documented in `11_LIVE_REHEARSAL_RESULTS.md`; later settlement success must not be described as uninterrupted unattended uptime.

Operator decisions before a live macro deployment:

1. Exact events, threshold/operator, observation identities and the FOMC baseline/intermeeting-action rule.
2. Strict initial vintage or explicitly eligible corrections, with acceptable maximum publication/correction cutoffs and capital lock.
3. A second rules reviewer and ownership of monitoring, timely recovery and evidence retention.

The current public Test rehearsal follows `docs/LOCAL_SETTLEMENT_REHEARSAL.md` and uses two USGS catalogue snapshot questions. It needs no commit, push or second Render service. Preparation creates a 90-minute trading window; earliest ordinary delivery is about 170 minutes after preparation plus operational delays. The older Ethereum-specific recipe remains documented separately in `docs/ACTIVITY_TEST_RUNBOOK.md`. Neither `PilotResolver` recipe tests `AccountPilotResolver` challenge eligibility. Configure website, monitor and proposal coverage, reconcile signer journals/nonces, fund the dedicated signer, check dry-run readiness and then observe actual scheduled runs. Configuration readiness is not proof of unattended success. A manual settlement rescue must be recorded as an unattended failure.

M2 pool-wide forecasts, M4 journey/exit additions and broader M5 review sessions remain follow-on milestones. They were not silently implemented or claimed complete. The early interview packet is ready now, so product validation need not wait for that broader scope.

## Review and preservation

Review changes by area: publication/pricing, evidence protocol and SDKs, deterministic settlement/replay, operational Test tooling, and verification documentation/CI. Preserve existing untracked design assets, local agent settings and original research files. Do not use `git add .` indiscriminately.

There are no edits to `contracts/src`, deployed production configuration files, V2 page components or semantic-mode settings. Solidity additions are tests and separate opt-in deployment scripts. The existing worker now has an explicit deterministic source path and guarded retry of identical signed transaction bytes. The user authorized fresh testnet rehearsal transactions and funded its dedicated bot through local encrypted-keystore prompts. No real-money transactions, production database writes, repository secret changes, participant messages, commits or pushes were performed for this integration.
