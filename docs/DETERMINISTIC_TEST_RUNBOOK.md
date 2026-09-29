# Deterministic official-source settlement rehearsal

Implementation is present. A successful public unattended run has not yet been established. The current prepared artifacts, when present, have immutable deadlines and must be preserved. Do not rerun preparation to reset an already deployed collection.

## Scope and source meaning

The `deterministic-source-v1` collection uses the existing `PilotPool` and `PilotResolver`. No pricing, payout or resolver contract logic changes are required. It exercises two real USGS catalogue observations through the general rule engine, including either YES or NO proposals, durable evidence, finalization and delivery. It does not exercise `AccountPilotResolver` holder-gated challenges or demonstrate support for arbitrary question formats.

The questions concern the number of earthquake records in two separate five-minute origin-time intervals, as reported by the first complete catalogue response retained during each fixed five-minute snapshot window. Event A compares its count with one using `gte`. Event B compares its count with zero using `eq`. The outcomes are not scripted or guaranteed.

USGS `metadata.generated` identifies catalogue generation. It is not the first publication time of an earthquake and is not evidence that the catalogue is complete with respect to the physical world. The committed `first-observed-snapshot` policy makes this limitation part of the question. Later catalogue additions or revisions do not replace the chosen snapshot. Missing, malformed or incomplete responses do not become zero.

