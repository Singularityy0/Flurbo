# Deterministic settlement framework

Status: deterministic source evaluation, durable evidence and an explicitly configured worker path are implemented. These code changes do not enable production configuration or alter existing contracts. Public testnet execution and unattended acceptance are separate operational steps.

## Scope

Settlement should be domain-independent orchestration over domain-specific evidence. Ethereum is an existing supported adapter, not a restriction on Flurbo's eventual questions. The new framework separates a structured rule, a source parser, exact evaluation, and a reproducible evidence packet. It makes no LLM call and does not infer missing answers.

Implemented adapters:

| Adapter | Input and supported extraction | Limit |
|---|---|---|
| `json-record.v1` | Explicit JSON pointers for record identity, observation, publication time, record kind, value and correction link | Reviewed source schema required; duplicate fields, missing metadata and numeric JSON floats are rejected |
| `bls-employment-html.v1` | Archived Employment Situation heading, initial unemployment sentence, release identity and publication time | Total seasonally adjusted unemployment only; narrow archived initial-release markup, not arbitrary BLS tables or revised series |
| `fomc-statement-html.v1` | Dated FOMC statement and announced target range upper bound | Narrow statement wording; not minutes, forecasts, or an automatic choice of the prior policy baseline |
| `usgs-earthquake-count.v1` | Complete official GeoJSON query for a fixed UTC interval, with validated count, distinct IDs and event timestamps | First observed catalogue snapshot during a published capture window, not the final number of physical earthquakes |
| Existing Ethereum activity implementation | Corroborated finalized block measurements and YES/NO outcomes | Unchanged; its existing manifest and evidence validation remain authoritative |
| `json-api.v1`, `stat-table.v1`, `html-text.v1`, `evm-rpc.v1` | General readers configured per rule: any public JSON API, official statistics (CSV, SDMX-JSON, JSON-stat), official pages, and any EVM chain | See [SETTLEMENT_READERS.md](SETTLEMENT_READERS.md); new markets should use these |

The new evaluator supports exact decimal thresholds, categorical equality and integer UTC timestamp comparisons. Existing adapters and supported rules can be configured for new questions. Unsupported prose, new source formats and subjective labels require reviewed extraction/rules work before launch. A parser's determinism does not prove that the publisher is correct or that the market's prose is unambiguous.

## Rules and provenance

`apps/web/server/settlement-rules.mjs` validates and hashes `flurbo.settlement-rule.v1`. It binds source URLs, publisher identity, adapter version, observation series/period/unit, rule operator/value, vintage, publication cutoff, correction cutoff and resolver periods. Unknown fields and unsupported settings are rejected rather than ignored. Numeric thresholds are decimal strings; comparison uses integer arithmetic with at most 18 decimal places and 36 integral digits.

The canonical SHA-256 rule hash is an off-chain rule identity, not automatically the deployed resolver's `rulesHash`. The publication integration binds each complete rule through the existing event source record ID, then recomputes the draft hash, resolver configuration and immutable resolver rules hash. The normal pilot service checks the manifest against live contract state. A source record cannot select its own observation identity or units. The separate retrospective local rehearsal uses a local draft and verifies its resolver/pool binding.

`apps/web/server/settlement-evidence.mjs` verifies complete, nonempty captures, exact requested/final URL identity, content type, byte count, SHA-256, retrieval time, publisher time, record identity and extracted value. Retrieval is bounded to 2 MB and rejects redirects, Content-Range responses (including status 200), unencoded Content-Length mismatches, invalid UTF-8, failed streams and empty bodies. It aborts and cancels an oversized or failed response. Source URL rules are operator-reviewed configuration, never an untrusted public fetch endpoint. Infrastructure still needs outbound network restrictions when registering new sources.

Initial captures must agree on one identity, value and publication time. A conflicting version remains unresolved; it is not decided by last-write-wins or majority vote. All configured URLs require capture coverage. For initial-with-corrections, every configured source must also be retrieved at or after the correction cutoff. An early release copy alone cannot prove the absence of later corrections. The source review must establish that the selected URLs expose the relevant correction stream; the framework cannot discover undisclosed correction pages automatically.

