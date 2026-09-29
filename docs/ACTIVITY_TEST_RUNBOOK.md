# Two-event unattended settlement acceptance

Status: tooling implemented; no public deployment or configuration activation performed.

This Test collection validates the existing Ethereum evidence adapter and settlement operations. It is not proof that arbitrary publishers or question types are supported. The general rules engine and macro historical replay have a separate source-support and policy approval gate.

Like the existing Showcase deployment, this recipe uses `PilotResolver`. It does not exercise `AccountPilotResolver` or its holder-gated dispute eligibility. Those paths are covered separately by local contract tests.

## Questions and timing

Both events observe the first Ethereum mainnet execution block at or after trading close plus two minutes: gas used at least 75% of gas limit, and transaction count at least 150. Two configured providers must agree and report finality. Missing evidence is never NO.

Prepare immediately before deployment. Trading closes 90 minutes after preparation, rounded to a minute. Assertion eligibility begins close plus 32 minutes. Each actual assertion then waits one hour for challenges. Earliest delivery is approximately preparation plus 182 minutes, plus transaction and scheduler delays. A challenged or failed run takes longer. Preparation rejects a close less than or equal to one hour away.

## Local checks before preparing

The new code must be reviewed and deployed to the web service and present on Actions' main branch before a timed public test. Run source, worker, preparation and contract tests first. Preserve all older pools and outstanding signer transactions.

## Prepare, deploy and verify

The following commands are for the operator's Git Bash after deployment approval and code publication. They have not been run for a public deployment.

```bash
cd /c/Users/anany/Flurbo
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
bun workflows/cre/scripts/prepare-activity-test.ts
```

Review the printed timestamps and exact questions. Fund the deployer with test MON and the computed pool collateral, then:

```bash
forge script contracts/script/DeployActivityTest.s.sol:DeployActivityTest --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow
bun workflows/cre/scripts/verify-pilot.ts --activity-test
```

Preparation, unverified and verified files use the `activity-test` prefix. Existing files are not a recipe for another deployment. Never delete or overwrite a deployed pool's artifacts to reset its clock.

Export the CURRENT complete Render collection bundle to `target/deployments/current-collections.json`, then:

```bash
bun workflows/cre/scripts/bundle-activity-test.ts target/deployments/current-collections.json
```

This writes a separate `activity-test-collections.json`. Compare it against the current Render bundle: every old pool must still be present. The tool preserves input rows but cannot know whether an operator supplied a stale bundle.

## Register

Render: set `FLURBO_PRACTICE_COLLECTIONS_JSON` to the complete new bundle; optionally set `FLURBO_PRACTICE_ACTIVE_POOL` to Test. Deploy and verify the collection selector and old holdings.

Actions: set the same monitor bundle secret. Keep `FLURBO_MONITOR_ENABLED=true`. Temporarily set `FLURBO_RESOLUTION_EXECUTE=false` while changing primary manifest/pool/rules hash to Test. Keep the signer dedicated, position-free, funded with MON and at least two one-test-AUSD assertion bonds. Confirm `FLURBO_RESOLUTION_ENABLED=true` and `FLURBO_RESOLUTION_PROPOSALS=true`. Monitor credentials, notification delivery and Redis access must already work.

The worker currently generates proposals for one pool at a time. Before switching, verify no other pending pool needs proposals during Test. Finish-only allowlisting is insufficient for missing proposals. Reconcile prior pending transactions; never reset Redis to force a switch.

## Read-only readiness

With the public manifest, signer, RPC and monitor settings loaded securely in the local shell, and Redis read access available:

```bash
# Choose a reviewed gas reserve in wei before running; no default reserve is invented.
node apps/web/scripts/check-resolution-readiness.mjs target/deployments/activity-test-collections.json
```

`FLURBO_READINESS_GAS_BUDGET_WEI` supplies that reserve. This script does not read a private key or sign, send or enable anything. It reads chain state and Redis GET/PTTL. It checks supplied settings, not the actual remote Actions variables. Match those separately in GitHub. `configuration_ready` is not proof of successful schedules or a funded next transaction at a later gas price.

Run the existing worker in dry-run mode and verify the correct pool, healthy monitoring and expected waiting state. While execution is disabled, readiness must report `DISABLED_FLURBO_RESOLUTION_EXECUTE`; resolve every other blocker first. Then enable execution, synchronize the supplied settings with Actions, and rerun readiness to require `configuration_ready`. Let scheduled jobs run without manual settlement dispatches. The dry-run/readiness preparation is not a settlement transaction or proof that the schedule works.

## Acceptance evidence

- Clearly identified test trades from participant test wallets; never from the proposer.
- A successful monitor schedule and worker schedule, not only a manual workflow dispatch.
- Evidence archive and both YES/NO proposals from the worker with transaction receipts.
- Finalization after each actual challenge deadline and delivery after both results are final.
- A holder-initiated redemption with its receipt and balance effect. Automatic bulk payout is not implemented.
- The complete set of run links, timestamps and transaction references in the test report.

If manual intervention is required to submit, finalize or deliver, record an unattended failure even if recovery succeeds. Reviewer intervention is expected for a deliberately disputed test, but should be a separate acceptance scenario. A missed assertion deadline is not recoverable by proposing late; timeout produces VOID under the fixed rules.

After finishing, reconcile pending transactions and restore the planned proposal pool with execution temporarily disabled, then confirm its readiness before enabling it. Leave Test registered for history and redemption.
