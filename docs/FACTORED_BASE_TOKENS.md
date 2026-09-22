# Factored base-event receipts

`FactoredPool` issues transferable ERC-20 receipts backed by its existing YES/NO
holdings. The receipts use the same shared collateral and factor ledger as all
composed claims. They do not create another pool or change executable prices.
This is a local implementation milestone toward the idea's required Kuru tier.
The [Kuru fork rehearsal](KURU_FORK_REHEARSAL.md) now exercises factored receipts
against deployed Kuru/AUSD code at a pinned historical block. Factored receipts
have not been deployed publicly or connected to mobile trades.

## Identity and creation

`createBaseToken(eventIndex, outcome)` is permissionless and idempotent. Indices
start at zero and must be below the pool's immutable event count (at most 32).
`true` selects YES and `false` selects NO. Creation can precede funding and starts
with zero supply. Only singleton base claims can be registered.

`baseClaim` returns `scope = uint32(1) << eventIndex` and a local payoff mask:
YES is `2`, NO is `1`. For event 31, the scope is `0x80000000`; the masks remain
2 and 1. These are different keys from the reference pool's global-state masks.

The authoritative token address is `pool.baseTokens(scope, mask)`. Verify the
pool, its collateral and settlement rules, and this registry when creating a
Kuru pair. Display names and symbols are not unique across pools. Each receipt
exposes immutable `pool`, `scope`, `mask`, and the collateral's decimal precision.

Each pool deploys an immutable, stateless `FactoredBaseTokenFactory` at construction.
It keeps receipt creation bytecode out of the pool runtime. The factory assigns
its caller as the new receipt's issuer; it has no authority to mint or burn the
pool's canonical receipts. Anyone can call the factory and create their own
lookalikes. Factory provenance alone does not establish canonical identity, and
external factory calls cannot register a token in the pool.

## Conversion, transfers and accounting

The token must exist before either conversion call:

1. `wrapBase(eventIndex, outcome, quantity)` debits the caller's internal claim,
   credits the receipt address's escrow holding and mints that many receipt atoms
   to the caller. A trader must acquire the claim through the pool first.
2. Standard ERC-20 `transfer`, `approve` and `transferFrom` move the receipt. They
   do not alter the pool's factor tables or ownership of the escrow holding.
3. `unwrapBase(eventIndex, outcome, quantity)` burns the caller's receipt atoms,
   debits escrow and restores the same internal claim to the caller.
4. The holder can sell restored claims before close using the pool's executable
   quote, or redeem them after resolution using the existing settlement rules.

Only the pool can mint/burn its canonical receipt. Unwrapping burns only the
caller's tokens; it does not use allowances or burn a third party's balance.
Conversions require positive quantities and sufficient exact holdings/balances.
All pool conversion and creation entry points share the trading reentrancy guard.

For every canonical receipt:

```text
receipt.totalSupply() == pool.holdings(receiptAddress, scope, mask)
terminal liability == sum of paying internal holdings, counting receipt escrow once
```

Receipt holders' ERC-20 balances must not be counted again as extra liabilities.
Conversions move ownership only: factor values, pool collateral, required
collateral, and base/composed quotes are unchanged. Wrapped units cannot also be
sold or redeemed by the original internal holder.

Conversions remain available after close and resolution, including during a
collateral shortfall, because they do not withdraw collateral. Redemption still
requires full coverage of remaining winners. Winning units pay one collateral
atom each; losing units burn for zero. No resolver, cancellation or conditional
security behavior is changed by the receipt layer.

## Local evidence and next gate

`contracts/test/FactoredBaseToken.t.sol` covers first/final event identity in
1/3/32-event clusters, 0/6/18 decimals, high-bit redemption, partial conversion,
allowance-based transfers, unchanged quotes/cash/liabilities, selling restored
holdings, 256 randomized transfer/settlement cases, invalid-call rollback,
unauthorized mint/burn, lookalike isolation, double-spend rejection, shortfall
recovery and collateral callback rejection. An independent two-event oracle
reconstructs factor liabilities from user holdings plus receipt escrow.

The full local suite passes 225 Solidity tests and formatting checks with the
pinned solc 0.8.28 configuration. Runtime sizes are 21,333 bytes for the pool,
4,708 for its factory and 2,448 for a receipt. The pool's creation bytecode is
35,318 bytes before constructor arguments. These measurements do not establish
deployment affordability or a production security review.

The subsequent Kuru fork suite passes 11 factored and three reference tests:
pair assets, deposit/order/cancel/withdraw, post-only rejection, subsequent
redemption and a factored shared-pool sale/composed-claim lifecycle, plus [local
fills and fee reconciliation](KURU_FILL_ACCOUNTING.md). Receipt fees and dust
retained in Kuru remain backed after user redemption. Next is executable arbitrage anchoring. Public
deployment and usage evidence remain separate required milestones. See
[partner delivery](INTEGRATIONS.md).