The adapter fixes the official query endpoint, exact UTC interval, earthquake event type and ascending time order. It prohibits pagination and caller-supplied limits, checks returned count against the full feature list, checks distinct IDs and interval membership, and retains the complete response. The official service rejects queries exceeding its 20,000-event limit; transport and parser size limits also fail closed. See the [USGS event API documentation](https://earthquake.usgs.gov/fdsnws/event/1/) and [GeoJSON format documentation](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).

## Commitments

Every event contains `settlement-rule:sha256:<hash>` as its source record ID. The hash commits the complete canonical machine-readable rule, including source URLs, adapter, observation, comparison, vintage and windows. That record ID is inside the existing ABI-encoded draft commitment. Event hashes and resolver configuration derive from this draft hash; the resolver rules hash additionally binds its address and creator.

Preparation, verification, collection registration, server construction and the deterministic worker validate these bindings. Changing a threshold or URL together with the public event text still fails against the old manifest commitment. Static checks do not prove a deployment: the normal live snapshot also checks the deployed pool's rules hash, resolver binding and code hashes. Source authenticity remains a trust assumption about the publisher and HTTPS retrieval, with the existing bonded challenge process.

## Before starting deadlines

Prepare only when the deployer can sign, the dedicated settlement bot is funded, durable storage and a publicly reachable HTTPS evidence endpoint are working, and the local monitor and worker are ready. The bot must have no position in the collection and cannot be one of its reviewers. Separate test wallets may place clearly identified test trades.

The two-event pool requires 13.862944 test AUSD at the recipe's liquidity parameter. The bot needs at least two one-test-AUSD assertion bonds plus test MON for approval, assertion, finalization and delivery. Gas reserves depend on current gas prices and must be checked separately. Reviewer wallets are disclosed as operator controlled in this test recipe; they are not an independent panel.

Keep the machine awake and run the local loop frequently enough to capture within the five-minute windows, preferably once per minute or faster with nonoverlapping executions. A GitHub five-minute schedule is too close to this window to establish reliable capture under normal scheduling delays. This run tests the locally hosted scheduler, not GitHub Actions availability.

## Prepare, deploy and verify

These are operator Git Bash commands. The encrypted account and public deployer address must already be configured. Do not paste private keys into shell commands, chat or source files. The human deployment helper can perform these same steps after funding. The explicit `demo` profile is required for the deployment script's permitted artifact reads and writes.

```bash
cd /c/Users/anany/Flurbo
export FOUNDRY_PROFILE=demo
bun workflows/cre/scripts/prepare-deterministic-test.ts --prepare
forge script contracts/script/DeployDeterministicTest.s.sol:DeployDeterministicTest --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow
bun workflows/cre/scripts/verify-pilot.ts --deterministic-test
```

The account name above is the existing local `flurbo-testnet` account used by the prior test tooling. Confirm it matches the prepared creator before broadcasting. Deployment must occur while trading close is still more than one hour away. Verification must occur before any trade or assertion, because the verifier requires a fresh pool without factors or outcome activity.

All output paths use the new `target/deployments/deterministic-test-` prefix: `prepared.json`, `unverified.json`, `testnet.json` and `collections.json`. Preparation refuses silent overwrite. Preserve broadcast receipts and every deployment artifact. A failed RPC or uncertain transaction must be reconciled before another broadcast; it is not permission to deploy another pool blindly.

The deployment script writes the unverified pool, resolver and immutable hashes. It does not independently recreate publication metadata. Verification rebuilds the prepared publication and compares it with the deployed configuration. The `--deterministic-test` verification mode rejects a legacy publication and does not generate the original pilot's CRE configuration.

## Local website and worker registration

Use the complete saved collection bundle for the environment under test. For an isolated local rehearsal, an explicitly saved `[]` file is acceptable. It is not a replacement for the production bundle.

```bash
bun workflows/cre/scripts/bundle-deterministic-test.ts target/deployments/current-local-collections.json
```

Load the resulting complete bundle into local `FLURBO_PRACTICE_COLLECTIONS_JSON`, and set `FLURBO_PRACTICE_ACTIVE_POOL` to the verified pool. The website labels the collection `Source test`. Confirm that the collection selector, requests, review and pending transaction recovery use `practice-<pool-address-without-0x>`. Old pool aliases remain unchanged.

Configure the worker with the verified manifest and exact pool/rules-hash allowlist, plus `FLURBO_RESOLUTION_SOURCE_MODE=deterministic-source-v1`. Its public HTTPS evidence origin must serve the same durable archive used by the worker. Both `FLURBO_RESOLUTION_PROPOSALS=true` and `FLURBO_RESOLUTION_EXECUTE=true` are necessary for automatic assertions. Initially run with execution disabled to inspect readiness, then enable it only after the verified configuration, source capture, public evidence and monitoring checks pass. The bot key stays in the existing secret-loading path, never in the publication or bundle.

Source capture starts before assertion eligibility. Every complete selected response must be archived during its committed snapshot window. Assertions open only at the corresponding observation end. Public evidence bytes and packet hashes are verified again before signing. The independent monitor must continue reporting fresh observations. Storage, source or public archive failures stop proposals and must be investigated while time remains.

## Timing and acceptance

Trading closes approximately 90 minutes after preparation. The second assertion window opens 20 minutes after trading closes. An unchallenged assertion becomes finalizable one hour after its actual on-chain submission. Earliest complete settlement is therefore approximately preparation plus 170 minutes, with extra time for the scheduler and transactions. Challenges or source failures extend the process. Missing assertions can only timeout to VOID once their fixed assertion deadline has passed.

Record the following in the run report:

1. Prepared rule hashes, verified deployment, pool and resolver, and UTC deadlines.
2. Test trade receipts from participants and proof the bot stayed position free.
3. Unattended loop logs showing monitor and collection ticks before both snapshot cutoffs.
4. Exact archived USGS query responses, generation and capture timestamps, hashes, and replayed comparisons.
5. Public evidence URLs that return the committed bytes, plus assertion transaction receipts and actual challenge deadlines.
6. Scheduled finalization and delivery receipts after both events become final.
7. A holder-initiated redemption receipt and balance effect. Delivery makes claims redeemable; it does not send all payouts automatically.

If a human manually submits an assertion, finalization or delivery to recover the run, record that intervention and do not call the run unattended. A successful local run does not validate production Render configuration, GitHub schedules, source availability at another time or reviewer independence. Leave completed markets and archives available for history and redemption.
