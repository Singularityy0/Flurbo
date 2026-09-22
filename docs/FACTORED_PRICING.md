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
do not remove declared edges. Existing scopes are not merged in this phase.

This structural check does not validate quantities or mutate liabilities.
Finite buy/sell quotes, trade updates, arbitrary Boolean claim compilation,
actual conditional securities, exact accounting, and the fixed-point on-chain
port remain subsequent milestones. No floating-point result authorizes transfers
or carries a conservative rounding guarantee. Kuru anchoring and the other
partner requirements remain in [the integration plan](INTEGRATIONS.md).

## Validation and next phase

`cargo test --workspace` covers comparison with the enumerated LMSR across all
three-event elimination orders and conjunctions, independent four-event cycle
enumeration, rare probabilities, invalid domains, and graph rejection. A
32-event chain agrees with closed-form cost, liability and endpoint probabilities
while using four-entry joined tables. Next: coherent finite-size trade simulations
that preserve these bounds and leave rejected snapshots unchanged.

The inference method follows [variable elimination](https://ermongroup.github.io/cs228-notes/inference/ve/).
[Pennock and Xia](https://arxiv.org/abs/1202.3756) motivate distinguishing tractable
inference from structure-preserving market updates; this prototype does not claim
to implement every security class in that paper.
