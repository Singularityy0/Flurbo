# Enumerated LMSR cost enclosure

`LmsrCost.bounds` evaluates the small-state reference mechanism in Solidity.
It is not the final factored engine, a trade endpoint, or settlement code.
This document derives its analytical allowance; the fixtures test the implementation.
It does not claim that a measured maximum error is a global bound.

## Pinned implementation and domain

Dependency: `@prb/math` **4.1.0**, npm gitHead
`280fc5f77e1b21b9c54013aac51966be33f4a410`. The exact package and integrity hash
are pinned in `contracts/package-lock.json`. Relevant upstream implementation:
[UD60x18 Math](https://github.com/PaulRBerg/prb-math/blob/v4.1.0/src/ud60x18/Math.sol)
and [Common.exp2](https://github.com/PaulRBerg/prb-math/blob/v4.1.0/src/Common.sol).
`scripts/verify_prb_constants.py` checks SHA-256 of Math, Common, and Constants
and certifies the numerical constants using exact rational inequalities.
Changing the dependency requires revisiting this derivation, not widening a test tolerance.

Set `U = 10^18`, `N in {2,4,8}`, `10^12 <= bWad <= 10^27`, and
`0 <= qWad[i] <= 100*bWad`. These correspond to `b` from 1e-6 to 1e9 whole
collateral tokens. Values outside this domain revert. Inputs are WAD, not atoms.

For `m = max(q)`, the real cost is:

```text
C = m + b * ln(S)
S = sum_i exp(-(m-q[i])/b),       1 <= S <= N
```

The implementation floors `distanceWad = (m-q[i])*U/b`, computes positive
`PRB.exp(distanceWad)`, then floors `U^2/expResult` for the weight. A weight
smaller than one WAD unit can become zero; the error budget includes this.
At least one distance is exactly zero and contributes exactly `U`, so the log
never receives an input below 1. Explicit checks enforce weights <= U and sum >= U.

## 1. Normalization and exponentiation

Let the true dimensionless distance be `a in [0,100]`. Normalization drops less
than `1/U`. The exp algorithm multiplies by the stored `log2(e)` constant,
floors back to WAD, then floors to 64 fractional binary bits.

The stored constant is between `log2(e)-1/U` and `log2(e)`. Combining distance
rounding (less than `1.443/U` in base-two exponent), constant truncation (less
than `100/U`), WAD product flooring (`1/U`), and radix conversion (`2^-64`)
changes the binary exponent by less than `104/U`. Since `ln(2)<1`, the induced
multiplicative error is bounded by `exp(104/U)-1`.

Each of the 64 exp2 factors differs from its exact `2^(2^-i)` by less than
`2^-64`, also a relative bound because each exact factor is >=1. The rational
checker establishes this for every constant using series bounds for ln(2)
and exp. Each intermediate right shift drops less than one integer unit;
the accumulator stays >=2^191, so the relative contribution per shift is
less than `2^-191`. Final conversion floors less than one output WAD unit,
with relative contribution <=1/U because the true exponential is >=1.

The absolute relative error in the exponential is therefore less than:

```text
exp(104/U) * (1+2^-64)^64 * (1+2^-191)^64 - 1 + 1/U < 128/U
```

Both signs of rounding are covered by this product bound. The checker verifies
the displayed inequality with exact fractions and an upper Taylor remainder.

## 2. Reciprocal weights

For relative exponential error `r < 128/U`, inversion changes a true weight
(at most 1) by less than `r/(1-r)`. The reciprocal integer division drops
less than another `1/U`. Thus absolute weight error is less than:

```text
(128/U)/(1-128/U) + 1/U < 512/U
```

`WEIGHT_ERROR = 512` is a deliberately loose, analytically bounded allowance
in WAD units. Exact-rational verification covers this inequality as well.
Summation uses exact integer addition, so `|S_approx-S| < N*512/U`.

## 3. Logarithm on [1,8]

The pinned log2 algorithm first writes `x = 2^n*y`, with `n <= 3` and
`1 <= y < 2`, then iteratively squares and extracts binary digits.
Initial integer normalization loses less than one WAD unit of `y`, causing
less than `2/U` error in log2.

In an iteration, flooring the square and (when needed) halving lose less
than one WAD unit of the normalized value, which remains >=1. The loss in
its logarithm is below `2/U`. In the unfolded recurrence these errors carry
weights `2^-i`, whose sum is below 1: total below `2/U`.

There are 59 iterations (`floor(U/2^59)=1`, the next is zero). Truncating each
binary digit's WAD weight loses less than `1/U`, giving less than `59/U`.
The final unexpanded fractional logarithm contributes less than `2^-59 < 2/U`.
Total log2 error is less than `65/U`.

Converting log2 to ln with the truncated log2(e) constant adds less than
`3/U` on this domain; final integer division adds less than `1/U`. Dividing
the log2 approximation error by a constant >1 cannot enlarge it. Accordingly,
`LOG_ERROR = 256` WAD units exceeds the combined bound of `69/U`.

Both true and approximate sums lie in [1,8], where the derivative of ln is
at most 1. Perturbing the sum therefore contributes no more than `N*512/U`
in addition to the logarithm implementation error.

## 4. Final cost interval and overflow

With integer `estimate = mWad + floor(bWad*lnApproxWad/U)`, define:

```text
E = ceil(bWad*(N*512 + 256)/U) + 1
lower = max(mWad, max(0, estimate-E))
upper = estimate+E
```

The final multiplication/division contributes less than one WAD unit. The
derived bound gives `lower <= trueCostWad <= upper`; tightening to `mWad`
uses the independent exact inequality `C >= max(q)`.
At maximum b and eight states, E is 4,352,000,000,001 WAD units, about
0.000004352 whole collateral tokens per cost evaluation. Two cost evaluations
contribute to a trade interval. This is not a selected pool reserve or trade fee.

Normalization products are <=1e47; final cost products are below 3e45;
sum weights <=8e18; final costs are below 1.03e29. These fit uint256.
Positive exp inputs <=100 are inside PRB's supported range. The checker verifies
the all-bits-set exp2 accumulator products and final multiplication fit uint256;
all subsets of the positive factors have smaller intermediates. The maximum
integer binary exponent is 144, below the conversion shift limit of 191.

## Verification and remaining work

```sh
npm ci --prefix contracts --ignore-scripts
python scripts/verify_prb_constants.py
python scripts/lmsr_cost_fixtures.py
forge fmt
forge test
```

The exact-rational checker certifies source constants and explicit exponential
inequalities. The log recurrence and composition argument above are mathematical
derivations, not machine-checked Solidity proofs. Fixtures use independent Decimal
costs whose integer brackets agree at 80 and 120 digits. They cover both states
of the existing eight trade scenarios, b limits, uniform/skewed distributions,
single-WAD changes, and reciprocal-underflow boundaries. Fuzzing checks translation
equivariance, coverage bounds, and rejection of unsupported domains.

Still required: the trade adapter's amount/mask/ownership constraints, pool funding
and numerical reserve policy, fixed-point quote-to-ledger integration, and the
factored engine with its own propagation/gas analysis. This cost implementation
does not silently expand the supported graph or replace Kuru anchoring.
