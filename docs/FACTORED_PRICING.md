# Factored pricing reference

`flurbo_core::factored::FactoredLmsr` starts the bounded-width engine required by
`tmp/flurboidea.md`. It evaluates a snapshot without enumerating all terminal
states. This is a floating-point Rust reference, not an executable pool or a
replacement for the existing Solidity reference contracts.

## One global cost function

For binary event assignment `x`, local liability tables define
`q(x) = sum_f q_f(x_scope(f))`. The model evaluates:

- `cost() = b * ln(sum_x exp(q(x)/b))`;
- `probability(evidence) = Z(evidence) / Z`, for conjunctive event assignments;
- `max_liability() = max_x q(x)` using max-sum elimination.

The factor potentials `exp(q_f/b)` multiply into one joint distribution. These
are not independent market makers, normalized Bayesian conditional-probability
tables, or separate collateral pools. A Bayesian-network input/compiler remains
future work. Empty factors give a uniform prior and initial cost `b*n*ln(2)` for
`n` binary events. Maximum outstanding liability is distinct from this initial
ideal subsidy; this model does not check funded collateral or ownership.

## Explicit prototype bounds

- 1–32 events, at most 64 input factors, at most three events per factor.
- Each scope is sorted and unique. Local table bit `i` selects `scope[i]`;
  its table contains exactly `2^scope.len()` values. Empty scopes are constants.
- The caller supplies a complete elimination permutation. Its induced width
  must be at most two, including fill-in. Joined tables have at most eight
  entries; elimination output tables have at most four.
- Liquidity `b` is finite and within `[1e-6, 1e9]`. Contributions are finite and
  nonnegative, and `sum_f max(q_f)/b <= 100`. This conservative numeric limit
  can reject otherwise valid snapshots when factor maxima are incompatible.

These are initial implementation caps. The constructor checks the supplied
order, not the minimum treewidth over all orders. A valid tree can fail with a
poor order. There is no automatic reordering or graph approximation. Evaluation
uses log-domain variable elimination, scans factor buckets, and retains scalar
messages and disconnected variables; it never allocates a `2^n` state array.

## Querying does not authorize a trade

Evidence may span any events, including non-neighbors; duplicates and unknown
events are rejected. Empty evidence has probability one. Conjunction queries
clamp evidence without adding graph edges.

`check_additional_scope` checks whether appending a nonempty factor preserves
the fixed width bound and factor capacity. For example, a star centered on A
with leaves B, C, D supports the query `B AND C AND D`. Adding a factor over
those three leaves creates a four-node clique and is rejected. Zero table values
do not remove declared edges. This append-only check does not account for scope
reuse; the simulator below merges exact-scope tables instead.

This structural check does not validate quantities or mutate liabilities.

## Finite-size trade simulation

`simulate_trade(scope, mask, quantity)` returns signed collateral paid to the
pool and a new snapshot, preserving the original on both success and rejection.
Positive quantity buys; negative quantity sells. The scope has one to three
sorted, distinct events; mask bit `x` is the unit payout in local state `x`.
For `[A, B]`, AND is `0b1000`, OR is `0b1110`, and NOT A is `0b0101`.
Zero/full payout masks and bits outside the local state space are rejected.

Nonzero quantities satisfy `b/1e9 <= abs(quantity) <= b`. Zero quantity validates
the claim but returns an unchanged snapshot without adding or merging factors.
For a nonzero trade, exact-scope tables are summed into one table and quantity
is added to every winning entry. A new scope consumes one factor slot; reuse
does not. All post-trade table, capacity, width and numeric checks run again.
Scopes are literal: equivalent payouts expressed with redundant events do not
automatically share a table or a selling allowance.

Sells require each resulting entry of that exact-scope table to remain
nonnegative. This can reject a sale even if liabilities on other scopes would
keep global `q(x)` nonnegative. It is a conservative representation constraint,
not an ownership check. Duplicate tables on the same scope contribute to the
available aggregate. Zeroed tables retain their scope and factor slot.

The fee-free signed quote is `b * ln1p(p * expm1(quantity/b))`, where `p` is the
current probability of the mask's winning local assignments. This equals the
global cost difference mathematically while avoiding cancellation for tiny
trades. The probability is evaluated from at most seven disjoint conjunctions;
no global terminal-state enumeration is introduced.

Arbitrary Boolean expression compilation, cross-scope sell handling, actual
conditional securities, exact accounting, and the fixed-point on-chain port
remain subsequent milestones. No floating-point result authorizes transfers
or carries a conservative rounding guarantee. Kuru anchoring and the other
partner requirements remain in [the integration plan](INTEGRATIONS.md).

## Validation and next phase

`cargo test --workspace` covers comparison with the enumerated LMSR across all
three-event elimination orders and conjunctions, independent four-event cycle
enumeration, rare probabilities, invalid domains, and graph rejection. A
32-event chain agrees with closed-form cost, liability and endpoint probabilities
while using four-entry joined tables. Trade tests cover every nonconstant local
Boolean mask on every subset of three events, positive/negative size boundaries,
post-trade costs, distributions and liabilities, reversals, scope/capacity
rejections and a 32-event round trip. The [fixed-point evaluator and error
specification](FACTORED_NUMERICS.md) now implement graph validation, cost
enclosures and exact maximum liabilities in Solidity. Factored trade quotes
and accounting integration remain subsequent gates before pool execution.

The inference method follows [variable elimination](https://ermongroup.github.io/cs228-notes/inference/ve/).
[Pennock and Xia](https://arxiv.org/abs/1202.3756) motivate distinguishing tractable
inference from structure-preserving market updates; this prototype does not claim
to implement every security class in that paper.
