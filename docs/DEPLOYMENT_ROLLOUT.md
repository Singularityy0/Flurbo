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

**Hosted and checked by the user.** Activity & network now
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
must run again before an exact update simulation. Phase 3a provided downloaded
review evidence only. Phase 3b below adds reviewed extension-wallet execution;
consumer trading on the new market is still a subsequent slice. There is no
server-held key, automatic approval or live observation ingestion.

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
locally. The user subsequently confirmed the hosted checks.

## Phase 3b: reviewed operator wallet execution

**Hosted, with the first public update confirmed.** The user confirmed the update
count changed to 1, and a subsequent public read corroborated that count and the
279,955-atom one-share A AND B buy quote. The learning panel connects an extension wallet for the immutable
updater. The existing Mera operator session is checked before preflight and again
before the wallet prompt. Connecting MetaMask does not create a Flurbo login or
grant operator access. The ordinary trading pool and its manifest remain intact.

Every transaction is a separate explicit action. The browser reconstructs the
exact calldata, caps added funding at 1 test AUSD, verifies the wallet account,
chain, accepted public block, pool/engine/factory runtime hashes, snapshot and
revision, and simulates the action again. It also estimates gas and checks MON.
Changing the account, network or displayed review invalidates preflight. An
already open wallet prompt must still be rejected in the wallet if no longer
wanted. Update deadlines remain enforced by the contract; approvals do not have
a contract-enforced deadline and grant only the displayed exact allowance.

Transaction tracking is saved in browser storage before opening the wallet.
A browser lock prevents concurrent submissions from Flurbo tabs. Reloads restore
the pending action; rejected prompts clear it, while ambiguous outcomes block a
new submission until resolved. This stores public review data, nonce and hash,
never credentials or private keys. A replacement hash can be attached, but must
match the original sender, nonce, destination and calldata. Clearing tracking
requires explicit acknowledgement and does not cancel a blockchain transaction.

Confirmation requires the exact transaction and two canonical block
confirmations, plus either the matching AUSD `Approval` or `BiasUpdated` event.
The update event must match the proposal hash, next revision, funding cap and
reviewed reserve. Receipt checks detect a changed canonical block. They run every
10 seconds for up to two minutes, then remain available through **Check
confirmation**. No check retries a transaction submission.

### Deployment and manual acceptance

1. Push this focused frontend/shared-ABI change and let Render rebuild. No new
   contracts or environment values are needed. Keep `FLURBO_MANIFEST_JSON` and
   the configured Mera operator address unchanged.
2. Sign in with that Mera account. Open **Activity & network > Learning pool >
   View pool status**. Connect MetaMask using the immutable deployer
   `0xf1fea08ebba92ed342acc5639db312c3694bc391` on public Monad testnet.
3. Prepare a synthetic proposal. Review maximum funding, price change and expiry.
   If needed, choose **Confirm AUSD approval in wallet** and confirm only that
   approval. The page verifies its receipt, then prepares a fresh proposal.
   If preparation hits the 15-second service interval, wait and prepare again.
4. Review the fresh update and choose **Confirm pricing update in wallet**.
   Check its receipt, the increased update count and refreshed reserve. A mined
   transaction alone is not reported as a verified update. Keep the transaction
   hash for the public acceptance record.
5. A refresh while pending should restore tracking after loading pool status and
   reconnecting the deployer. Wrong wallet, wrong chain, expired or changed
   reviews must not open a transaction prompt. Signing out removes the controls.
6. Verify ordinary trading and positions still use their original market. This
   slice does not expose consumer trading on the learning pool. Reapplying this
   unchanged synthetic model is rejected; live observations need a separate
   source and ingestion policy.

Validation: all 40 web tests passed, including actual Rust/Python integration,
along with TypeScript and the production build. A disposable, owned Anvil EVM
rehearsal ran the browser signing functions against the compiled eight-event
contracts, confirmed separate approval/update receipts with two blocks, and
matched the actual Solidity proposal hash. Funding was 515,545 atoms and the
one-share A AND B quote changed from 259,531 to 279,955 atoms. This used an
in-memory local fixture identity, not an edit to the public manifest. No public
transaction was sent during development. Render's container build and the
user's real extension-wallet confirmations were the public release checks. The
user subsequently completed the approval and update and reported Updates = 1.

## Phase 3c: selectable learning-pool trading

**Implemented and locally verified; awaiting push, Render build and public
trading acceptance.** Signed-in users can select Original pool or Learning pool
in the workspace. Quotes, allowances, buy/sell reviews, holdings, redemption and
transaction receipt checks use the selected pool. Mera remains the login method;
either Mera or a connected extension wallet can sign consumer transactions.
Consumer trading does not require the operator's Mera account or deployer wallet.

