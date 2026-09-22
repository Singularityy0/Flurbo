# Conservative factored buy/sell quotes

`FactoredQuote` applies a local Boolean trade to a supplied factored snapshot,
derives both cost enclosures using `FactoredCost`, and returns a conservatively
rounded collateral amount, fresh factor tables, and exact maximum liability
after the trade. It is an internal pure library, not a funded pool or RFQ service.
No caller supplies the execution price or an assumed cost interval.

## API and supported trades

`Market` holds the event count, fixed liquidity, collateral decimals, factor
tables and elimination order. Liquidity, table entries, trade quantities, limits,
collateral quotes and returned maximum liabilities all use collateral atomic
units. One winning claim atom pays one collateral atom. The adapter converts
to WAD exactly with `10^(18-decimals)`; decimals must be between 0 and 18.

`buy(market, scope, mask, quantity, maxCost)` and
`sell(market, scope, mask, quantity, minProceeds)` return a `Quote`. Scope is a
uint32 event bitmap containing one to three events from the market. Ascending
set bits define local bit order. Mask selects local winning assignments: for
scope `[A,B]`, AND is 8, OR is 14, and NOT A is 5. Zero, full and out-of-range
masks are rejected. This is a Boolean payoff, not a conditional security.

Quantities must satisfy `0 < quantity <= liquidity` in atoms. There is no
floating-point minimum-ratio requirement; unresolved small sizes fail explicitly.
Before and after snapshots must satisfy the [factored domain](FACTORED_NUMERICS.md),
including 1–32 events, at most 64 factors, and the same fixed elimination order
with induced width at most two. No automatic graph reordering occurs.

## Applying the trade

All factors with exactly the requested scope are summed into one table. Buys
add quantity to winning entries; sells subtract it and reject any local
underflow. A new scope consumes a factor slot; an existing scope is reused.
Unrelated tables are copied, and the merged table is appended. Zero-valued
tables retain their declared scopes. Returned arrays do not alias input values.

As in the Rust simulator, a sell cannot draw on liabilities stored on a different
scope, even when the global payout would remain nonnegative. Equivalent payoffs
expressed with redundant scope events do not automatically share a selling
allowance. Sufficient aggregate liability is never proof of seller ownership.

## Rounding, limits and maximum liability

The adapter derives cost enclosures for the original and proposed graph, then
uses `QuoteMath` to charge `ceil(upper(after)-lower(before))` for buys and pay
`floor(lower(before)-upper(after))` for sells, converting WAD to atoms outward.
Limits are inclusive. It rejects zero-collateral quotes, buys costing more than
quantity, and sells whose enclosures cannot establish nonnegative proceeds.
It neither clamps prices nor reduces the requested quantity to make a trade fit.

`maxLiabilityAfter` is computed with the exact max-sum evaluator. Because input
tables and updates are atom-aligned, its conversion from WAD is exact. This is
the maximum outstanding payout over one shared outcome, not a funding check.

Independent Decimal fixtures agree at 80/120 digits and cover AND, OR and NOT
claims at 0/6/18 decimals. They compare charges/payouts to ideal rounded cost
differences using the [analytical endpoint budget](FACTORED_NUMERICS.md).
Tests also cover exact post-trade maxima, inclusive limits, capacity reuse,
duplicate scopes, unsupported graph updates, input preservation, and round trips,
including a 32-event claim containing event 31. Run the fixture generator with
`python scripts/factored_quote_fixtures.py`, then `forge fmt` and `forge test`.

## Execution boundary

`ReferencePool` still uses the enumerated adapter. The factored quote module
itself does not authenticate snapshots, hold funds, track owners, reserve a price,
enforce deadlines, or transfer collateral. The [local factored pool](FACTORED_POOL.md)
now loads stored state, recomputes the quote, enforces owner holdings and coverage,
and updates factors and holdings atomically. It includes trusted resolution and
redemption; actual conditional claims remain a separate gate. A quote computes
two costs and one exact maximum with repeated validation; large graph gas
optimization remains necessary before deployment.
Kuru anchoring and the other [partner requirements](INTEGRATIONS.md) remain required.
