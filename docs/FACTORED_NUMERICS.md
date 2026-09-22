# Factored log arithmetic and enclosure budget

`FactoredLogMath` is the first Solidity arithmetic component for the factored
engine. It provides normalization, addition, binary log-sum-exp, and final cost
scaling. It does not validate or traverse graphs, calculate probabilities,
update liabilities, quote trades, or connect to `ReferencePool`.
`FactoredCost` now supplies graph validation and variable elimination on top of
this arithmetic, returning the cost enclosure for one shared distribution.

## Units and domain

Set `U = 10^18`. `LogBounds` encloses a dimensionless logarithm multiplied by U;
it is deliberately a different type from collateral `QuoteMath.CostBounds`.
Liquidity and liability inputs are whole-token WAD values. Supported liquidity
is `10^12 <= bWad <= 10^27`; each normalization requires `qWad <= 100*bWad`.
Every log interval must satisfy `0 <= lower <= upper <= 128*U`. Addition and
reduction also validate their output, rejecting enclosures outside this range.
This can reject a true value just below the cap when its upper enclosure exceeds
the cap. It never clamps away uncertainty to accept such a value.

`FactoredCost` additionally validates the Rust prototype's global domain: at
most 64 factors, 1–32 binary events, fixed induced width <=2, nonnegative
contributions, and `sum_f max(q_f) <= 100*b` using exact integer inputs. The
arithmetic kernel alone does not establish these conditions or reject
unsupported securities.

## Graph representation and evaluation

`FactoredCost.bounds(events, b, factors, order)` accepts `Factor` structs with
a uint32 scope bitmap and WAD liability tables. Ascending set bits determine
local state bit order: scope `0b101` refers to events 0 and 2. A scope has at
most three bits, all below `events`, and exactly `2^popcount(scope)` entries.
Scope zero has one constant entry. Duplicate scopes are accepted and summed.
No factor is removed merely because its entries are zero.

The supplied order must contain every event exactly once. A symbolic pass checks
fill-in before any logarithm or exponential: join scopes containing each event,
reject more than three joined variables, consume those scopes, and append the
remaining scope. This validates the supplied order, not minimum treewidth.

The numerical pass normalizes each input table, consumes each active bucket
once, and appends its reduced message. Each output entry combines the two values
of the eliminated event with `FactoredLogMath.logSumExp`. An event with no bucket
still contributes ln(2); constants and disconnected scalar messages are added
once at the end. All original input arrays are left unchanged.

There are at most 96 input/message table slots, at most eight entries per input
table, and at most four per reduced table. Bucket scans and bit projections are
bounded but not optimized; there is no global `2^events` array. No graph data is
persisted, and this library has no probability, trade, or settlement endpoint.

## Scalar binary reduction

For exact log inputs a and b, let m=min(a,b), M=max(a,b), d=(M-m)/U. The desired
WAD result is `m + U*ln(1+exp(d))` or equivalently `M + U*ln(1+exp(-d))`.

When `d <= 100`, the implementation calls the existing `LmsrCost.bounds` on
`[0, M-m]` with liquidity U, then adds m exactly. This reuses its pinned PRBMath
4.1.0 assumptions and [existing analytical proof](COST_ERROR_BOUND.md), without
extending the exponentiation domain. Its scalar estimate allowance is
`E = ceil(U*(2*512+256)/U)+1 = 1281` integer log-WAD units. Since its returned
endpoints are estimate +/- E, either endpoint can differ from the real answer
by at most `2*E = 2562`. The independently valid lower tightening to M cannot
worsen that bound.

When `d > 100`, return `[M, M+1]`. Indeed,
`0 < ln(1+exp(-d)) < exp(-100) < 1/U`. The fixture generator checks the last
inequality with exact integers: `exp(100) > 100^16/16! > U`. No exponential is
evaluated in this branch. It covers large differences as well as upper interval
endpoints that slightly exceed the older cost routine's domain.

