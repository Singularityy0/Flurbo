# Base-event ERC-20 receipts

This page describes the enumerated reference pool. The separate
[factored receipt implementation](FACTORED_BASE_TOKENS.md) supports 1–32 events
with scope/local-mask keys and has its own local backing tests.

`ReferencePool` can now issue one canonical YES and NO token per base event.
These are transferable receipts for existing claims in the same shared pool,
intended as the assets for Kuru pairs. They are **locally tested only**: no public pair,
listing, order, fill or live collateral integration has been completed.

## Issuance and backing

`createBaseToken(eventIndex, outcome)` is permissionless and idempotent. Event
indices start at zero; `true` selects YES, `false` selects NO. Only the configured
1–3 base events are supported. The pool computes the mask itself and records the
token in `baseTokens(mask)`. No arbitrary composed-claim token can be registered.
Creation may precede funding and creates zero supply.

For two events, A YES/NO masks are 10/5, and B YES/NO masks are 12/3. Each token
fixes its issuing pool, mask and decimals; decimals equal the pool's collateral
decimals. A winning token unit represents one collateral atomic unit after
unwrapping. Names such as `Flurbo event 0 YES` and symbols such as `FLB0Y` are
display labels; canonical identity is **chain + pool + mask + registered address**.
The pool's immutable rules hash supplies the event-definition/resolution context.
Anyone can deploy lookalike ERC-20s, so consumers must check the registry.

After buying base claims through the existing cost function, the owner calls
`wrapBase(eventIndex, outcome, quantity)`. It subtracts their internal holding,
credits an equal escrow holding at the token contract address, and mints equal
ERC-20 units to the caller. No collateral moves and no terminal liability changes.
Only the pool can mint/burn this receipt, and its conversion entry points act on
the caller's own holdings or token balance. No admin or discretionary mint exists.

The accounting invariant for each canonical mask is:

```text
receipt.totalSupply() == pool.holdings(receiptAddress, mask)
terminal liability = sum of paying internal holdings, including receipt escrow once
```

Receipt holders are not counted again in the terminal ledger. Transfers and
allowance-based `transferFrom` move ownership of escrow receipts without changing
pool cash, liabilities, collateral requirements or executable quotes. All receipts
and composed internal claims retain the same backing pool.

## Selling and settlement

`unwrapBase(eventIndex, outcome, quantity)` burns caller-owned tokens, subtracts
the escrow holding and credits equal internal claims to the caller. It requires
no allowance because the caller is explicitly burning their own tokens. A holder
can then sell those internal claims through the pool before close, or redeem
them after resolution. The original wrapper cannot sell/redeem escrowed claims.

Conversions and ordinary token transfers remain available during closure and
after resolution, including losing claims. Winning claims redeem for their exact
quantity; losing claims burn for zero. Unwrapping also remains possible during a
collateral shortfall because it withdraws nothing; existing sell/redemption
coverage checks still block unsupported payouts. All pool mutations use the same
reentrancy guard and revert atomically on failure.

There is no complete-set split/merge, direct ERC-20-to-collateral redemption,
atomic buy-and-wrap/unwrap-and-sell router, rescue authority or tradable
conditional security in this slice. Separate conversion and trade calls do not
reserve a quote; execution still enforces the caller's slippage/deadline limits.

## Verification and Kuru handoff

Run `forge test --match-contract BaseEventTokenTest`, or the complete `forge test`
suite. Seven new tests cover canonical YES/NO masks for all supported event counts,
0/6/18 decimals, supply backing, transfers/allowances, unchanged quotes, subsequent
sales, double-spend prevention, failure rollback, reentrancy and shortfall handling.
The 256-case fuzz test varies event, YES/NO side, terminal state and quantity,
reconstructs liabilities including escrow, and checks both owners' final payouts.

The [Kuru testnet draft](KURU_TESTNET_PLAN.md) now plans exact order units and
checks live read interfaces. A [local fork rehearsal](KURU_FORK_REHEARSAL.md) now
passes receipt/AUSD pair deployment, margin deposits/withdrawals, post-only
buy/sell cancellation and subsequent receipt redemption. Public deployment,
listing access and fills remain pending. An executable
arbitrage path must account for inventory, fees, depth, gas and transaction
atomicity. ERC-20 compatibility alone does not establish Kuru integration or
price anchoring. The final factored engine and tradable conditionals remain required.
