# Fixed-point units and conservative quote rounding

The unit/rounding boundary is now accompanied by a bounded, small-state LMSR
cost evaluator in `LmsrCost.sol`. See [the error derivation](COST_ERROR_BOUND.md)
for its domain, pinned dependency, analytical allowance and verification.
`contracts/src/QuoteMath.sol` is an internal library. Its inputs must eventually
come from verified bounds computed by the pool, never caller-supplied prices.
No deployment or executable market is provided by this scaffold.

## Units and exact conversion

- Collateral amounts and claim quantities use `uint128` atomic units, matching
  the Rust reference ledger. One winning claim atomic unit pays one collateral
  atomic unit. Token/wrapper decimals must preserve this correspondence.
- Internal cost values are `uint256` WAD: one whole collateral token is `1e18`.
- Support collateral decimals `d` from 0 through 18; reject all others. Define
  `scale = 10^(18-d)`. Convert atoms to WAD by exact multiplication. Even
  `uint128.max * 1e18` fits `uint256`.
- Convert WAD down with integer division. Convert up with quotient plus one iff
  there is a remainder. Avoid adding `scale-1` to the original WAD value, which
  can overflow. Reject any rounded result above `uint128.max` before casting.
- The deployed collateral's decimals will be verified from its actual contract.
  The 6-decimal fixtures are test coverage, not an assertion about AUSD deployment.

Solidity's [integer arithmetic and casting rules](https://docs.soliditylang.org/en/v0.8.28/types.html)
motivate explicit cast-range checks as well as checked arithmetic.

## Cost interval contract

Let true costs in WAD satisfy `L0 <= C_before <= U0` and
`L1 <= C_after <= U1`. Each supplied interval must have `lower <= upper`.

For a purchase, charge:

```text
buyAtoms = ceil((U1 - L0) / scale)
```

This is at least the exact cost increase. Reject if `U1 < L0`.
For a sale (where the after-state has lower liabilities), pay:

```text
sellAtoms = floor((L0 - U1) / scale)
```

This is no greater than the exact proceeds. Reject if `L0 < U1`; the current
intervals then cannot establish nonnegative proceeds. The caller can report an
unquotable size; the library does not silently clamp or fabricate a price.
Equality returns zero. Minimum trade size, slippage, fees and user authorization
are later pool-layer checks.

These guarantees are conditional on valid cost bounds. Validating interval order
cannot prove that an interval contains the actual LMSR cost. The production cost
evaluator must supply that proof and account for every intermediate rounding step.
For an absolute cost error `E`, an approximation can be enclosed by
`[max(0, estimate-E), estimate+E]`, with checked upper arithmetic.
`LmsrCost` derives E over its declared enumerated domain; this does not establish
the error budget of the future factored evaluator.

## Numerical release gates

1. PRBMath 4.1.0 is pinned with its npm integrity hash and source checks. Any update
   requires revisiting [the error derivation](COST_ERROR_BOUND.md).
2. Specify bounded `b`, quantities, liability range, graph width and state count
   for the cost evaluator. The Rust oracle's domain is a testing baseline, not
   proof that the same limits are safe in fixed-point Solidity.
3. Derive interval propagation through normalization, exp, sums, log, scaling and
   subtraction, including approximation error and rounding at each step.
4. Test adversarial and boundary states against independent high-precision math;
   test the factored engine against enumeration for the supported trade language.
5. Set a numerical reserve from the established error/coverage policy. Enforce
   exact liability coverage after every balance-changing action, separately from
   the quote arithmetic. Do not describe subsidy as total maximum liability.

Factored inference, Kuru anchoring, conditional contract semantics, and all partner
milestones remain required as recorded in the README and integration checklist.

## Local validation

Foundry configuration pins Solidity 0.8.28 and the Cancun EVM target. Install the
locked PRBMath dependency first; build artifacts remain under ignored `target/`.

```sh
npm ci --prefix contracts --ignore-scripts
python scripts/verify_prb_constants.py
forge test
forge fmt --check
python scripts/quote_bounds_fixtures.py
forge fmt
```

On the current Windows machine, Forge exists outside PATH and the official
compiler was downloaded to the ignored project directory. Reproduce offline:

```powershell
& "$env:USERPROFILE/.foundry/bin/forge.exe" test --use target/tools/solc-0.8.28.exe --offline
& "$env:USERPROFILE/.foundry/bin/forge.exe" fmt --check
```

Compiler: `solc-windows-amd64-v0.8.28+commit.7893614a.exe`; SHA-256 verified against
the [official compiler manifest](https://binaries.soliditylang.org/windows-amd64/list.json):
`76a71001309810aafd0462d9b2f2612bf19b89550c866140edca26e533de06bc`.
This ignored binary is not part of the repository; a normal `forge test` installs
the pinned compiler through Foundry when needed.

These pure arithmetic tests ran with the available Foundry 1.5.0. They do not
establish Monad gas or execution compatibility. Before network-dependent tests,
follow [Monad's toolchain guidance](https://docs.monad.xyz/developer-essentials/differences)
for a supported Foundry release and Monad execution settings.

The generator imports the existing Rust-reference scenarios and computes cost
interval fixtures independently with Python Decimal. It requires stable integer
brackets at 80 and 120 digits, then adds a one-WAD-unit guard on each side. Tests
check conservative direction relative to the high-precision ideal quote for
0/6/18 decimals, allowing at most four atomic units of fixture rounding slack.
This validates interval subtraction/conversion, not Solidity exp/log accuracy.
Run `forge fmt` after regeneration to normalize generated Solidity formatting.
