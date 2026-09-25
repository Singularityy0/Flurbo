# Showcase v0 rollout

Separate real Ethereum-activity collection; no existing pool is replaced. The source rules and timing decision are in ADR_SHOWCASE_V0.md. No model/API key is needed for these arithmetic outcomes. This is supervised testnet automation with a bonded challenge and operator-controlled dispute panel, not Kleros or AI adjudication.

## 1. Publish application changes first

Run the web build, source/worker tests and CRE tests before publishing the explicitly reviewed files. Do not include `.superdesign/`, `resources/`, `tmp/`, deployment artifacts, or private configuration. Git commits and pushes belong to the operator.

Deploy the web application before preparing the timed market. Existing October configuration remains valid, and the new Collection dropdown will show the currently registered collections.

## 2. Prepare, deploy, verify (Git Bash)

Only prepare when ready: the four-hour clock starts at preparation (rounded up to the next minute). An existing preparation retains its dates and will refuse reuse when too near close. Never overwrite artifacts for a deployed pool.

```bash
cd ~/Flurbo
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
bun workflows/cre/scripts/prepare-showcase.ts
forge script contracts/script/DeployShowcase.s.sol:DeployShowcase --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow
bun workflows/cre/scripts/verify-pilot.ts --showcase
bun workflows/cre/scripts/bundle-showcase.ts
```

Review the printed questions and UTC deadlines before broadcasting. The deployment funds the pool with 27.725888 test AUSD; keep enough MON for deployment. The bot separately needs test AUSD for four 1-AUSD assertion bonds and MON for gas. The tool creates `showcase-v0-prepared.json`, `showcase-v0-unverified.json`, and verified `showcase-v0-testnet.json` under `target/deployments/`.

The bundle starts from the existing `october-demo-collections.json`, explicitly requires the October pool, and appends Showcase. September keeps its permanent alias. Do not replace October's manifest or use the Showcase manifest as `FLURBO_REHEARSAL_MANIFEST_JSON`.

## 3. Register alongside October

On **Render**:
- `FLURBO_PRACTICE_COLLECTIONS_JSON`: whole contents of `target/deployments/showcase-v0-collections.json`.
- `FLURBO_PRACTICE_ACTIVE_POOL`: the new pool printed by verification/bundling.
- Leave existing pilot, September, RPC, identity and faucet settings unchanged.

In **GitHub Actions secrets**, update `FLURBO_PRACTICE_COLLECTIONS_JSON` with that same combined bundle. Run Settlement monitor and verify a fresh Showcase observation and an empty email queue. The monitor continues covering older pools. Keep the independent watchdog enabled.

## 4. Switch the explicitly allowlisted bot

Save the current October values locally first so they can be restored. Set Actions variable `FLURBO_RESOLUTION_EXECUTE=false` while changing configuration.

- Secret `FLURBO_RESOLUTION_MANIFEST_JSON`: whole verified `showcase-v0-testnet.json`.
- Variable `FLURBO_RESOLUTION_POOL`: new pool.
- Variable `FLURBO_RESOLUTION_RULES_HASH`: verified manifest's rulesHash.
- Keep the dedicated signer address/key and `FLURBO_RESOLUTION_ENABLED=true` unchanged.

Run the worker manually in dry-run mode. Require `monitoring: healthy` and the expected Showcase pool. If another pool has a pending transaction, reconcile it on that original pool; do not delete Redis state. Then set `FLURBO_RESOLUTION_EXECUTE=true` and run again. Before the observation end, `wait` is expected.

The worker reads PublicNode and dRPC, archives the first matching finalized-block observation, asserts four outcomes, finalizes its own uncontested assertions and delivers the collection. It does not cast reviewer votes. Disputes need operator action. Public RPCs and free GitHub schedules are best effort: supervise the one-hour assertion/challenge periods. Data failure does not become NO; no assertion by the deadline permits VOID. No replacement transactions are sent automatically.

After Showcase delivery and pending-transaction reconciliation, restore the October manifest/pool/rulesHash with execution temporarily false, verify its healthy dry run, and re-enable it. Both collections remain browsable even while only one is automated.

## 5. Acceptance before sharing

```bash
node apps/web/scripts/check-mock-readiness.mjs --showcase
```

Sign in as a normal user. Switch Showcase → October → Showcase using Collection. Confirm October shares remain in Portfolio, then check funding, one reviewed purchase, its portfolio entry, What-if, and the source/timing details. The read-only readiness check is not wallet acceptance.

Observation target: close + 2 minutes. Assertion opens: close + 32 minutes. Earliest expected uncontested settlement: about close + 92 minutes plus scheduler/transaction delays. All four base events must finalize before delivery. Combined payouts follow those outcomes; they are not arbitrated separately. Confirm an actual redemption after delivery before reporting the showcase as settled end to end.
