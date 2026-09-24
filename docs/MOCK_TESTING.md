> Consumer entry: `/markets`. Four separate practice questions replace the operator workspace as the post-login destination. See [MARKETS_MOCK.md](MARKETS_MOCK.md) for the shorter setup.

# Mock-testing handoff

September 24, 2026. The code is prepared for hosted trading tests and a separate
public settlement rehearsal. This is a development checkpoint, not a claim that
all partner integrations or the public alpha acceptance are complete.

## Deploy the application first

Use the small commits in [MOCK_TESTING_COMMITS.md](MOCK_TESTING_COMMITS.md), push,
and wait for Render to finish. The app loads the verified real-event manifest
from `config/pilot-testnet.json` by default. An existing
`FLURBO_PILOT_MANIFEST_JSON` remains authoritative. Remove an empty or stale
override rather than pasting a different pool into it. `FLURBO_PILOT_DISABLED=true`
disables its hosted actions without cancelling any contracts or deadlines.

Keep the original/learning deployment, RPC and Redis configuration. Mera remains
the required login; MetaMask is an optional trading signer, not an account signup.
No wallet keys belong in Render. No new production contracts are required for
the application changes. The separate rehearsal requires the deployment below.

Run this read-only check after Render is live:

```bash
cd ~/Flurbo
npm --prefix apps/web run check:mock
```

Expect `ready_for_manual_trading_checks`. The JSON report in
`target/mock-testing/pilot-readiness.json` checks the hosted manifest, login
boundary, page/security headers, public-chain binding, collateral and a real
one-share quote. It sends no transactions. A missing health field means the new
server has not rolled out yet; it is not a reason to redeploy the real pool.
This check cannot establish real passkey UX, Redis persistence, or wallet fills.

## Prepare the public settlement rehearsal

This creates a **different four-event pool and resolver** on public Monad
testnet. It does not change the real Geth/Reth cluster, its dates or its holdings.
The rehearsal needs 27.725888 test AUSD for initial liquidity, plus deployment
gas. A September 24 dry run estimated 2.414071737011891979 MON in fees; recheck the current
estimate. Foundry's generic ETH label means MON on chain 10143.

Prepare when ready to deploy, not hours in advance. Trading closes twenty-four hours
after preparation; the observation window ends two minutes after that. Assertion,
challenge and voting windows are each one hour. Deployment must happen within
twenty-three hours of preparation. Expect roughly twenty-five hours to finish the planned
scenario, allowing more time if assertions or challenges are delayed.

```bash
cd ~/Flurbo
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
bun workflows/cre/scripts/prepare-rehearsal.ts
forge script contracts/script/DeployRehearsal.s.sol:DeployRehearsal --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --sender "$FLURBO_DEPLOYER"
```

Stop on any error. Review the printed dates, subsidy and simulated fees. Then:

```bash
forge script contracts/script/DeployRehearsal.s.sol:DeployRehearsal --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow
bun workflows/cre/scripts/verify-pilot.ts --rehearsal
clip < target/deployments/rehearsal-testnet.json
```

Enter the keystore password locally. Do not rerun preparation or deployment after
a partial broadcast. Inspect receipts first. The verifier expects a freshly
funded market, so verify before trading. It writes only rehearsal artifacts;
the real pilot manifest and CRE config are preserved. Keep a durable copy of the
verified rehearsal manifest because `target/` is ignored.

