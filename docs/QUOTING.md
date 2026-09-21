# Bounded atomic-unit buy/sell quotes

`LmsrQuote` composes `LmsrCost` and `QuoteMath` into fee-free quotes for the
enumerated reference engine. All amounts in its API are collateral atomic units,
including the fixed liquidity parameter b. No caller supplies a price or cost
interval. The library derives both intervals from the supplied state snapshot.

## Inputs and outputs

`Market` contains the terminal-state liability array, b, and collateral decimals.
`buy(market, mask, quantity, maxCost)` and
`sell(market, mask, quantity, minProceeds)` return a positive collateral amount
and a fresh array of resulting liabilities. Neither mutates the input snapshot.
One winning claim atomic unit pays one collateral atomic unit.

Allowed state counts are 2, 4 and 8. The mask selects terminal states, as in the
Rust payoff algebra; empty, all-true and out-of-range masks revert. Equivalent
Boolean expressions with the same canonical mask receive the same quote.
Quantities must satisfy `0 < quantity <= b` in atoms. The quote path permits
one-atom sizes when resolvable; it does not inherit the floating-point oracle's
minimum ratio, which protects that separate numerical implementation.

Before and after states must both satisfy the cost evaluator's WAD domain:
`1e12 <= bWad <= 1e27`, `0 <= qWad[i] <= 100*bWad`. Decimals must be 0–18.
Conversion uses an exact factor, `10^(18-decimals)`, without float intermediates.
All states are validated, including those not selected by the claim.

A buy adds quantity to every selected state. A sell subtracts it and rejects
underflow. **Sufficient aggregate liability is not proof of seller ownership.**
`ReferencePool` separately verifies the caller owns the exact claim units.

## Pricing, numerical uncertainty, and limits

Prices use the [derived cost intervals](COST_ERROR_BOUND.md) and the existing
[rounding rules](NUMERICS.md): buys round up; sells round down. Limits are inclusive:
cost equal to maxCost passes, as do proceeds equal to minProceeds. Violations revert.
These limits cover the returned fee-free collateral amount, not gas or future fees.

Reject a sell if the cost intervals cannot establish nonnegative proceeds.
Also reject any zero-collateral quote and any buy priced above its maximum
payout (quantity). These are explicit unquotable-size outcomes, not zero-value
executions or silently clamped prices. A wider uncertainty interval can make a
tiny trade unquotable even though its ideal mathematical price is positive.

With per-cost error allowance E, an interval endpoint may be up to 2E from the
true cost. Two endpoints make a cost-difference allowance of 4E. Tests compare
complete quotes against independently rounded Decimal cost differences, allowing
`ceil(4E/scale)+1` atoms of excess conservatism; they do not require equality with
an unguarded floating-point price. The selected trade quantity is never reduced.

## Boundary to execution

This is an internal, pure quoting library, not a funded pool or RFQ service.
The [reference pool](REFERENCE_POOL.md) loads its stored cluster state, recomputes
the quote at execution, enforces caller ownership and collateral balances, checks
the deadline and trading lifecycle, and transfers collateral atomically with
holdings updates and terminal-liability coverage checks. A quote is not a
reservation. The pure library itself implements no wallet approval, settlement,
token transfer, or withdrawal.

The funded reference pool is tested with mock collateral, including local
[resolution and redemption](SETTLEMENT.md). This is a small-state validation path;
authenticated CRE resolution, factored inference, conditional securities, Kuru
anchoring and partner milestones remain required.

## Checks

```sh
python scripts/lmsr_quote_fixtures.py
forge fmt
forge test
```

Fixtures reuse the eight Rust-reference scenarios, choosing exactly representable
atomic amounts, and add 0/18-decimal variants. Ideal quote integers must agree
at 80 and 120 Decimal digits. Other tests cover inclusive limits, rejected claims
and amounts, domain failures, no input mutation, and conservative buy/sell round trips.
