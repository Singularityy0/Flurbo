# Background resolution: testnet activation

The consumer flow is market list → dedicated market → trade → wait for result → collect payout. A bettor does not operate an evidence-review screen. The worker runs separately from the web server. No existing pricing, collateral, resolver or payout code is changed.

## Implemented boundary

- Market URLs include collection and event, so a newer featured collection does not silently redirect an old market.
- Each page shows a trade ticket, the user's selected wallet holdings, the event's source/rules, actual resolver phase and deadline-based estimates. Full collection delivery is still required before any payout. Wallet confirmation is still required to collect shares; there is no automatic withdrawal authority.
- There is no public trader feed, wallet leaderboard or per-user bet table. Current transactions remain public on-chain. Removing those views is not a claim of private participation.
- Dedicated market pages include a sampled price chart. The authenticated `price-history` endpoint records one-share YES/NO buy quotes from verified pool snapshots, at most one observation per five-minute bucket when viewed. Redis retains up to 288 observations for 30 days, separated by chain, pool and rules hash. No wallet, trade hash or user quantity is stored. A new deployment starts with no historical samples; gaps are not backfilled and the chart does not represent probabilities, continuous coverage or complete trade history. Existing Redis settings suffice; no contract deployment or AI key is needed for these pages.
- The background worker can prepare an assertion (including exact bond approval), finalize elapsed cases and deliver the resolved collection. It never votes, trades, redeems user holdings, withdraws bonds or accepts arbitrary calldata.
- For the two official release questions, source validation plus a valid AI explanation is required before an automatic YES assertion. Missing evidence does not imply NO. This is a narrow AI-assisted resolution beta, not a general AI judge. Source ambiguity, changed records or free-tier unavailability cause abstention; the existing assertion timeout may ultimately produce VOID.
- The legacy practice publication explicitly requires B's intentional dispute and C's no-assertion timeout. Automation preserves those exercises: it asserts only the fixed A/D YES records. B still requires its published dispute exercise; an unasserted B eventually becomes VOID under the existing contract. Do not describe this old collection as fully hands-off. A future ordinary practice collection needs a separately committed policy if that exercise is to be removed.
- Active disputes keep the deployed panel/timeout rules. Foreign assertions are not automatically finalized by this worker; monitoring escalates them. Uncontested bot assertions can finalize without a human approval click. A wrong uncontested assertion can still finalize.

## Signing and recovery

Use a fresh bot wallet on Monad testnet, never the deployer, a reviewer, a trader or a real-value wallet. The worker rejects the configured creator and reviewer addresses. Fund only the test MON needed for gas and test AUSD needed for assertion bonds. Each transaction is limited to 0.1 MON maximum gas cost; token approvals equal the single configured assertion bond.

The worker checks chain, deployment anchor, bytecode and pool/rules bindings through the existing service. It simulates the exact call and checks resolver state again after preparing it. A fresh monitor checkpoint (within 15 minutes, with no queued alerts) is required before new submissions. This proves recent monitor operation, not truth or continuous coverage.

A global signer lease prevents concurrent jobs. The signed transaction and hash are persisted before broadcasting. On restart, receipt reconciliation happens before any new signing. An uncertain broadcast is never replaced with a new transaction automatically. If a process dies after journaling but before broadcasting, the journal remains pending: inspect the hash, nonce and chain before any manual recovery. Do not delete the journal merely because an RPC did not find a receipt. Signed raw transactions are stored in private Redis; private keys are not.

## GitHub settings

The new `Testnet resolution worker` workflow is opt-in and runs about every five minutes. GitHub scheduling can be delayed. It processes at most one transaction or reconciliation per run. Existing email monitoring remains a separate workflow and must stay enabled.

Repository **variables**:

| Variable | Value |
| --- | --- |
| `FLURBO_RESOLUTION_ENABLED` | `true` to permit the workflow to run |
| `FLURBO_RESOLUTION_EXECUTE` | Start with `false`; only `true` permits signing/broadcast |
| `FLURBO_RESOLUTION_POOL` | Exact lowercase target pool address |
| `FLURBO_RESOLUTION_RULES_HASH` | Exact immutable rules hash from its verified manifest |
| `FLURBO_RESOLUTION_SIGNER_ADDRESS` | `0x632a158d5eccc10f864ab94cec99511e1cc514f3` — dedicated testnet bot supplied by the operator |
| `FLURBO_EVIDENCE_MODEL` | Configured free-tier Gemini model, when using official release evidence |
| `FLURBO_EVIDENCE_FREE_TIER_CONFIRMED` | `true` only for a confirmed unbilled provider project |

Repository **secrets**, entered directly in GitHub:

- `FLURBO_RESOLUTION_MANIFEST_JSON`: complete verified manifest for that pool.
- `FLURBO_RESOLUTION_PRIVATE_KEY`: the dedicated testnet bot key, only needed for execution. Never paste it into chat, a command argument or Git.
- Existing `FLURBO_ALCHEMY_TESTNET_RPC_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- `FLURBO_EVIDENCE_GEMINI_KEY` for official release AI assistance. The existing 20-attempt/day application cap applies across interactive and automated requests. Practice fixture handling does not call an AI model.

Bot private key exports may have an optional `0x` prefix and surrounding whitespace. Only a valid 32-byte hexadecimal key matching the configured public signer is accepted. Logs report safe codes for missing, invalid or mismatched bot keys, configuration errors, RPC reads and Redis failures; they never print the input key or upstream error. A generic `WORKER_CHECK_FAILED` can still require investigation of the monitor and pending journal. Never clear that journal merely to silence an error.

First run with execution false and inspect its `dry-run` plan, pool identity and `monitoring` field. It must report `healthy` before activation. `not-ready` means the pool's independent monitoring checkpoint is missing, stale, invalid, unreadable or has queued alerts; run the existing Settlement monitor and inspect its result before retrying. Dry runs do not sign or fetch AI evidence, so they do not validate provider availability. Activation remains incomplete until a funded dedicated signer, provider setup where applicable, and a successful hosted dry run are verified. No transaction has been submitted by the development tests. Do not reuse the same signer journal for another pool without reconciling its pending transaction and preserving its audit trail.

## Public prices and future private participation

Future market pages should show aggregate prices and shared pool state, plus the user's own privately recovered position. Exact trade-level prices, timestamps, size, nullifiers or funding/withdrawal links can reconstruct participation even if wallet names disappear. Before adding a public price-history chart for a shielded pool, assess inference from successive states and decide whether batching, delayed/coarsened publication and relayer protections are required. The current proof lab does not solve private execution or this leakage problem.

## Validation

Browser regression tests cover dedicated navigation, confirmation and pending reload recovery, wallet separation, combination trading and mobile layout. Unit tests cover phase/deadline routing, own versus foreign assertions, the preserved practice exceptions, dry-run behavior, journal-before-broadcast, uncertain-response recovery, stale monitoring and spending-policy rejection. These use test fixtures; they are not evidence of a live autonomous settlement or an audit. Public testnet lifecycle acceptance is still required after configuration.
