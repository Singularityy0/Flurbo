# Settlement checks

The checker reads the deployed pilot or practice resolver on Monad testnet. It does not sign, submit transactions, evaluate source truth or send email. No scheduler is installed by this command. Contract pricing, collateral and settlement behaviour are unchanged.

Run from the repository root in Git Bash with Node 24 and the web dependencies installed:

```bash
# Real-event pilot
node apps/web/scripts/check-settlement.mjs

# Separate practice deployment
node apps/web/scripts/check-settlement.mjs --rehearsal
```

The pilot defaults to `config/pilot-testnet.json`; practice defaults to `target/deployments/rehearsal-testnet.json`. A hosted runner can supply the corresponding `FLURBO_PILOT_MANIFEST_JSON` or `FLURBO_REHEARSAL_MANIFEST_JSON`. Keep each manifest bound to its original pool. Replacing one does not monitor both deployments.

`FLURBO_ALCHEMY_TESTNET_RPC_URL` optionally selects the private Monad testnet endpoint already supported by the backend. Otherwise the public Monad testnet RPC is used. Enter credentials in hosting secrets or your local environment, never in Git or chat. Provider error details are withheld in output.

## Reports and exit codes

| Exit | Meaning | Operator response |
| --- | --- | --- |
| 0 | Complete verified read, no active warning/critical alert | Inspect informational transitions; this does not certify source truth or future coverage. |
| 1 | Complete verified read, action or attention required | Read each alert and its event/deadline. This is not a checker crash. |
| 2 | Read, configuration, persistence or lock failure | State is not certified current. Inspect the service and resolver manually. |

The JSON includes the observed block, chain timestamp, pool collateral and reserve in token atoms, per-event state, evidence hashes, vote counts, deadlines and suggested next actions. Times are Unix seconds in UTC. Action eligibility uses chain time; wall time only checks freshness and gaps. A deadline warning is emitted at 30 minutes and escalates at 10 minutes. Active warnings remain visible on subsequent runs.

Each deployment has separate hashed `.report.json`, `.checkpoint.json` and transient `.lock` files under `target/settlement-monitor/`. The checkpoint advances only after a complete verified read and report write. Failed chain reads overwrite the latest report with a failure but preserve the last successful checkpoint. A changed checkpoint block generates a reorg alert. An RPC head behind the checkpoint is a failure, not evidence of a reorg.

A lock prevents overlapping checks on the same local filesystem. After a process crash, first confirm that no checker is running, then remove only that deployment's stale `.lock` file. Corrupt checkpoints fail closed; preserve them for diagnosis before an explicit reset. A reset loses transition/gap comparison, although active assertions are still reported.

## Act on the report

1. **Pending:** wait until observation ends, then inspect the event's committed rules and evidence before asserting. Missing evidence is not automatically NO. If no assertion arrives before its deadline, a `finalize` transaction can record VOID.
2. **Asserted:** review immediately. An incorrect proposal must be challenged by an eligible different non-reviewer wallet before `challengeUntil`. An incorrect, unchallenged proposal can be finalized after that deadline. The checker cannot reverse it or prevent direct contract calls.
3. **Disputed:** the named reviewers inspect both evidence sets and vote before `voteUntil`. Quorum finalizes the case during voting. If voting expires without finalization, a separate `finalize` transaction can record VOID.
4. **All events finalized:** a separate `deliver` transaction makes the cluster outcomes available to the pool. Finalized event cases alone do not mean holders can redeem yet.
5. **Delivered:** inspect the exact position payout and redeem through the existing reviewed transaction flow. Delivery is not source verification.

Use the existing settlement controls and wallet review for each action. The three test reviewer wallets belong to one operator; they are not independent adjudication. Collateral deficits, unfunded pools, failed reads and reorg alerts require investigation. Do not interpret any of them as an automatic authorization to transact.

## Coverage limits and email activation

This is a snapshot checker, not a complete log indexer. An assertion and subsequent finalization between checks can be missed as intermediate transitions. A gap over five minutes is reported only when a later check succeeds. A stopped process cannot alert about its own failure. A single successful run does not establish continuous monitoring.

Email is the selected delivery channel. Keep the recipient in deployment configuration, not source. Delivery is **not active** in this slice. Before unattended settlement, the next slice must provide:

- A configured mail provider and sender, with credentials in hosting secrets.
- Durable notification state separate from chain checkpoints, bounded retries and duplicate suppression; failures must not silently acknowledge an alert.
- A continuously available runner checking each active pool at least once per minute, with durable storage and an independent missed-check watchdog. Sleeping free web hosting alone is insufficient coverage.
- A test email confirmed in the recipient's inbox, plus an injected RPC-failure alert and a stopped-runner watchdog drill.
- An operator assigned to every active assertion/challenge/voting window, with wallet access and a rehearsed response. Email alone does not guarantee timely intervention.

Until those gates pass, actively supervise the deployed settlement windows. Do not describe email, a watchdog or unattended resolution as deployed.

## Validation

```bash
cd apps/web
node --experimental-strip-types --test tests/settlement-monitor.test.ts tests/pilot.test.ts tests/pilot-index.test.ts
```

Fixtures cover exact deadline boundaries, wall-clock skew, disputed and finalized states, separate delivery, collateral shortfall, missing funding, stale/wrong-chain reads, changed blocks, restart/gap handling and preserving the last successful checkpoint on RPC failure. These tests are evidence, not an audit or proof.
