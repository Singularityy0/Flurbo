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

**Hosted and ready.** On 2026-09-24 the public `/healthz` returned
`learning_comparison: ready`, and the user confirmed readiness. No new environment
values, contract deployment or wallet transaction was required. The authenticated
report and trading checks below remain the manual release checks.

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

## Phase 2: separate funded learning deployment

**Deployed and verified on public Monad testnet.** Pool
`0x094ed5f95188c222a61c27cae24b068120a52dd4` was deployed in transaction
`0xf3fe8a4c0c02cc01a31b6181c224423de823f33fc3e76aec09bdfc465b7d8000`.
All four transactions succeeded and the fresh-deployment verifier accepted block
65,285,695. The verified non-secret snapshot is now in
`config/learning-testnet.json`. Follow
[the learning deployment runbook](LEARNING_TESTNET_DEPLOYMENT.md). The separate
script deploys the existing funded pricing implementation with an eight-event
configuration, explicit update limits and exact initial subsidy. It never changes
the ordinary pool or the hosted trading manifest. Its verifier checks compiled
runtime, immutable configuration, initial state and funding at a pinned block.
The output is deliberately incompatible with `FLURBO_MANIFEST_JSON`.

Deployment signing is complete. Hosting proposal review and retaining access to
both markets are phase 3. Phase 2 alone does not enable automatic learning or
price updates.

## Phase 3a: hosted read-only learning review

**Prepared in source; push and verify the Render build.** Activity & network now
includes the separate learning pool's public status and an unsigned proposal
review. The existing trading and positions panels still target the ordinary pool.
The read-only service checks the accepted block hash, all three deployed runtime
hashes, pinned state, coverage and freshness before returning data.

The new `parlay_testnet_model` Rust binary trains a two-event synthetic A/B model
from one observation (target 0.8, field/pair rates 0.1, b=10), then embeds it exactly
in eight events. C through H are uniform and independent by construction, not
silently pruned from a trained dense model. Python's existing exact-rational
builder rejects excessive movement, graph width and quantization error. The EVM
engine determines funding and before/after quantity quotes. Proposal funding is
capped at 1 test AUSD and checked against the contract's fixed-epoch cap.

Configure `FLURBO_LEARNING_OPERATOR_ACCOUNT` in Render with the full **Mera login
address** of the intended operator. Missing or invalid configuration denies all
proposal preparation. Merely connecting the deployer wallet never grants this
access. The immutable update signer remains the MetaMask deployer. Status requires
a Mera session; preparing a proposal also requires the configured account and a
same-origin POST with no custom model, command, address or network input.

The unsigned review expires after five minutes. When allowance is insufficient,
it explicitly says only the approval was simulated. After approval, preparation
must run again before an exact update simulation. This slice downloads review
evidence only: there is no wallet submission button, server-held key, automatic
approval, update broadcast or live observation ingestion. The next slice adds
reviewed wallet execution, receipt verification and access to trading on the new
market while preserving the original market.

### Hosted checks after push

1. Keep `FLURBO_MANIFEST_JSON` unchanged. The learning deployment uses the separate
   checked-in public manifest; no new contract deployment is needed.
2. Set `FLURBO_LEARNING_OPERATOR_ACCOUNT` to the intended Mera account, then
   deploy. Never enter a private key, seed phrase or wallet password there.
3. `/healthz` should report `learning_pool: configured` and
   `learning_model: ready`. These mean configuration and fixture startup only;
   `chain_state: not_checked` still does not claim live chain readiness.
4. Sign in and open Activity & network > Learning pool > View pool status. It
   should show the new pool, covered collateral and a recent block. Check normal
   trading and positions still use the original market.
5. From the configured Mera account, prepare a synthetic proposal. Check the
   funding, quote change, expiry and whether approval or update was simulated.
   Downloading never sends a transaction. Another Mera account must not see the
   operator button; its direct proposal request must return 403. Signed-out
   requests must return 401.

Local validation: the public testnet preparation returned `approval_required`,
515,545 funding atoms, bias movement 1,283,334 atoms, and an example one-share
A AND B buy cost changing from 259,531 to 279,955 atoms. No public transaction was
submitted. A preceding public RPC batch was rejected; failed requests yield no
review and never send a transaction. The service uses the existing configured
Alchemy endpoint when available, a 25-second overall deadline, capped batches,
10-second status caching and one proposal calculation at a time with a 15-second
minimum interval. The fresh snapshot and simulation are always required again
for a new proposal.

The Rust embedding test, authenticated HTTP access checks, proposal failure
tests, actual Rust/Python integration and frontend production build passed
locally. Render must still verify the Linux container; local build success is not
a claim that this new slice is deployed.

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
