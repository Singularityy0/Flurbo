# ParlayMarket learning comparison

The user requested the missing learning, gradient/shadow loop and experiments,
excluding claims of statistical loss guarantees. They selected **comparison model
first, then execution integration**. This phase implements the offline comparison
model. It does not change the Solidity maker, wallet flow, Kuru adapter, collateral
ledger or local deployment. No signing or network access is used by this runner.

## Status and paper mapping

Pinned reference: [ParlayMarket v3, 10 August 2026](https://arxiv.org/html/2603.22596v3).

| Component | Implementation | Status |
|---|---|---|
| Shared pairwise state, eq. 11 | `IsingModel`, fields followed by pair couplings | Implemented |
| Cross-entropy SGD, eq. 13 and Appendix C.2 | Covariance/conditional-feature gradient | Implemented, finite-difference checked |
| Real order to model update to shadow books | `LearningMarket.trade_signal` | Implemented as reference bookkeeping |
| Explicit probability observations | `LearningMarket.observe` | Implemented; target must be supplied |
| Related claim price propagation | Recompute all nonempty YES conjunctions after one update | Implemented |
| Controlled convergence/failure experiments | `parlay_compare synthetic` | Implemented, different fixtures from paper figures |
| Comparison with existing Flurbo | `parlay_compare flow`, actual `FactoredLmsr` | Implemented on common synthetic flow |
| Historical data ingestion | Strict normalized CSV replay | Implemented; authors' dataset unavailable |
| Reproduce published figures/tables | Exact source data/configuration and result matching | Not completed |
| Change executable on-chain prices | Funded repricing and integration | Next phase; not implemented here |
| Statistical loss guarantees | No imported theorem/guarantee | Deliberately not claimed |

The paper uses a shared pairwise distribution and cross-entropy gradient learning;
its shadow trades propagate learned prices. Appendix C.1 gives the binary-LMSR
price/imbalance relationship. Our reference derives virtual imbalance changes
from that relationship. Exact enumeration replaces its larger-cluster approximate
inference, so this is an equation-level implementation, not a bit-for-bit port of
an authors' code release. No such release or historical dataset was identified in
the sources consulted; the user confirmed they do not have those inputs.

## Exact computation and limits

State features are `T(x) = [x_i, x_i*x_j for i<j]`, using 0/1 binary variables.
Parameters are fields first, then pairs in lexicographic order. The normalized
state mass is `exp(phi*T(x))/Z`. Event bit i corresponds to event i. A nonzero
scope identifies the conjunction of its YES events; all 2^n-1 scopes are priced
from that same distribution. This layer is not the dashboard Boolean compiler.

For a supplied target r and model probability p, the implemented gradient is:

```
gradient = (p-r)/(1-p) * (E[T | claim] - E[T])
new_parameter = old_parameter - learning_rate * gradient
```

The reference supports **1-8 events** and enumerates all terminal states. It has
O(n^2) parameter storage but exponential inference; it makes no scalable-inference
claim. Rates for fields and pairs are independently configurable from 0 to 1.
Parameters must be finite with absolute value <=12; energy span must be <=24.
Gradient probabilities, targets and all shadow-book prices stay within
`[1e-10, 1-1e-10]`. Domain failures reject the candidate rather than clip it.
These numeric limits are our implementation limits, not assumptions silently
attributed to the paper. The existing 32-event bounded-width engine is unchanged.

The gradient is evaluated on the old shared state. All parameters update
simultaneously. All candidate probabilities and virtual books are validated
before committing either model or books; failed steps leave both unchanged.

## Observation assumptions and shadow bookkeeping

`observe(scope, target, rates)` consumes an explicitly supplied probability.
Synthetic oracle targets are labelled as such. It does not manufacture a trade
or cash movement from an observation.

`trade_signal(scope, signed_yes_quantity, rates)` uses a declared adapter:

```
target = sigmoid(logit(p_before) + signed_yes_quantity / b)
reference_cost = b * log(1 + p_before * expm1(signed_yes_quantity / b))
```

This is a hypothetical two-outcome LMSR target derived from signed order flow,
not an assertion that the trader's true belief is observable. It is not an
executable quote from the current pool, and needs validation before use with
external trades. Each nonzero quantity must be finite and no larger than b in
absolute value. b is configurable within `[1e-6, 1e9]`.

Each virtual book stores `z=b*logit(p)`. A real-order signal temporarily adds
quantity to the traded scope's book. After SGD, each book receives:

```
virtual_quantity = b*logit(p_after) - starting_imbalance
```

The report returns every scope's old/new probabilities, starting/ending imbalance
and virtual quantity. The original order is accounted for once, before shadow
reconciliation. Observations have no original order. There is no shadow-owned
wallet, token issuance, collateral transfer, or hidden payout obligation.

Shadowing can undo a real order's local price displacement even when learning
rates are zero. Tests explicitly prevent treating the resulting paths as the
current global LMSR's unchanged cost function. This is why the reference is not
connected to production pricing or allowed to rewrite actual liabilities.

## Experiments and reproducibility

Run from the repository root:

```bash
cargo test --workspace --all-targets
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
python scripts/parlay_report.py
```

Generated artifacts are ignored under `target/parlay-comparison/`:

- `REPORT.md`: metric definitions, averaged outcomes and limitations.
- `synthetic.csv`: all calibration trajectories, including poisoning/recovery.
- `flow.csv`: common-flow probability, reference-cash and payout accounting.
- `manifest.json`: source/output hashes, Rust version and explicit provenance flags.

Calibration uses three events, seeds 7/19/41, 4,000 updates and rates 0.2/0.2.
It compares pairwise learning from all claims, pairwise learning from singletons
only, learning with couplings frozen at zero, and an unchanged uniform model.
Fixtures cover stationary dependence, a sign-changing dependence at step 2000,
bounded noise, misleading targets during steps 1000-1999, and pure higher-order
dependence outside the model family. Noisy targets are explicitly clipped to
0.001-0.999 by the data generator, not by the learner. Metrics are sampled before
that step's observation. They are known-truth synthetic errors, not held-out
historical forecast scores. These fixtures do not reproduce the paper's Gaussian
trader simulations or its claimed convergence rate.

The separate common-flow experiment feeds both the learner and Flurbo's existing
Rust reference the same 600 seeded YES/NO purchases. It uses b=10 and quantities
0.1-0.5, exact actual terminal obligations, and no fees/gas. A NO order is a
complement claim in Flurbo and a complete-set purchase plus negative YES signal
in the research adapter. Shadow units never enter actual obligations. The runner
checks independently enumerated liabilities against Flurbo after every trade.
This flow is synthetic exogenous demand, not informed price-sensitive behaviour.

Initial measured averages over the three seeds:

| Common-flow metric | Current Flurbo reference | Pairwise order adapter |
|---|---:|---:|
| Final all-claim MSE | 0.03530960 | 0.00544437 |
| Expected hypothetical PnL, collateral units | 7.349802 | 3.300431 |
| Minimum initial collateral needed on observed path | 7.714442 | 11.509481 |

Better probability error did not imply better capital efficiency. In the
higher-order calibration fixture, the full learner also had worse final joint
KL (0.40382285) than the unchanged uniform model (0.36806421), despite smaller
claim MSE. Both metrics and failure trajectories must be retained.

Verification at this phase: **35 Rust tests**, including nine model and two CLI
replay tests; **62 Python tests**, including report provenance checks. Clippy and
format checks pass. Numerical checks include independent analytic probabilities,
finite differences for every gradient component and every three-event claim,
pairwise recovery, non-identifiability from singletons, the higher-order failure
case, shadow reconciliation, invalid-input rollback and eight-event coherence.

## Historical replay contract

Use a normalized, single-cluster CSV with this exact header:

```csv
sequence,timestamp_ms,scope,quantity
1,0,3,0.2
2,1000,1,-0.1
```

This example is synthetic. sequence must strictly increase, timestamps must not
decrease, scope is a nonempty all-YES conjunction bitmap, quantity is finite,
nonzero signed YES shares in whole units. Reject rather than guess malformed,
duplicated, reordered or oversized data. Replays start from a uniform model;
they do not warm-start from future candles. Bounds: 2 MB and 1,000 rows per run.
Large datasets need a separately designed checkpoint/streaming importer; splitting
into fresh runs is not equivalent because it resets the learned state.

```bash
cargo run --offline --release -p flurbo-core --example parlay_compare -- \
  replay 2 10 0.2 0.2 --csv crates/flurbo-core/tests/fixtures/parlay_signals_synthetic.csv \
  > target/parlay-replay.csv
```

Output has one row per input signal and shadow scope. The order reference cost is
repeated on those rows for context: count it once per sequence, never sum all
shadow rows. Output is returned only if the whole replay succeeds. No outcome
labels are consumed, so replay alone cannot report forecasting accuracy or PnL.

Raw venue data needs event definitions, quantity/side semantics, timestamps,
resolution rules and provenance. A buy-NO signal is negative YES quantity for
learning only; its cash accounting also needs the complete-set adjustment. Raw
execution prices include spreads/fees and are not accepted as target probabilities.
Historical paper reproduction additionally needs its exact data, preprocessing,
initialization, execution/filter policy and experiment settings. Those remain
pending rather than being replaced with invented historical rows.

## Next execution gate

Keep actual liabilities immutable under learning. Specify how a model update is
funded, authenticated, bounded and made deterministic; analyse transaction-order
manipulation and round-trip extraction; then prove/test collateral preservation
against an independent ledger. Only after that can learned prices influence
executable trades. Public deployment is not part of this comparison phase.