The pools have separate positions and allowances. The wallet's AUSD balance is
shared. The original pool, its manifest and its H YES receipt/Kuru integrations
remain accessible. The learning pool has no external receipt or Kuru deployment,
so those controls and balances are hidden there. Its collateral requirement
includes the pricing reserve as well as outstanding payouts.

Selection persists within the browser session. Switching rebuilds the trading
view and clears the previous quote. Switching is disabled during an active
review, operation or tracked pending transaction. Each market has separate
pending-transaction storage. The client and server reject cross-market quotes,
approval destinations and transaction targets. A failed learning reader returns
unavailable instead of using the original pool as a fallback.

Production starts a second private Python reader on `127.0.0.1:18768`, exposed
through authenticated `/api/markets/learning/` routes. It verifies the checked-in
deployment checkpoint and runtime hashes, reads a pinned block, and checks
collateral and freshness. No new contracts or environment settings are needed.
Keep `FLURBO_MANIFEST_JSON` and existing operator/RPC settings unchanged.

Positions still list the eight base YES claims plus the currently composed
claim. This is not a complete portfolio index. Re-select the same combination
when checking its balance. There is still no live observation ingestion or
automatic repricing.

### Deployment and manual acceptance

1. Push the reader/API and frontend changes, then let Render build successfully.
2. Sign in and select **Learning pool**. Check its address is
   `0x094ed5f95188c222a61c27cae24b068120a52dd4`, its coverage is healthy and the
   displayed snapshot is fresh. The learning operator panel remains separate.
3. Select A YES AND B YES, Buy, 1 unit. Connect the funded test wallet. Review
   and explicitly confirm the approval if needed, then the buy. Wait for the
   matching trade receipt before checking positions. The selected wallet should
   hold 1 unit if it started with none.
4. Sell that 1 unit through a fresh review. Confirm the sell and verify the same
   composed position returns to zero. Gas and rounding can reduce wallet funds.
5. Switch to **Original pool**. Verify original holdings, receipt controls and
   Kuru remain available. Reload and check the selected market is retained.
6. If the new reader is unavailable, inspect Render logs and RPC configuration.
   Do not replace the original manifest with the learning manifest or redeploy
   contracts to resolve a reader failure.

Validation: 46 web tests (including browser and real Rust/Python integration),
47 dashboard tests, 29 existing Python dashboard tests and 4 learning-reader
tests passed, along with TypeScript and the frontend production build. Public
read-only checks returned Updates = 1 and a 279,955-atom A AND B buy quote. An
owned disposable EVM rehearsal ran the funded update, bought one combined share,
read holdings changing from 0 to 1, sold it and read 0 again, checking canonical
buy/sell events. Buy cost was 279,955 atoms and sell proceeds were 279,954 atoms.
No public trading transaction was submitted during this phase's development.
Render's container build and the user's public buy/sell remain release checks.

## Subsequent release gates

| Phase | Concrete work and release gate | Human involvement |
|---|---|---|
| 2: learning-enabled testnet pool | Deployed and verified separately; existing pool preserved. | Completed deployment signing. |
| 3: hosted learning and trading | Synthetic comparison, proposal review and first funded update are hosted and checked. Selectable consumer trading is locally verified and awaiting the Phase 3c release checks. | Push, confirm Render build, then explicitly confirm a public learning-pool buy and sell. Future live observations need a separately specified source and ingestion policy. |
| 4: Kuru operation | Host the existing scanner in read-only mode first. Verify depth, inventory, fees and gas on the public pair. Add reviewed order/cancel/deposit/withdraw controls; keep any signing keeper separately authorized. | Operator inventory/gas budget and signing policy; real public fill/cancel evidence. |
| 5: official settlement | Select actual events and resolution rules, implement official-source retrieval, verify the CRE forwarder/workflow on the target network, and deploy a receiver-bound new market. Current immutable resolver remains unchanged. | Event/source selection, CRE access where required and signed deployment. |
| 6: native mobile and remaining integrations | Finish native Mera authentication/trading, verify Android association and recovery, implement indexing/full portfolio, conditional securities and the remaining partner flows in separate slices. These are implementation tasks, not files merely waiting to be deployed. | Android device/passkey checks, hosting/indexer credentials as needed and missing partner criteria. |

No phase claims statistical loss guarantees or exact reproduction of the paper's
historical experiments. Conditional trading requires explicit payout semantics;
AND/OR claims and conditional analytics do not satisfy that milestone.