The correction policy requires a sequential explicit supersedes chain. A notice without a replacement is distinct from an unavailable release. Routine revisions do not replace an initial value. Corrections published after the cutoff are recorded but excluded. Failed captures are not silently discarded to obtain a convenient answer.

Each ready packet contains the full committed rule, selected facts, raw captures, hashes, parser identities and excluded-record metadata. `verifySettlementPacket` checks its expected immutable rule identity and independently reruns extraction and evaluation. It rejects retrospective packets. `archiveSettlementProposal` archives both evidence-backed YES and NO and never archives an unresolved result. Hashes establish byte consistency, not source authenticity or final settlement.

The existing public evidence archive limits attachments to 12,000 characters. Larger packets use the durable settlement packet store and `/api/settlement/packets/<sha256>` read-only route. The store reads back and replays the packet before the bounded archive receives a hash/URI reference. Packets are capped at 16 MB and fail explicitly rather than being truncated. The worker independently retrieves the final public archive, and any referenced packet, over HTTPS before proposing. A locally generated URL alone is insufficient.

The capture store preserves the earliest and latest retrieval of each distinct complete body. Changed bodies remain in the history so a revision or contradictory initial value cannot silently overwrite an earlier observation. It retains at most 50 distinct versions, expanded to at most 100 evaluator captures. Capacity exhaustion fails closed. Capture attempts and failed retrievals are recorded separately. Incomplete or invalid captures never become eligible source observations.

## Explicit worker integration

The new manifest mode is `deterministic-source-v1`. It requires the same exact pool/rules allowlist, signer journal, lease, fresh independent monitor, dedicated nonholder signer and bounded transaction review as existing modes. It additionally requires:

```text
FLURBO_RESOLUTION_SOURCE_MODE=deterministic-source-v1
FLURBO_RESOLUTION_EVIDENCE_ORIGIN=https://your-public-evidence-host
```

The evidence origin must actually serve the same durable archive and packets. A private local state file cannot claim the production website as its host. A temporary read-only HTTPS gateway can support an explicitly labeled public testnet rehearsal, but its availability and retention limits must be disclosed before trading.

With proposals enabled, each worker cycle collects source observations before the observation end as well as when a proposal becomes eligible. Execution may remain disabled while observations are collected. Disabling proposals also stops this collection path, so capture scheduling and retained evidence are launch gates. The first successful eligible proposal is frozen by immutable rule, pool, draft and signer identity. Approval, restart and later assertion reuse that archive identity. A newly contradictory source observation blocks reuse.

General proposals can be YES or NO. Unsupported sources, partial responses, malformed data, ambiguous corrections and missed capture windows remain unresolved. The contract's fixed pending-case deadline determines timeout VOID. The worker cannot retroactively extend that deadline. Existing Ethereum, rehearsal and legacy release modes retain their separate behavior.

Transaction recovery retains the signed raw transaction before broadcasting. When the hash has no receipt, the worker can resend those exact bytes only if the RPC does not know the hash and both latest and pending signer nonces equal its nonce. It revalidates sender, chain, destination, calldata, exact bond approval, gas limits, monitor and proposer state. Deterministic assertions also revalidate retained and publicly accessible frozen evidence. Retries are spaced by at least 60 seconds and capped at eight broadcasts. Occupied/consumed nonces, changed source facts, unavailable evidence and an expired source assertion window require inspection. No replacement, repricing, new signing or journal deletion happens automatically.

`runResolution(env, dependencies)` supports explicit durable command/store and HTTP dependencies for the local-hosted rehearsal. Its default production path continues to use Redis and normal RPC/signing. Dependency injection does not remove the immutable-manifest, monitor, holdings or signed-calldata checks.

## USGS snapshot semantics

