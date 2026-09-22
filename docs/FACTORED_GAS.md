# Factored execution gas checkpoints

The first optimization collects each event's active bucket once, retaining its
original table order. Both cost and exact-liability passes reuse those indices
for every local assignment instead of scanning every historical table again.
Tables are marked consumed when collected; their values remain available through
the bucket indices. No arithmetic, graph limits, normalization, error allowances,
quote rounding or coverage rules change.

The second optimization validates each quote snapshot once: `bounds` validates
and prices the old snapshot; `boundsAndMax` validates the new snapshot once for
cost and exact maximum liability. Its unvalidated workers are private to the
evaluator. There is no caller-supplied validation flag or unchecked entry point.
The pool writes only the traded scope and changed values, preserving insertion
order for stored factors. Pure quote output ordering remains unchanged.

## Reproducible quote measurements

`contracts/test/FactoredGas.t.sol` measures `gasleft()` around `FactoredQuote.buy`.
Input construction, assertions, hashing and logging are outside that region.
Configuration: solc 0.8.28, optimizer enabled with 200 runs, Cancun EVM, local
Foundry execution. Baseline evaluator: commit `0ab4789`, measured with the same
benchmark inputs before changing the elimination loops.

| Snapshot | Original | Bucket reuse | Validation reuse | Total reduction |
|---|---:|---:|---:|---:|
| 32 events, width-one chain, 31 factors | 11,056,815 | 7,812,999 | 7,200,286 | 34.9% |
| 32 events, width-two overlapping triples, 64 factors | 29,152,828 | 19,281,016 | 18,016,975 | 38.2% |

Both use six-decimal collateral, b=10 tokens, parity factor entries of 0 or 1
token, ascending elimination order, and a 0.1-token claim purchase on the first
scope. Returned charges remain 23,842 and 14,423 atoms respectively. Golden
hashes of the complete quote, including every resulting factor and the exact
maximum liability, match the baseline. Regression budgets are 7.6 million and
18.7 million gas, with modest headroom; changing compiler settings requires
deliberately reviewing these thresholds.

## Pool execution and storage

`FactoredPoolGas.t.sol` measures complete buy/sell calls including quoting,
ownership, token transfer and storage changes, with setup and assertions outside
the measured region. Its eight-event pool starts with four disjoint pair scopes,
10-token AND holdings on each, six-decimal collateral and b=100 tokens. It buys
one additional token on the first scope or sells one on a middle scope. The
second-stage baseline is commit `78f0544`, using the same fixture.

| Pool call | Before | After | Reduction |
|---|---:|---:|---:|
| Buy existing first scope | 1,088,660 | 987,426 | 9.3% |
| Sell existing middle scope | 1,086,521 | 986,240 | 9.2% |

Charges/payouts remain 270,200 and 268,232 atoms. Each call has a 1.04-million gas
regression budget. These `gasleft()` measurements are gross EVM execution costs,
not transaction receipts with refund accounting; they can differ from Foundry's
test-level gas line. Tests compare stored factors by scope to full quote output,
verify untouched factors, later quote prices, zeroed scopes and new-scope append.

```sh
forge test --match-contract FactoredGasTest -vv
forge test --match-contract FactoredPoolGasTest -vv
forge test
forge fmt --check
```

The optimization checkpoint passed 217 Solidity tests, including independent Decimal
enclosures, exact enumerated maxima, unchanged input checks, graph rejection,
funded trades, redemptions, and adversarial collateral behavior. The existing
32-event pool lifecycle fixture used 6,690,412 gas, including deployment and
other lifecycle calls, versus 6,804,367 after the first optimization. Concrete
runtime size increases from 19,196 to 19,609 bytes for the combined API and storage
logic; this is the code-size tradeoff for reduced execution work.

The subsequent [receipt port](FACTORED_BASE_TOKENS.md) passes 225 Solidity tests.
It adds a factory deployment to the pool constructor: the same 32-event lifecycle
now uses 8,015,173 gas, and pool runtime is 21,333 bytes (creation bytecode 35,318
bytes before constructor arguments). Factory and receipt runtimes are 4,708 and
2,448 bytes. The buy measurement remains 987,426 gas; sell is 986,262, 22 gas above
the optimization checkpoint after the new entry points changed dispatch. Charges,
payouts, pure quote outputs and existing gas budgets remain unchanged.

## Remaining execution limits

These are representative measurements, not a worst-case bound. The quote
benchmark excludes pool storage writes and token transfers, and an 18.02-million
gas quote still needs work before choosing deployment limits. Bit projections,
reusable traversal plans and avoiding work on unaffected graph messages remain
optimization candidates. Storage-order changes do not change mathematical prices:
bucket sums use exact endpoint addition in the same fixed elimination order.
Memory usage increases because bucket index arrays persist for the duration of
each call; measured gas includes that tradeoff. No public deployment or change
to the supported graph/securities class is implied by this checkpoint.