## Interval propagation

`normalize` rounds q*U/b outward with integer floor and ceiling; each endpoint
error is less than one log-WAD unit (zero for exact division). `add` sums lower
and upper endpoints exactly. `logSumExp` uses the lower scalar enclosure at both
lower inputs and the upper scalar enclosure at both upper inputs. This encloses
every possible pair because log-sum-exp is increasing in both arguments.

The two partial derivatives of log-sum-exp are nonnegative and sum to one, so
its sensitivity to endpoint perturbations is at most their maximum, in the
infinity norm. A reduction therefore adds at most 2562 to the maximum incoming
one-sided endpoint error. Addition sums its operands' errors.

The evaluator consumes each input factor or active message at most once. Its
active messages therefore have disjoint input-factor and eliminated-variable
ancestry; those ancestry sets are a proof device, not stored metadata. Joining
consumes its input messages before appending the output. A resulting entry has
one-sided error bounded by
`F + 2562*R`, with F contributing input factors and R eliminated variables.
Binary branches use the maximum incoming error, not their sum. Under the stated
prototype caps the final log-partition endpoint allowance is therefore at most
`64 + 32*2562 = 82048` log-WAD units. This analytical composition argument and
the traversal invariant are not machine-checked proofs of the Solidity code.

With nonnegative factors, each true intermediate log is at most
`100 + 32*ln(2) < 123`. Adding this error budget stays below the kernel's 128 cap.
Normalization products are at most 1e47; cost scaling products at most 1.28e47;
both fit uint256. Additions are bounded before accepting output.

`cost` multiplies the final lower log endpoint by b/U and rounds down; it rounds
the upper endpoint up. Its conditional per-endpoint allowance in collateral WAD
is `ceil(bWad*82048/U)+1`. At maximum b this is 82,048,000,000,001 WAD units,
about 0.000082048 tokens per endpoint. This is not a fee, a reserve policy, or
authorization to execute a trade. Buy/sell rounding, meaningful minimum trade
sizes, liability coverage, and ownership require separate integration.

## Evidence and next gate

`scripts/factored_log_fixtures.py` generates Decimal brackets that agree at 80
and 120 digits: equal/tiny/skewed pairs, both sides of the large-gap branch,
near-cap values, and composed four-state costs at liquidity limits. A 32-event
chain reproduces the Rust reference scenario with an independent closed form;
the Solidity test uses two messages, never a global outcome array. Fuzz tests
cover exact normalization enclosure, symmetry, translation, interval width,
endpoint composition, and domain rejection. Fixtures are implementation checks,
not the source of the analytical error allowance.

The local chain test used approximately 1.8 million gas with solc 0.8.28 and
200 optimizer runs, including test assertions. This is not a deployed trade
benchmark or a width-two worst-case gas bound. The graph fixtures below measure
the general evaluator separately.

`scripts/factored_cost_fixtures.py` adds independent full-state Decimal checks
for every three-event elimination order at three liquidity values, a four-event
cycle, disconnected and constant factors, and an empty uniform model. Closed
forms check a 32-event chain and a 32-event width-two graph with 64 factors.
Their parity-window coordinates are independent with respectively one and two
free initial bits, allowing validation without enumerating 2^32 states. Fuzz
tests compare intervals with the existing enumerated engine and verify exact
constant-factor translation and unchanged input arrays. Rejection tests cover
malformed orders/tables, unsupported scopes, aggregate liability limits, and
fill-in even for zero-valued factors.

The general evaluator's local chain fixture used about 4.53 million gas; the
64-factor width-two fixture used about 11.48 million, including graph creation,
an explicit validation call, evaluation and assertions. These are measured
examples, not worst-case limits or deployed trade costs. Cost differences need
two snapshots and further accounting. Gas optimization remains a deployment
gate. Next: exact factored maximum liabilities, then conservative trade quotes
and shared-pool accounting.
