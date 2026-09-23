# Integer funded repricing: local contract phase

`FundedFactoredPool` now implements the accounting bridge from the
[offline reference](FUNDED_REPRICING.md) using collateral atoms and conservative
cost intervals. Foundry tests deploy and trade against it locally. The persistent
dashboard still uses its existing pool; no public deployment or user-wallet
transaction was performed. No statistical loss guarantees are claimed.

## Pricing and payout accounting

The pool inherits existing ownership, ERC-20 receipt backing and settlement.
Actual payout factors q remain separate from pricing-bias factors a. A constructor-
deployed immutable `FundedPricingEngine` evaluates the combined graph for prices.
It has no balances or mutable state. It reuses the existing interval arithmetic,
exact maximum-liability inference and conservative buy/sell rounding.

The reserve is `ceil((upper(C_a(q)) - min_x a(x)) / atomScale)`. To compute the
minimum without enumeration, reflect each bias table around its local maximum:

```
min_x sum_f a_f(x) = sum_f max(a_f) - max_x sum_f [max(a_f) - a_f(x)]
```

The latter maximum is exact max-sum inference. Simply adding local minima would
be wrong when their minimizing states conflict; the tests include that case.
Buy charges ceil(upper(after)-lower(before)); sell pays
floor(lower(before)-upper(after)). These directions preserve coverage of the new
upper reserve, including rounding. Unresolvable or zero-value quotes reject.

Before resolution, `requiredCollateral()` is the larger of the pricing reserve
and actual maximum payout. `actualRequiredCollateral()` exposes the actual payout
requirement separately. After resolution, both coverage getters use remaining
winning payouts; learning biases are never redeemed. `pricingReserve()` retains
its last pre-resolution value and is no longer the settlement requirement.

## Update authorization and limits

The immutable `UpdatePolicy` selects an updater, maximum bias movement, funding
limit per fixed epoch, epoch duration and minimum interval between updates. Only
that updater may call `updateBias`, and it supplies the required collateral itself.
There is no delegated signature or relayer in this phase.

Each `Update` contains chain ID, pool address, expected revision, deadline,
maximum funding and proposed bias tables. Every executed trade or update advances
the revision. An intervening trade invalidates an old update proposal. Trader
execution continues to use the existing deadline and buy/sell slippage limits.
Ownership-only wrapping and unwrapping do not change pricing state or revision.

An update must pass all checks before returning successfully:

- Funded/open lifecycle, existing coverage, updater, domain, revision and expiry.
- Fixed-order graph width <=2, at most 64 **combined payout plus bias factors**,
  scopes of at most three events, and the existing combined numeric domain.
- Canonical bias scopes in strictly increasing order, no duplicate/constant
  scopes, and each table normalized to local minimum zero.
- A conservative bound on `range_x(a_new(x)-a_old(x))` no greater than the
  configured movement limit (itself no greater than liquidity b).
- Minimum update interval and both proposal funding cap and epoch funding cap.
- Exact incoming transfer of `max(0, newReserve - actualPoolBalance)`.

Any failure rolls back the complete update, including reserve, revision, bias,
epoch spending and token transfer. Cheaper updates retain surplus and skip the
transfer entirely when no extra funding is needed. Epoch spending counts actual
new deposits, resets in timestamp-aligned fixed windows, and is not a rolling
window or lifetime loss limit. Existing surplus/donations may fund later updates.

**Movement differs from the Rust prototype's total-variation cap.** The contract
bounds the sum of local bias-change ranges, which upper-bounds their joint range.
For fixed q, a bound s implies each state-probability ratio lies between
exp(-s/b) and exp(s/b). This avoids estimating probabilities with floating point
inside the contract. It is conservative and may reject a globally small update.

## Validation

All **239 Solidity tests** pass, including **14 new tests**, with 256 cases per new
fuzz test. Tests cover independent 80-digit Decimal price/reserve fixtures,
conservative trade reserve changes, explicit round-trip extraction, independent
terminal payouts, ownership, funding limits, epoch rollover, stale/domain-invalid
updates, cooldown/close, graph width on both updates and subsequent trades,
factor capacity, taxed/reverting/no-return tokens, reentrancy, and wrapped receipt
redemption. Existing pool behavior and its gas-limit tests also pass.

With solc 0.8.28, optimizer 200 runs, Cancun: pool runtime is **14,871 bytes** and
engine runtime **15,320 bytes**. Pool creation bytecode is **45,010 bytes**; a test
also includes constructor arguments with the maximum 32-event order in the
49,152-byte initcode check. No size limits were raised and via-IR was not enabled.
The original pool's runtime is now 21,489 bytes following the extension hooks.

```bash
forge test --use target/tools/solc-0.8.28.exe --offline
forge fmt --check
```

## Next phase and remaining limits

The [deterministic proposal builder and isolated rehearsal](LEARNING_EXECUTION.md)
now connect a Rust learning fixture to integer tables, compare implied probabilities
and execute a funded update with ledger reconciliation. The next phase is dashboard
review/execution controls. The contract accepts updater-supplied integer tables;
it does not train the model, prove that a table came from ParlayMarket, or
automatically ingest trade signals.
Dense pairwise models may fail width 2; unsupported models must reject explicitly.

Predictable updates still allow buy-before/sell-after extraction. The tests
demonstrate it; reserve funding covers payouts but does not make learning
manipulation-resistant or profitable. Update provenance, ordering and cumulative
funding policy still need an operational design. Historical research reproduction
still needs source data. Kuru, Mera, Agora/AUSD and settlement work retain their
existing status; this phase does not establish a new live partner integration.
