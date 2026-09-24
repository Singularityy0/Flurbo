# Deployment rollout

Checkpoint: 2026-09-24. This document distinguishes release preparation from a
successful hosted build and a verified public transaction. Older phase documents
contain historical statements that predate the public testnet deployment.

## Existing public release

The consumer site at `https://flurbo.singu.online` serves Mera account access,
optional extension-wallet trading and the ordinary eight-event `FactoredPool` on
Monad testnet (10143). AUSD, the H YES receipt, the Kuru pair and the arbitrage
executor are configured in the verified deployment manifest. The pool's immutable
resolver is the deployer. Events are synthetic. The five-minute trade review and
guided approval continuation were verified present in the public frontend bundle.

## Phase 1: hosted Rust comparison

**Prepared in source; verify Render after the user commits and pushes.** No new
environment values, contract deployment or wallet transaction is required.

The Docker build compiles the existing `parlay_compare` Rust executable in a
separate pinned compiler stage. A Node build check executes its complete fixed
synthetic suite and validates every row. Only the executable is copied to the
runtime container, not Cargo, compiler caches or private configuration.

At each hosted server start, one background child process runs that same suite:
five scenarios, three seeds, four models and 41 checkpoints, yielding 2,460
measurements. The child has a 60-second deadline, a 512 KB output limit, fixed
arguments and no inherited service credentials. Runtime errors leave the
comparison unavailable while account access and trading continue. Requests do
not spawn jobs. Results remain in memory until the instance restarts.

Signed-in users can view the summarized result under **Activity & network >
Learning comparison**. `/api/learning/comparison` requires the existing Mera
session and same-origin policy, accepts only GET with no query arguments, and
returns 503 rather than fabricated results if the suite has not completed.
Reports include the binary/output SHA-256 hashes, generation time and Render
commit when available. No wallet addresses or trade history enter the experiment.

This is the hosted synthetic comparison, not live model training, the local
learning lab's wallet controls, published historical-result reproduction or
permission to update executable pool prices. The shared-pool Solidity pricing
and all signing policies remain unchanged.

### Verification after push

1. Check Render's build completes, including the Rust executable check. Do not
   remove the check to force a failing build through.
2. Open `https://flurbo.singu.online/healthz`. `learning_comparison` starts as
   `starting` and should become `ready`; `chain_state: not_checked` remains an
   honest liveness-only statement. If it stays unavailable, inspect the deployment
   logs. No process arguments or service credentials are logged by this feature.
3. Sign in, open Activity & network and load Learning comparison. Check all five
   scenarios, all four model columns, 2,460 measurements and runtime evidence.
   Reload retrieves the same startup result. The page must label it synthetic.
4. Sign out. The comparison API must return 401. Verify a normal quote and a
   small reviewed testnet trade still work in your trading wallet.
5. If the release causes a regression, roll Render back to the preceding deployed
   commit. Keep the existing verified manifest and session-store settings.

Local checks:

```bash
cargo build --offline --locked --release -p flurbo-core --example parlay_compare
FLURBO_TEST_RUST_BINARY="$PWD/target/release/examples/parlay_compare.exe" npm.cmd --prefix apps/web test
npm.cmd --prefix apps/web run build
```

The `.exe` path above is for Windows Git Bash. Linux uses `parlay_compare` without
the suffix. Docker was unavailable on the development machine, so local checks
do not establish a successful Linux container build. Render must pass the
embedded Linux check before this phase is called deployed.

## Subsequent release gates

| Phase | Concrete work and release gate | Human involvement |
|---|---|---|
| 2: learning-enabled testnet pool | Prepare a separately identified `FundedFactoredPool`, verify deployed engine/code/configuration, updater and funding limits, preserve access to the existing pool and its holdings, and rehearse the AUSD lifecycle before enabling public updates. The current pool cannot be upgraded by changing the website. | Review the exact new deployment and funding configuration; sign testnet deployment/approval transactions locally. |
| 3: hosted update proposals | Connect the Rust model and deterministic builder to pinned public snapshots; expose an operator-only review showing model provenance, revision, price changes and funding. Verify buy/update/sell and reject stale proposals. Start with declared synthetic observations. | Explicitly approve and fund each update. Live observations require a separately specified source and ingestion policy. |
| 4: Kuru operation | Host the existing scanner in read-only mode first. Verify depth, inventory, fees and gas on the public pair. Add reviewed order/cancel/deposit/withdraw controls; keep any signing keeper separately authorized. | Operator inventory/gas budget and signing policy; real public fill/cancel evidence. |
| 5: official settlement | Select actual events and resolution rules, implement official-source retrieval, verify the CRE forwarder/workflow on the target network, and deploy a receiver-bound new market. Current immutable resolver remains unchanged. | Event/source selection, CRE access where required and signed deployment. |
| 6: native mobile and remaining integrations | Finish native Mera authentication/trading, verify Android association and recovery, implement indexing/full portfolio, conditional securities and the remaining partner flows in separate slices. These are implementation tasks, not files merely waiting to be deployed. | Android device/passkey checks, hosting/indexer credentials as needed and missing partner criteria. |

No phase claims statistical loss guarantees or exact reproduction of the paper's
historical experiments. Conditional trading requires explicit payout semantics;
AND/OR claims and conditional analytics do not satisfy that milestone.