In Render add **`FLURBO_REHEARSAL_MANIFEST_JSON`**, paste the copied JSON and save
and redeploy. Never put this JSON in the real pilot variable. Visit
[Testnet rehearsal](https://flurbo.singu.online/rehearsal), sign in and check the
new addresses and deadlines. If unconfigured, this route stays unavailable and
does not fall back to the real pool. Then run:

```bash
npm --prefix apps/web run check:mock -- --rehearsal
```

Run the trading readiness check before the rehearsal closes. After close,
trading becoming unavailable is expected; settlement remains available. The
rehearsal uses the same Mera session and test AUSD token, but separate contracts,
allowances, holdings, history and pending-transaction storage.

## Wallets and funding

- Trader/asserter: your Mera wallet, funded with test AUSD and test MON.
- Challenger: your existing MetaMask deployer, or another non-reviewer test
  wallet. It must be a different address from the asserter.
- Reviewer 1: `0x1fc63b1f8e89473b7bea3b44fc4936b8d9416201`.
- Reviewer 2: `0x41c28b86170b5ec7b261d954e0185fca348b19a4`.
- Reviewer 3: `0x555d165001f60103c9429dbb15bf764caa8ae538`.

Give reviewers test MON for voting. Reviewers cannot assert or challenge from
their registered addresses. Each assertion/challenge needs a 1 test AUSD bond.
Ten test AUSD per participating trader covers the small exercises below. Use
the app's test-funding controls and [Monad faucet](https://faucet.monad.xyz).
Keep an eye on the actual fee estimates. Mera and MetaMask balances are separate.
All reviewer wallets are controlled by you, so resolution is explicitly
operator-run. No independent adjudication is claimed.

## Trading and recovery checklist

Allow about 30 to 60 minutes, excluding wallet setup and the settlement windows.

1. Sign out, visit `/events` directly, and confirm it redirects to login. Sign in
   with Mera, reload, and confirm the login remains. Unlock signing separately.
2. Open `/events` and check the official Geth/Reth questions and real pool
   `0x28d5ee02b1eda6959ac3ee5a4f834237c84dee02`. Do not submit invented outcomes here.
3. Use a funded test wallet to buy one single-event share. Review is read-only.
   If approval is needed, confirm approval, check its receipt, then use
   **Review approved buy** and confirm the separate purchase. There must be no
   automatic second wallet transaction.
4. Check holdings, `/portfolio` and `/history` using the same market and wallet.
   History catches up automatically while visible; incomplete discovery must
   not be interpreted as a zero balance. You can pause or resume loading.
5. Buy one AND claim and one OR claim. Check each exact claim, then sell a small
   amount through a fresh review. A combined claim is not two individual shares.
6. Repeat a small trade with MetaMask. Mera login stays unchanged; holdings belong
   to the selected MetaMask address. Switch wallets and verify separation.
7. Reject one wallet prompt. Confirm no successful trade is reported. Reload
   while another transaction is pending and use **Check confirmation**. Do not
   submit again just because a balance refresh failed. The checked receipt link
   remains visible; unknown submission outcomes require the hash from wallet activity.
8. Lock signing, change account/network, and try an over-balance sell. These must
   fail before a successful trade. Restore Monad testnet and the intended account.
9. Sign out and back in. Restore the same passkey and confirm the same address.
   Do not create a replacement passkey account to recover an existing balance.
10. Test existing original-pair Kuru deposit, post-only order, cancellation,
    withdrawal and a small fill using [HOSTED_KURU.md](HOSTED_KURU.md). That page
    is explicitly the original synthetic H YES pair, not a pilot or rehearsal pair.

## Public settlement exercise

Perform every step on **`/rehearsal`**, not `/events`. The public, fixed fixture
reference is [rehearsal-rules](https://flurbo.singu.online/rehearsal-rules).

Before close, buy and retain one share of **A YES AND B NO AND C YES** in the
rehearsal. Optionally hold A YES and A NO separately to check winning and losing
redemption. Check Portfolio with **Scripted rehearsal** selected.

After observation end, expand **Propose, challenge or review an outcome**:

1. **A, unchallenged YES:** select A and YES. Explain that scripted fixture A is
   YES; enter the fixture reference URL and an excerpt. Save public evidence,
   review and confirm the exact bond approval if needed, then separately review
   and confirm the assertion. Do not challenge A. Record its challenge deadline.
2. **B, disputed NO:** the asserter deliberately proposes YES with an explanation
   saying this is an intentionally incorrect rehearsal assertion. A different
   non-reviewer wallet saves its own NO evidence, then reviews and confirms the
   bond approval and challenge. Switch MetaMask to Reviewer 1 and then Reviewer 2;
   reconnect each, save NO rationale and confirm one NO vote each. Two matching
   votes finalize NO. Reviewer 3 can abstain. Duplicate or ineligible voting must
   not succeed. Never perform this deliberate false assertion on the real market.
3. **C, VOID:** submit no assertion. After its assertion deadline, select C and
   review/confirm deadline finalization. The result must be VOID.
4. After A's challenge deadline, select A and finalize its unchallenged YES.
   Also assert D as YES and finalize D after its challenge window.
   When all four cards are final, review and confirm settlement delivery once.
5. Select your original trading wallet and **Redeem settled shares** for the
   exact claims held. A YES AND B NO AND C YES pays **0.5 test AUSD per share**;
   A YES pays 1 and A NO pays 0. VOID averages compatible states; it does not
   refund the original purchase price. Redeemed holdings must decrease.
6. Withdraw bond credit from each eligible wallet. The unchallenged A asserter
   gets its 1 AUSD bond back. The correct B challenger receives both B bonds,
   totalling 2 AUSD. Check selected-wallet cash, credit and transaction receipts.

Save the public tx hash, wallet, pool, expected result and observed result for
each step. [MOCK_TEST_RESULTS.md](MOCK_TEST_RESULTS.md) is a blank results sheet.
Do not mark public acceptance passed based on the local tests alone.

## Immediate local settlement rehearsal

```bash
cd ~/Flurbo
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
bun workflows/cre/scripts/run-mock.mjs
```

This runs the lifecycle contract tests and an actual four-event EVM rehearsal,
using only a disposable Anvil on `127.0.0.1:18549`. It refuses an occupied port,
does not use your keystore or public RPC, advances only that disposable clock,
and stops its own process. Results are in `target/mock-testing/rehearsal.json`
and adjacent logs. Existing local nodes and public manifests are untouched.

## Checkpoint evidence and limits

Passed locally: 68 ordinary web tests, 37 workflow tests, production build and
type checks; desktop/mobile pilot and rehearsal approval/buy/reload flows;
portfolio automatic catch-up and pause-on-error; original Kuru browser checks;
17 pilot lifecycle tests; two deployment tests; actual four-event local
approval, buy/sell, evidence, unchallenged result, dispute, votes, VOID, delivery,
redemption and both bond withdrawals. The public rehearsal deployment simulation
also passed without broadcasting.

The live site served the protected app and rejected unauthenticated pilot
reads; public pool/code/collateral/quote reads passed. Its new readiness fields
are pending this push/Render rollout. Public rehearsal deployment, environment
configuration and real wallet confirmations are still user steps.

The pause is for a **mock checkpoint**, not finished production: new pilot Kuru
pairs, authenticated CRE delivery, a live collection schedule, independent
dispute reviewers, mobile acceptance and remaining partner criteria are not
completed here. CRE credential refresh returned HTTP 500 before its earlier
live simulation could execute. Scripted rehearsal evidence is explicitly not a
CRE report. Real Geth/Reth assertions remain unavailable until October 7 at
00:01 UTC, and real trading closes September 30 at 00:00 UTC.
