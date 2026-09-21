# Funded enumerated reference pool

`ReferencePool` connects the bounded on-chain quote engine to actual ERC-20
transfers, owned claim balances, and one shared liability ledger. Base and
composed claims use the same collateral balance and cost function; trades do
not depend on an RFQ or externally supplied price.

**Local tests only. Settlement, redemption, and subsidy withdrawal are absent.**
There is no path to redeem winning claims after closing, so this contract must
not be deployed with real assets. It is the small-state reference implementation,
not the final factored engine or a completed partner integration.

## Configuration and funding

Each instance fixes its collateral token, cached decimals, binary-event count
(1–3), liquidity parameter b, and future trading-close timestamp at construction.
All quantities are collateral atomic units. The existing [quote domains](QUOTING.md)
apply, including 2/4/8 terminal states, decimals 0–18, and the bounded b range.
There is no admin setter, upgrade path, fee, or variable-liquidity operation.

Starting with zero liabilities, required funding is the rounded-up upper bound
of `C(0) = b * ln(N)` for N terminal states. `fund()` transfers exactly this
amount from its caller once, before closing, with normal ERC-20 approval. The
sponsor receives no LP token or withdrawal entitlement. Direct donations do not
activate trading or change b. The `Funded` event records the sponsor and amount.

With a supported collateral token, conservative buys collect at least the ideal
cost increase; sells pay at most the ideal cost decrease. Across trades these
differences telescope, so initial funding of at least `C(0)` leaves actual
collateral at least `C(q)`, which is at least `max(q)`. Numerical uncertainty and
rounding favor coverage. The contract also checks actual collateral against
`max(q)` before and after each trade. Coverage surplus is not realized profit.

## Trading and ownership

`quoteBuy(mask, quantity)` and `quoteSell(mask, quantity)` are snapshot previews.
Selling previews check aggregate liability but do not require caller ownership.
Both require an open, funded, covered pool. A preview reserves nothing.

`buy(mask, quantity, maxCost, deadline)` and
`sell(mask, quantity, minProceeds, deadline)` recompute from stored liabilities.
The inclusive limit covers collateral only, not gas. `block.timestamp == deadline`
is valid; trading and previews stop at `block.timestamp >= closesAt`.

Holdings are keyed by caller and canonical mask inside this pool. A seller must
own the exact mask and quantity; owning a superset or another user's liability
does not authorize a sale. Successful buys credit holdings and increase every
selected terminal liability; sales reverse those entries. A winning claim unit
represents one collateral atomic unit. No transferable ERC-20/1155 claim token,
split/merge accounting, or conditional security is implemented in this slice.

Each `Traded` event includes the trader, mask, direction, claim quantity, and
executed collateral amount. These events are groundwork for indexing, not an
Envio integration. Event definitions and authenticated resolution metadata must
be specified before the settlement milestone makes claims redeemable.

## Token handling and atomicity

OpenZeppelin Contracts **5.4.0** is pinned for `SafeERC20` and `ReentrancyGuard`.
All mutating entry points share the guard. Accounting changes and token transfers
are atomic: any reverted transfer, limit, ownership, or coverage check rolls back
the entire operation. Effects precede token interactions.

Both sender and receiver balances must change by exactly the signed trade or
funding amount. Fee-on-transfer, extra sender fees, or rebasing during a transfer
are unsupported. Tokens returning no data are accepted when the exact transfer
succeeds; false returns are rejected. Honest balance reporting and stable token
semantics remain assumptions: these checks cannot make arbitrary malicious or
externally confiscatable collateral safe. A detected external shortfall blocks
quotes and trades; this slice has no recovery mechanism.

Tests use test-only collateral with mint/burn controls and adversarial behaviors.
They do not verify AUSD. The [partner checklist](INTEGRATIONS.md) still requires
official network/address validation and the full mobile, Kuru, CRE, Envio,
MetaMask, and Alchemy milestones.

## Verification and next gate

Run `npm ci --prefix contracts`, then `forge test` and `forge fmt --check`.
Pool tests cover funding, overlapping masks, multiple owners, partial sales,
stale prices, inclusive slippage/deadlines, closure, allowance/balance failures,
transfer failures and fees, no-return tokens, reentrancy, and external shortfalls.
Mixed-trade fuzzing independently reconstructs liabilities from owned claims and
checks collateral coverage after every accepted action. Configuration fuzzing
covers all three state counts with 0-, 6-, and 18-decimal collateral.

The next slice is explicit resolution and redemption for this reference pool,
with declared settlement authority and rules. The full product still requires
bounded-treewidth inference, tradable conditionals, and Kuru anchoring.
