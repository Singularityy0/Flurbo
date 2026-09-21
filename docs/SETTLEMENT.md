# Reference resolution and redemption

This is the local, enumerated settlement model. The pool's fixed resolver is a
trusted test authority, **not a Chainlink CRE integration**. Production resolution
must implement the CRE workflow required by `flurboidea.md` section 8.5. No live
deployment, data-source verification, or real collateral is part of this slice.

## Immutable rules and state encoding

The constructor takes `resolver` and `settlementRulesHash` alongside the existing
token, event count, b, and trading close. Neither can be changed. The nonzero hash
is a commitment to exact rule bytes, not evidence that a report follows them.
For a real cluster, those bytes must describe ordered event identities, source
of record, observation times, binary outcome interpretation, finality, and any
exception policy. The exact preimage must be published and checked by clients;
the pool does not fetch it or validate its content.

Tests use `keccak256` of this exact UTF-8 text, without a trailing newline:

```text
Flurbo reference rules v1: event i is bit i; outcomes are test inputs supplied by the fixed resolver after close; binary only; final once; no cancellation.
```

For one to three events there are 2/4/8 terminal states. Event i is bit i of the
state index. Two-event states are 0 (neither), 1 (A only), 2 (B only), and 3 (both).
Bit s of a canonical claim mask determines its payout in terminal state s. One
final state therefore settles every base and composed Boolean claim together;
there is no oracle call or discretionary price for each derived claim.

## Finalization

`resolve(uint8 terminalState)` requires the fixed resolver, a funded pool, and
`block.timestamp >= closesAt`. The state must be in range. Resolution is final
and happens once, including when the result is zero; `resolved` distinguishes
zero from an unresolved pool. `Resolved` records the state and immutable rules hash.
Trading and price previews remain closed. This version has no partial event
resolution, correction, dispute window, void state, or resolver replacement.
If the resolver never reports, claims cannot redeem; no timeout refund exists.

Finalization records an outcome even during a collateral shortfall. It cannot
move funds. Before resolution, `requiredCollateral()` is the largest terminal
liability. Afterwards it is the remaining liability in the resolved state.
Impossible states no longer determine the reserve; resolution itself leaves
the liability array and all claim balances unchanged.

## Redemption

`redeem(mask, quantity)` requires resolution, a valid nonconstant mask, positive
quantity, and enough of that exact claim owned by the caller. It burns only the
requested quantity, so partial redemption works. Accumulated holdings can redeem
in one call even when they exceed b, the per-trade quantity limit.

Winning units pay exactly `quantity` collateral atoms to their owner. Losing
units burn for zero with no ERC-20 transfer call. Each burn subtracts quantity
from every state selected by the claim mask, keeping the array equal to the
sum of remaining holdings. `Redeemed` records owner, mask, quantity, and payout.
Reusing burned units fails the ownership check.

Both before and after redemption, actual collateral must cover all remaining
winning units. For a winner, reserve and cash each decrease by exactly quantity;
for a loser, neither changes. This preserves coverage independently of redemption
order. A deficit blocks even a small winning payout, so the first caller cannot
consume another winner's reserve. Losing burns also require coverage. A donation
that restores the full reserve permits redemption to resume.

All mutating methods share the reentrancy guard. Transfer failure or non-exact
balance changes revert the burn, liabilities, and token movements atomically.
There is no redemption fee, expiry, allowance requirement, operator redemption,
collateral sweep, sponsor withdrawal, or allocation of remaining surplus.

## CRE boundary still to implement

The final integration must fetch and validate each base event's source-of-record
observation and construct the terminal bits deterministically. Its receiver must
authenticate the authorized CRE workflow/report path and bind the result to the
intended chain, pool, rules, and observation context before calling `resolve`.
A plain resolver address check does not perform any of these validations.

Workflow simulation, report authentication/replay tests, and verified network
configuration are required before claiming partner completion. The user still
needs to choose real event definitions and sources; access credentials must be
configured locally when needed. See [partner requirements](INTEGRATIONS.md).