The USGS adapter uses the [official FDSN query API](https://earthquake.usgs.gov/fdsnws/event/1/) and its [GeoJSON response schema](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php). The exact query commits `format=geojson`, UTC `starttime` and `endtime`, `eventtype=earthquake` and `orderby=time-asc`, with no pagination or implicit date defaults. It checks metadata status, count equality, distinct event IDs and every event's timestamp against the inclusive interval. A complete zero-count response is valid. HTTP errors, incomplete responses and transport failures are never converted to zero.

`first-observed-snapshot` is distinct from an initially published statistical release. Both the official catalogue generation timestamp and the actual retained retrieval must fall within the committed capture window. The earliest eligible complete retained snapshot is used, and later catalogue revisions do not replace it. USGS generation time is not an event's publication time. Missing the capture window leaves the question unresolved until contract timeout. This narrowly defined question is suitable for exercising non-Ethereum automation; it must not be described as a final count of all earthquakes that physically occurred.

## Explicit outcomes and exception behavior

| Situation | Evaluator behavior |
|---|---|
| Valid observation and rule condition true | Ready YES proposal |
| Valid observation and rule condition false | Ready NO proposal |
| Observation/correction window still open | Wait, no proposal |
| Release missing, delayed beyond cutoff or cancelled | Distinct unresolved reason; wait for the published contract timeout |
| Official correction notice without replacement | Unresolved, distinct from nonpublication |
| Invalid/partial/oversized capture or changed markup | Unresolved source/extraction failure |
| Conflicting initial versions or correction chain | Unresolved conflict |
| Assertion deadline reached with case still pending | Timeout plan for the existing contract's VOID path |
| Already finalized case | Terminal; no replacement proposal |

No missing observation becomes NO. The evaluator does not proactively propose VOID or override finalized results. A timeout plan is not proof of a pending on-chain case: the transaction orchestrator must reread current chain state before calling `finalize`. Challenges and reviewer votes are handled by the existing resolver, outside source parsing.

## Policy comparison

No production policy is selected. These are alternatives for review, not approved market settings. With trading closing one hour before the scheduled release and a one-hour challenge period:

| Policy | Fixed observation end | Minimum ordinary capital lock from trading close |
|---|---|---|
| Strict initial, one-day publication allowance | Scheduled release plus 1 day | 26 hours |
| Initial with corrections, three-day publication allowance plus one-day correction allowance | Scheduled release plus 4 days | 98 hours |
| Initial with corrections, 21-day publication allowance plus seven-day correction allowance | Scheduled release plus 28 days | 674 hours |

These are the earliest single-event unchallenged finalization times, excluding RPC, worker scheduling, transaction confirmation and delivery delays. Pool redemption requires every event to finish. An assertion may arrive near the end of its assertion period; a late challenge may then consume the voting period. `settlementTimeline` exposes these bounds explicitly.

The current resolver accepts assertions only after the fixed observation end. It cannot settle an on-time release immediately while separately preserving a longer exceptional publication/correction window. Implementing that policy would require a separate contract design. Trading stops at the pool's close, so unresolved positions cannot be sold through the current pool during this wait.

Strict initial means the first qualifying published value is used even if later corrected. Initial with eligible corrections is a different policy. Neither should be described as both strictly first-published and replaceable after publication. Delayed publication, cancellation, a corrective notice, an eligible replacement and a routine revision require separate published rules.

## Historical evidence and replay

The checked-in captures were fetched directly from official public sources in September 2026. Their retrieval timestamps and hashes are retained. They are not claimed to have been captured in 2025 and cannot establish what a trader knew in 2025.

- [BLS initial November 2025 Employment Situation release](https://www.bls.gov/news.release/archives/empsit_12162025.htm): December 16 publication, initial unemployment rate 4.6 percent.
- [Federal Reserve December 10, 2025 statement](https://www.federalreserve.gov/newsevents/pressreleases/monetary20251210a.htm): announced upper bound 3.75 percent.
- [Federal Reserve October 29, 2025 statement](https://www.federalreserve.gov/newsevents/pressreleases/monetary20251029a.htm): preceding captured statement's upper bound 4 percent.
- [BLS January 2026 release showing revised 2025 values](https://www.bls.gov/news.release/archives/empsit_01092026.htm): useful source for the distinction between initial and later vintages; this document is not a parser fixture in this change.

The runnable replay uses December 5 as an explicit historical schedule parameter and a 4.2 percent experimental threshold. A future live market must independently review its schedule and threshold. The short policies exclude the delayed BLS release; the 28-day policy includes it while delaying normal finalization. The FOMC comparison records both captured statements; a live definition of a rate cut still needs reviewed baseline selection and intermeeting-action treatment.

Run from the repository root:

```sh
node --experimental-strip-types --test apps/web/tests/settlement-rules.test.ts
node apps/web/scripts/replay-settlement.mjs
forge test --match-contract SettlementRuleReplayTest
node apps/web/scripts/replay-settlement-chain.mjs
```

The report is written to `target/settlement-replay/historical-report.json`. `replaySettlement` labels packets as retrospective and explicitly ineligible for live submission. The normal evaluator refuses captures fetched after the evaluation time. Synthetic fixtures separately exercise correction notices, replacements, threshold crossings, revisions, cancellation, ambiguity and source errors. They are not represented as real historical occurrences.

The ordinary Foundry suite executes the current `AccountPilotResolver` and `PilotPool` locally: YES/NO, missing-result timeouts, the exact assertion boundary, delayed normal eligibility, disputes, no-quorum timeout, delivery and actual holder redemptions. For one unit of an AND claim: YES/YES pays 1, YES/VOID pays 0.5, VOID/VOID pays 0.25, and a known NO pays 0. VOID is not a purchase-price refund.

The final command is the integrated source-to-EVM rehearsal. It parses the checked-in official captures, reruns the evaluation and packet hashes, writes hash-bound input to `target/settlement-replay/evm-input.json`, and starts the opt-in `settlement_replay` Foundry profile. That profile may read only the generated replay directory, disables FFI and uses no fork. The runner accepts no RPC, broadcast or signing-key argument and removes Foundry/RPC overrides from its child environment. The Solidity test also rejects an active fork. `FLURBO_REPLAY_FORGE` can select a local Forge executable when it is absent from PATH. Foundry and `npm --prefix contracts ci` are prerequisites.

The generated local deployment binds the two actual rule hashes, observation deadlines and resolver periods. Chronological actions come from the evaluator output, not hardcoded proposed answers. The short policy does not submit an unemployment proposal and reaches the resolver's pending-case timeout. The long policy submits the parsed unemployment result. Both submit the parsed FOMC result and their original retrospective packet hashes. Then the tests finalize, deliver and redeem a real purchased AND position in the local EVM, checking actual holder balance changes and collateral coverage.

| Retrospective policy | Final results | AND units purchased | Measured redemption in 6-decimal collateral atoms |
|---|---|---|---|
| One-day strict-initial publication allowance | Unemployment VOID, FOMC YES | 1,000,000 | 500,000 |
| 21-day publication plus seven-day correction allowance | Unemployment YES, FOMC YES | 1,000,000 | 1,000,000 |

`target/settlement-replay/chain-report.json` includes source replay identity, rule/evidence hashes, raw Forge results and decoded purchase/redemption measurements. Both runs purchase the AND position for 259,531 atoms from a newly funded local pool. This artificial equal-weight initial pool is not a historical executable quote or a trading-performance backtest. The release captures are retrospective and cannot prove complete contemporaneous correction monitoring. The evidence URI in these local assertions is explicitly a placeholder, not a public archive.

This closes the archived-source to actual-contract payout test path. The retrospective command itself does not run the production worker, test GitHub cron, submit to public testnet or activate general settlement in production. Synthetic exceptional cases remain separate focused tests. A separate worker integration test exercises the actual runner with deterministic NO evidence, durable local state, public readback and bounded transaction preparation/signing using disposable synthetic fixtures.

## Production integration gates

1. Review the real market question, source coverage, initial vintage and correction policy with a second reviewer and prospective user.
2. Prepare the new immutable deployment draft through the rule-binding helper and independently verify its deployed contract hashes. Preserve existing markets and their rules.
3. Configure the explicit new source mode and exact allowlists only for the intended fresh collection. Preserve existing Ethereum and rehearsal registrations.
4. Configure durable capture/archive/packet storage and verify public retrieval before enabling transactions. Test capture timing before immutable source windows begin.
5. Verify exact website, monitor and proposal registration. Finish-only registration does not create missing proposals.
6. Test source failure, corrections, conflict, delayed response, signer exhaustion, stale monitoring and process restart through the integrated worker.
7. Run a fresh public testnet collection using scheduled runs, without manual settlement rescue. Confirm proposal, finalization, delivery and separate holder redemption. No unattended-success claim is made until this is observed.

The framework remains limited to reviewed deterministic adapters and explicit question semantics. It does not make arbitrary real-world prose automatically resolvable. No production configuration or existing market is changed by this implementation.
