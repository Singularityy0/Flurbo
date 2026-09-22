# Factored evaluator gas checkpoint

The first optimization collects each event's active bucket once, retaining its
original table order. Both cost and exact-liability passes reuse those indices
for every local assignment instead of scanning every historical table again.
Tables are marked consumed when collected; their values remain available through
the bucket indices. No arithmetic, graph limits, normalization, error allowances,
quote rounding or coverage rules change.

## Reproducible quote measurements

`contracts/test/FactoredGas.t.sol` measures `gasleft()` around `FactoredQuote.buy`.
Input construction, assertions, hashing and logging are outside that region.
Configuration: solc 0.8.28, optimizer enabled with 200 runs, Cancun EVM, local
Foundry execution. Baseline evaluator: commit `0ab4789`, measured with the same
benchmark inputs before changing the elimination loops.

| Snapshot | Before | After | Reduction |
|---|---:|---:|---:|
| 32 events, width-one chain, 31 factors | 11,056,815 | 7,812,999 | 29.3% |
| 32 events, width-two overlapping triples, 64 factors | 29,152,828 | 19,281,016 | 33.9% |

Both use six-decimal collateral, b=10 tokens, parity factor entries of 0 or 1
token, ascending elimination order, and a 0.1-token claim purchase on the first
scope. Returned charges remain 23,842 and 14,423 atoms respectively. Golden
hashes of the complete quote, including every resulting factor and the exact
maximum liability, match the baseline. Regression budgets are 8.2 million and
20 million gas, with modest headroom; changing compiler settings requires
deliberately reviewing these thresholds.

```sh
forge test --match-contract FactoredGasTest -vv
forge test
forge fmt --check
```

The complete suite passes 214 Solidity tests, including independent Decimal
enclosures, exact enumerated maxima, unchanged input checks, graph rejection,
funded trades, redemptions, and adversarial collateral behavior. The existing
32-event pool lifecycle fixture falls from 7,938,642 to 6,804,367 gas, including
deployment and other lifecycle calls. Concrete runtime size falls from 19,252
to 19,196 bytes.

## Remaining execution limits

These are representative measurements, not a worst-case bound. The quote
benchmark excludes pool storage writes and token transfers, and a 19.28-million
gas quote still needs work before choosing deployment limits. Repeated validation,
bit projections and full factor storage replacement remain optimization candidates.
Memory usage increases because bucket index arrays persist for the duration of
each call; measured gas includes that tradeoff. No public deployment or change
to the supported graph/securities class is implied by this checkpoint.
