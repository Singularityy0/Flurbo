# Funded repricing reference

Status: **offline accounting reference, not enabled in the dashboard**. A separate
[integer contract implementation](FUNDED_FACTORED_POOL.md) now passes local tests.
This is the next step after [the ParlayMarket comparison](PARLAY_COMPARISON.md).
It connects a learned joint distribution to hypothetical finite-size LMSR fills,
while keeping actual customer payouts separate from learning/shadow state.
No statistical loss guarantee is claimed. No partner integration is replaced.

The learner follows the pairwise model and gradient equations in
[ParlayMarket v3](https://arxiv.org/html/2603.22596v3). The funded cost-function
bridge below is a Flurbo integration design, **not a reproduction of that paper's
execution mechanism or loss results**. Historical-result reproduction remains
blocked on the authors' data and exact experiment inputs.

## Accounting mechanism

For terminal outcome x, let q(x) be the actual outstanding payout, a(x) a pricing
bias, b the fixed liquidity parameter, and B the pool's cash. Define:

```
C_a(q) = b * ln sum_x exp((q(x) + a(x)) / b)
R_a(q) = C_a(q) - min_x a(x)
```

Bias is normalized to minimum zero in the implementation. Adding any constant
to every bias changes neither prices nor the required reserve R. The pool must
hold B >= R, a stronger condition than B >= max_x q(x). R includes funding for
subsequent trading at the selected prices; checking current payouts alone is
insufficient when replacing a cost function.

The real-arithmetic reasoning is short:

1. C_a(q) >= q(x) + a(x) for every x, so R_a(q) >= max_x q(x).
2. A trade at fixed a pays the pool C_a(q') - C_a(q). Cash and reserve change
   by the same amount. Consequently B - R remains constant during those trades.
3. A learning update leaves q unchanged and replaces a. Deposit
   `max(0, R_new(q) - B)` before accepting it. Reject if the update's funding
   budget is insufficient. Retain surplus; never withdraw it on a cheaper update.

These identities describe an accounting invariant, not forecasting performance,
an audited contract proof, or a floating-point error bound. The implementation
is a numerical reference, with tolerances in tests. Its outputs must never
authorize a token transfer.

## Connecting the learner

For strictly positive learned joint probabilities p*(x), choose:

```
raw_bias(x) = b * ln p*(x) - q(x)
a(x) = raw_bias(x) - min_y raw_bias(y)
```

This makes the new marginal state distribution exactly p* in real arithmetic,
without minting/burning any customer claim. Equivalently, the reserve immediately
after this update is `max_x [q(x) - b*ln p*(x)]`. Subsequent real trades again
change prices through q; there is no automatic learning update inside a fill.
Shadow quantities are never added to q or settled as money.

`simulate_reprice` requires the expected snapshot revision, a funding cap and a
total-variation cap. Total variation is half the sum of absolute changes in joint
probabilities; it bounds the absolute probability change of every Boolean claim.
It does not bound relative changes or finite-size execution costs. Every accepted
trade/update increments the revision. A candidate based on an earlier revision
is rejected. Simulation returns a new snapshot, so rejected operations do not
partially mutate the input.

All values are whole collateral units. Bounds: 1–8 events, b in [1e-6, 1e9],
nonnegative actual state payouts <=100b, nonzero trade size in [b/1e9, b].
The existing Ising model validates finite parameters and energy span <=24.
Payoffs here are dense, nonconstant Boolean vectors; this reference does not
expand the production pool's supported claim language or graph width.

## Run and verification

```bash
cargo run --offline -p flurbo-core --example funded_reprice
cargo test --offline -p flurbo-core --test funded_repricing
```

The example buys A AND B, applies a synthetic learning signal, budgets and funds
the reprice, then sells. It prints the reserve, external funding and trader profit.
Tests compare unchanged pricing with the existing factored maker, verify learned
probabilities and an independent reserve formula, reject stale/invalid/over-budget
updates, retain surplus, reconcile a separate payout/cash ledger and check every
terminal outcome through repeated updates. A buy–update–sell test deliberately
demonstrates profitable extraction around a predictable repricing.

Worked example output (whole collateral units, rounded to nine decimals):

| Quantity | Value |
|---|---:|
| Initial funding | 13.862943611 |
| Buy cost | 0.259530175 |
| Extra funding on learning update | 0.794858145 |
| Outstanding maximum payout before / after update | 1 / 1 |
| Sell proceeds | 0.280649068 |
| Trader round-trip profit | 0.021118893 |
| Final cash and required reserve | 14.636682863 |

These are synthetic mechanism checks, not expected market returns or a claim
that funded repricing improves capital efficiency.

## Execution integration still required

This prototype does not authenticate an updater, move tokens, track per-owner
holdings or enforce an epoch budget. `max_funding` is an explicitly supplied
simulation input, not evidence of deposited funds. The adversarial test maintains
a cumulative budget separately and stops accepting updates when it is exhausted.

The following requirements guided the local contract phase. Integer accounting,
direct updater authentication, limits and contract tests are now implemented as
described in [the contract status](FUNDED_FACTORED_POOL.md). Automatic learner
proposal generation and persistent/local-dashboard rollout remain pending.

Execution requirements:

- Port separate bias factors and the reserve calculation to conservative integer
  intervals. Price fills with the combined bias/payout graph; compute actual
  settlement solely from payout factors. Preserve the fixed width/factor-count
  limits across every update. A dense learned pairwise model can violate width 2;
  reject it explicitly or use an explicitly constrained learner. Enumeration here
  is only an oracle, never the proposed scalable on-chain implementation.
- Bind each proposal to chain, pool, current revision, expiry, learned parameters,
  funding limit and configured movement limit. Authenticate a configured updater,
  enforce on-chain rate/epoch budget limits, and accept exact collateral deposits
  atomically with the update. Budget exhaustion must leave old pricing intact.
- Preserve holder balances, receipts, Kuru backing and settlement. Enforce actual
  ownership, slippage, deadline, reentrancy and token-transfer checks. Reprice
  before close only; do not change liquidity b or settlement rules in this path.
- Test conservative rounding, rejected transfers, unauthorized/replayed updates,
  graph-width violations and transaction-order attacks on a local deployment.

Funding and revision checks do not prevent manipulation of the learning signal
or a trader buying before a visible bullish update and selling after it. Small
updates can accumulate. The funding budget can be consumed by those trades even
when all terminal payouts remain covered. Update cadence, signal provenance and
ordering policy must be designed and tested before any public execution rollout.
