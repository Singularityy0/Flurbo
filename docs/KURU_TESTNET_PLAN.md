# Kuru testnet pair and order draft

This slice prepares **unsigned order payloads and read-only interface checks**
for canonical Flurbo receipt/AUSD markets. It does not deploy a pair, seed an
AMM vault, deposit margin, submit an order or cancel one. The reference pool is
still the enumerated test implementation; final factored pricing and conditional
claims remain required.

## Reviewed interface

The [official deployment guide](https://docs.kuru.io/sdk/deploy-market) supports
Router deployment for two existing assets using `NO_NATIVE` (enum value 0).
Use a token from `pool.baseTokens(mask)` and the verified AUSD contract, preserving
Flurbo's backed supply. The generic token launcher is not this issuance path.

The public repository's latest revision on September 22, 2026 was
`2060bb2736080c175d80d568bfdb6226bb5abd04`.
[Router](https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/2060bb2736080c175d80d568bfdb6226bb5abd04/contracts/Router.sol)
and [OrderBook](https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/2060bb2736080c175d80d568bfdb6226bb5abd04/contracts/OrderBook.sol)
define these interfaces:

| Operation | Signature |
| --- | --- |
| Create pair | `deployProxy(uint8,address,address,uint96,uint32,uint32,uint96,uint96,uint256,uint256,uint96)` |
| Limit buy | `addBuyOrder(uint32,uint96,bool)` |
| Limit sell | `addSellOrder(uint32,uint96,bool)` |
| Cancel regular orders | `batchCancelOrders(uint40[])` |
| Read parameters | `getMarketParams()` returning 11 static ABI words |

The draft encodes `postOnly=true`. Limit orders consume margin-account balances;
approving an ERC-20 alone does not fund an order. Cancellation refunds available
remaining inventory to margin, not directly to the wallet. Obtain the actual order
ID from the confirmed placement event and verify owner/market before cancelling.
Partial fills, cancellations and withdrawals need separate reconciliation.

## Draft units

[The configuration](../config/kuru-testnet-plan.json) proposes:

| Parameter | Value / meaning |
| --- | --- |
| Chain / asset decimals | Monad testnet 10143; base 6, quote 6 |
| Price / size precision | 1,000,000 / 1,000,000 |
| Price tick | 100 units = 0.0001 AUSD per receipt |
| Client size increment / minimum | 10,000 units = 0.01 receipt |
| Maximum order size | 100,000,000 units = 100 receipts |
| Taker fee / maker rebate | 30 / 10 bps; proposed parameters, not measured fill costs |
| AMM spread | 100 bps; source requires multiples of 10 with `0 < spread < 500` |

The **size increment is a client restriction**, not an on-chain Kuru lot rule.
It makes each tick × increment exactly one AUSD atomic unit. The contract's
post-only buy reserve is `ceil(priceUnits * sizeUnits / sizePrecision)`, then
converted to quote atomic units. Cancellation uses a floor for remaining buy
size. For an untouched order on this grid both agree; partial fills can produce
different rounding. No silent rounding is performed by our planner.

Example: buy 1 receipt at 0.50 AUSD → price 500,000, size 1,000,000, required
quote margin 500,000 atoms. A sell of the same size needs 1,000,000 base atoms.
These are inventory requirements for an unfilled post-only order, not an
all-in estimate of taker fees, gas, liquidity or executable arbitrage profit.
The draft rejects prices outside `(0, 1]`; Kuru itself is not capped at payout.

## Run from the repository root

```sh
python scripts/kuru_order_plan.py --side buy --price 0.50 --size 1
python scripts/check_kuru_readiness.py
python -m unittest discover -s scripts -p 'test_kuru_*.py' -v
```

The order planner is offline and has no market destination or signing path.
The probe defaults to public testnet RPC; `--provider alchemy` uses the existing
local `FLURBO_ALCHEMY_TESTNET_RPC_URL` configuration without printing it. It
accepts only the existing readiness transport's read methods, pins contract reads
to one block and rejects a changed block hash, wrong chain, missing code,
mismatched margin address/decimals or malformed getter returns.

Twelve tests cover amount/grid/ABI boundaries, independent Foundry calldata
vectors, read-only transport, inconsistent snapshots and incompatible responses.

## Observed result and remaining gates

The September 22 public-RPC probe passed at block **64,729,226**, hash
`0xe283cbb9e76f72a930d3712e7ed92b2d79122cd43c6a0007bfe7c6954c9d8fe1`.
The [published testnet factory](https://docs.kuru.io/contracts/Contract-addresses)
returned margin account `0xd029c2d98ff85d8f64799017fe00a59b1159ce02`, orderbook
implementation `0x72cae0a99c19b574e8a6de558f43fc1d019c9374` and vault implementation
`0x4d54e0d60cab0cec0100cda8e00897bc933c5bb6`; all had code. AUSD returned 6 decimals.
The published MON/USDC reference market returned 11 words, with price precision
100,000,000 and size precision 10,000,000,000. Those reference parameters are not
our receipt/AUSD proposal.

The probe reports SHA-256 code fingerprints for comparison. Identical proxy
fingerprints do not establish identical implementations, and getters do not
prove source/bytecode equivalence or deployment/order compatibility. No Kuru SDK
version has been installed or declared compatible based on this probe.

The [local fork rehearsal](KURU_FORK_REHEARSAL.md) now passes pair deployment,
post-only buy/sell cancellation, withdrawals and receipt redemption using actual
Kuru/AUSD code at this snapshot. Public execution remains a separate step: review
transaction parameters and funding needs with the user before proceeding.
Live execution needs a dedicated test wallet, test MON and test AUSD, deployed
Flurbo contracts and wrapped inventory. Keys stay local. Listing access, actual
fills, price anchoring and partner eligibility remain separate evidence gates.
