# Read-only pair analytics

Implementation slice: 25 September 2026. Prepared locally; hosted verification is
required after deployment. No contracts, collateral rules, settlement rules or
transaction authorization have changed.

## Scope and interpretation

The What-if panel on `/markets` compares two distinct practice events. The
authenticated `/api/pilot/analytics` and `/api/rehearsal/analytics` endpoints also
support verified 2–4-event PilotPool deployments. Only `{a,b}` event indices are
accepted. Learning-pool biases, larger pools, simulated trade sensitivity, true
conditional positions and intervention/causal models are outside this slice.

For the stored nonnegative factors, in token atoms:

```
q(x) = sum_f factor_f(x restricted to scope_f)
Z = sum_x exp(q(x)/b)
p(x) = exp(q(x)/b) / Z
P(A) = sum_{x: A=Yes} p(x)
P(A and B) = sum_{x: A=Yes, B=Yes} p(x)
P(A | B) = P(A and B) / P(B)
P(A | not B) = P(A and not B) / P(not B)
independence baseline = P(A) * P(B)
difference in percentage points = 100 * (P(A and B) - P(A)*P(B))
```

These are instantaneous pricing-model probabilities, not finite-share purchase
costs. The baseline is not an executable quote. Conditional is not causal;
coherence is not evidence of accuracy. Scripted practice outcomes are not
independent observations. Closed but unresolved pools may be inspected with an
explicit stored-pricing-weights label; resolved pools are rejected.

## Snapshot and limits

Every request verifies chain 10143, the deployment anchor, pool/resolver code
hashes and rule/pool bindings via the existing pilot snapshot reader. At that
same block number it reads event count, liquidity, factor tables, elimination
order, token decimals/address, funding, resolution and close time. The event
count and close time must match the manifest, and collateral must be six-decimal
test AUSD. The canonical block hash is checked again after calculation.

There are at most 64 nonempty factors, each over at most three events, with
induced width at most two under the stored elimination order. Atom values must
fit uint128; b is positive; the sum of factor maxima must be at most 100b. This
conservative numerical domain can reject a pool whose true maximum is lower.
No unverified or unavailable pool falls back to an invented distribution.

Responses carry pool, rules hash, block number/hash/time, expiry, model version
and SHA-256 of the exact Rust input (including pair, b, order and factors).
Values are integers in tenths of a percentage point, or null with a reason.
The UI checks response identity and hides numeric results after 60 seconds of
snapshot age. A new pair cancels the browser request and clears old results.
There is no wallet request or automatic transaction.

## Numerical method and error policy

The Rust executable uses the existing stable-log FactoredLmsr elimination.
Dividing factors by b and setting b=1 preserves probabilities. That float result
is independently checked using enumerated, outward-rounded BigInt intervals
over at most 16 states. No float result authorizes a transaction.

For the independent check, scores and score differences are exact integers.
Let t=(max(q)-q(x))/b in [0,100], and S=10^48. Evaluate exp(t/128) with its
positive Taylor series through term 64. Each multiply/divide is rounded outward
at scale S. Since t/128 < 1, all remaining term ratios are below 1/2; twice an
upper bound on term 65 bounds the remaining tail. Reciprocal intervals enclose
exp(-t/128), then seven outward-rounded squarings enclose exp(-t).

Positive interval sums and outward-rounded quotients enclose probabilities.
Conditionals divide selected unnormalized weight sums directly; complements
are enumerated rather than obtained through subtraction of nearly equal floats.
Interval multiplication gives the independence baseline, and endpoint
subtraction gives the signed difference. The worst exponent still has a
positive lower weight bound at this scale. Nonpositive denominator bounds fail.

A value is displayed only if both interval endpoints round to the same 0.1
percentage point (nearest, ties away from zero), and Rust agrees at that
precision. A Rust disagreement rejects the entire comparison. A conditional
is suppressed unless the lower probability bound on its condition is at least
10^-9. This is a conservative display cutoff, not an impossibility assertion.
Nulls are never rendered as zero; no accuracy or robustness badge is shown.

The interval construction is the error policy. Tests provide implementation
evidence, not a formal proof. Forty independent fixtures use Python Decimal at
90 digits, including correlated/anti-correlated tables, rare conditions,
non-adjacent events, large integer atoms and seeded factor chains. Tests compare
both implementations and exercise complement identities and Frechet bounds.

## Runtime and deployment

Docker compiles the dependency-free Rust example `pair_analytics` and copies it
to `/app/bin/flurbo-pair-analytics`. No new hosting secret or on-chain deployment
is needed. The fixed executable receives only public bounded snapshot data on
stdin, inherits no service secrets, and has a five-second timeout and 8 KB output
cap. The full request has a 30-second response deadline; the single per-pool
concurrency slot stays occupied until pending upstream reads finish. Identical
in-flight requests share work; other pairs receive a retryable unavailable
response. There is no cross-request snapshot cache. Existing RPC timeouts and
response size caps still apply.

Local validation:

```
cargo test --offline --locked -p flurbo-core --example pair_analytics
cargo build --offline --locked -p flurbo-core --example pair_analytics
node --experimental-strip-types --test apps/web/tests/pair-analytics.test.ts
npm --prefix apps/web run build
```

`scripts/pair_analytics_fixtures.py` regenerates the checked-in Decimal fixture.
The browser test follows the existing FLURBO_TEST_PLAYWRIGHT / FLURBO_TEST_BROWSER
convention and serves the built assets with controlled API responses.

After a hosted rebuild, sign in, open Markets, choose two questions, and compare.
Check the displayed pool and block identity, change a selection during loading,
and verify mobile layout and stale/error states. No wallet prompt should appear.
Then verify a normal trade review separately. A successful local test is not
proof that this hosted acceptance check has passed. The current practice pool's
expiry still requires the separately planned next demo collection before October.

Read-only public testnet checks on 25 September passed for the real-event pool at
block 65435673 and practice pool at block 65435681. Both snapshots passed identity,
canonical hash and numerical checks. For practice events A/B the rounded values
were P(A)=73.1%, P(B)=37.8%, joint=27.6%, independence=27.6%, difference=0.0 pp.
This is an observation of that snapshot, not an enduring estimate. Individual
trades alone can leave those events independent; a flat What-if comparison is
valid and must not be replaced with an invented relationship for the demo.
