# Dashboard settlement and redemption

The dashboard reads the existing factored pool's final outcome and supports
wallet-signed redemption of internal Boolean claims. No contract deployment or
contract change is required. The current persistent demo remains open; its
redemption button is intentionally disabled until close and resolution.

## What the screen shows

The wallet table now includes settlement (pending, winning or losing) and the
AUSD redeemable across each requested holding. Pending payouts are shown as
**Pending**, not zero. These remain the eight base YES claims plus the current
composed claim, not full portfolio discovery. Wrapped receipts and Kuru margin
are excluded from internal-claim payouts and must be handled separately.

Under Wallet & Execution, Settlement & redemption distinguishes an open market,
a closed market waiting for its resolver, and a resolved outcome for events A–H.
The immutable synthetic resolver is still trusted; this does not complete CRE
settlement or introduce real-world event sources.

## Redeem a resolved position

1. Connect the owning wallet to the verified local fork.
2. Select the claim and quantity in Your prediction. No buy/sell quote is needed.
3. Select **Review redeem winnings**. Review the exact AUSD payout, units to burn,
   connected account, pool and gas budget.
4. Select **Redeem winnings in wallet**, then confirm in the wallet.

Winning units pay exactly one collateral atom per quantity atom. Partial
redemption is supported. Losing units can optionally be cleared using **Review
clearing losing units (0 AUSD)**; the review and confirmation explicitly state
zero payout and gas cost. Neither action needs an ERC-20 spending approval.

The review requires a fresh, resolved, covered and receipt-backed local snapshot,
correct account/fork, sufficient internal holdings and MON, and an exact-payout
contract simulation. Submission repeats these checks. The review expires within
30 seconds; unlike buy/sell, the contract's redemption function has no deadline.
Changing inputs or accounts invalidates the review but cannot cancel a wallet
request already opened.

Redemption shares the existing pending-transaction lock and same-tab recovery.
Success requires exact calldata and a matching canonical `Redeemed` event,
including owner, scope, mask, quantity and payout, with two confirmations.
Balances are then re-read. A changed payout, wrong event, duplicate matching
events or an uncertain submission is never treated as success or retried.

## Verification

58 Python and 25 JavaScript tests pass. Coverage includes nonadjacent event
projection, pending versus zero payout, partial winners, losing claims, stale or
unresolved snapshots, insufficient holdings, backing failures, changed outcomes,
wrong payouts, canonical receipts, explicit zero-payout UI and duplicate locks.

The real EVM rehearsal uses a disposable Anvil clone on port **18546**, cloned
from the persistent demo at **18545**. It buys two A AND B units and two
A NO AND H NO units, advances only the clone beyond close, and resolves to A YES,
B YES, all other events NO. It then verifies:

| Action | Units burned | AUSD paid |
|---|---:|---:|
| Partial winning redemption | 0.5 | 0.5 |
| Remaining winning redemption | 1.5 | 1.5 |
| Losing-claim clearing | 2 | 0 |

Each receipt matched; wallet/holding/liability deltas were exact, coverage and
receipt backing held, and repeat redemption with no remaining holdings was
rejected by the wallet planner. The persistent pool's collateral, liability and
resolution state were unchanged. The clone was stopped after the test.

Evidence: ignored `target/deployments/dashboard-redemption-rehearsal.json`.
The rehearsal injects the clone's virtual time into its test process and Python
bridge only. Production dashboard freshness checks are unchanged. This verifies
real contract execution through the wallet module, not an actual MetaMask popup
for redemption. The user's earlier Firefox/MetaMask buy/sell tests are separate.

To reproduce, start a **fresh disposable clone** in another terminal:

```bash
cd /c/Users/anany/Flurbo
anvil --host 127.0.0.1 --port 18546 --chain-id 10143 \
  --fork-url http://127.0.0.1:18545 --silent
```

Then run, and stop only the disposable clone afterward:

```bash
FLURBO_LOCAL_REDEMPTION_REHEARSAL=1 node scripts/rehearse_dashboard_redemption.mjs
```

Set `FLURBO_PYTHON` to a working Python executable if needed. The script fixes
all mutation requests to port 18546 and verifies Anvil, chain and deployment
checkpoint first. It uses an unlocked disposable account, never a user key.
Do not use that port for a chain you want to preserve or reuse the settled clone
for another run. No HTTP resolution endpoint or public deployment is added.
