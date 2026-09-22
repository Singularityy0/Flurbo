# Kuru fill accounting on the pinned local fork

Seven additional tests in `FactoredKuruOrderLifecycleTest` execute market buys
and sells against a distinct maker's resting orders at Monad testnet block
64,729,226. The suite now passes 14 fork tests (11 factored, three reference),
plus 225 offline Solidity tests. All orders, transfers, fee collection and
redemptions execute locally with synthetic event rules and the fork's deployed
Kuru/AUSD code. These test actors are not independent customers or usage evidence.

The maker is the test contract and the taker is an ordinary local address.
The harness deposits assets into their separate margin accounts and uses each
owner's identity for trading, withdrawal and redemption. It does not impersonate
a privileged account, alter balances through storage writes, or broadcast.
The pair uses six-decimal receipts/AUSD, price and size precision of 1,000,000,
30 bps taker fees and 10 bps maker rebates. The AMM vault remains unseeded.

## Exact observed amounts

All amounts below are integer token atoms. A buy fee is deducted from base
receipts received; a sell fee is deducted from AUSD received. The maker rebate
uses that same fee asset. Maker trade proceeds are credited separately.

| Taker operation | Gross received | Taker fee | Net received | Maker rebate | Protocol credit | Unallocated fee remainder |
|---|---:|---:|---:|---:|---:|---:|
| Buy at 0.5, spend 500,000 AUSD atoms | 1,000,000 receipts | 3,000 | 997,000 | 1,000 receipts | 2,000 receipts | 0 |
| Buy at 0.3332, spend 3,334 AUSD atoms | 10,006 receipts | 31 | 9,975 | 10 receipts | 20 receipts | 1 receipt atom |
| Sell 1,000,000 receipts at 0.5 | 500,000 AUSD | 1,500 | 498,500 | 500 AUSD | 1,000 AUSD | 0 |
| Sell 10,001 receipts at 0.3332 | 3,332 AUSD | 10 | 3,322 | 3 AUSD | 6 AUSD | 1 AUSD atom |

The pinned implementation rounds taker fees up, maker rebates down, and the
protocol's share down. Protocol accrual is `floor(takerFee * 20 / 30)` for these
settings. Taker fee minus maker rebate need not equal protocol credit.

Quote conversion and cancellation can leave another remainder. In the fractional
buy, the maker receives 3,333 of the 3,334 AUSD atoms spent. In the fractional
sell, the maker initially reserves 9,996 AUSD atoms for a 30,000-receipt bid;
cancelling the remaining 19,999 units refunds 6,663 atoms. Reserve minus refund
minus gross fill proceeds is one atom. After user withdrawals, Kuru custody
retains 21 receipt atoms plus one AUSD atom in the fractional buy, or eight AUSD
atoms in the fractional sell. These totals include protocol fees and rounding
remainders; the tests do not attribute all residual custody to withdrawable fees.

These are fixed regression vectors, not universal dust bounds. Different
precisions, multiple price levels, multiple makers, and mixed vault fills require
additional reconciliation before generalizing the result.

## What the tests enforce

- Both partial-fill directions and an exact full buy consume the expected order
  size. Partial-order cancellation refunds only the remaining reserve.
- Actual `Trade` logs match order ID, maker, taker, side, scaled price, filled
  size and remaining size. Remaining order size agrees with storage.
- Maker/taker margin balances, withdrawals and custody deltas match exact amounts.
- Permissionless `collectFees` calls the deployed margin contract with the exact
  expected protocol credits. A second collection credits zero. The harness does
  not withdraw from or impersonate the protocol fee collector.
- Slippage and fill-or-kill failures in both directions revert an attempted fill,
  preserving the resting order, both users' balances, custody and pool backing.
  Failed fills leave no protocol fee accrual.
- Fills preserve receipt supply, pool escrow, factors, required collateral, pool
  cash, and executable base/composed quotes. User-held receipts withdraw, unwrap
  and redeem for their exact winning payout after local resolution. Receipts left
  in Kuru as fees/dust remain outstanding and fully backed; the pool retains the
  matching payout obligation.

Run the full opt-in suite using the commands in [the fork rehearsal](KURU_FORK_REHEARSAL.md).
Next is a local executable-price arbitrage rehearsal with net fees, integer
rounding, slippage and available depth included. Public counterparties, live
fills, deployment limits, AMM liquidity and usage evidence remain open gates.
