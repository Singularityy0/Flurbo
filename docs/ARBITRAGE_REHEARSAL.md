# Atomic arbitrage: local execution checkpoint

This batch completes five bounded tasks: define conservative execution bounds,
exercise pool-to-Kuru, exercise Kuru-to-pool, prove failure rollback, and record
gas/results with remaining delivery gates. It implements a local execution
experiment, not a deployed autonomous keeper or a complete partner integration.

`contracts/fork/helpers/FactoredArbitrage.sol` is deliberately in the opt-in fork
tree. Its test operator pre-funds it with fork AUSD; no private key, broadcast,
live faucet transaction or public market is involved. The fixture has eight
synthetic events, ascending elimination order, b=10 AUSD and event-7 YES receipts.
Kuru uses its deployed code at Monad testnet block 64,729,226 with the existing
six-decimal pair settings and an unseeded AMM vault.

## 1. Candidate and execution bounds

An operator supplies a `Plan`: quantity, maximum spend, minimum cash received,
gas allowance in AUSD atoms, minimum profit, and deadline. Quantity, spend,
allowance and minimum profit must be positive. Before execution:

```text
minReceive >= maxSpend + gasAllowance + minProfit
```

After both legs, actual wallet balances must satisfy that same economic floor
using actual spending. Existing receipt balances and internal pool holdings must
be preserved, so consuming old inventory cannot masquerade as round-trip profit.
The constructor binds the pool's canonical receipt registry, event scope/mask,
collateral, and Kuru pair assets/precision. This helper only supports six-decimal
assets with price and size precision of 1,000,000. A different canonical claim's
pair is rejected. This is not a generic permissionless router.

The local operator alone may execute or withdraw cash. Allowances are exact and
cleared after successful use. The executor uses Kuru's wallet-funded market calls,
not standing margin balances; no receipt or claim inventory remains from a
successful round trip. Donated pre-existing receipts remain untouched.

## 2. Pool to Kuru

Buy a bounded number of YES units from the current pool state, wrap them, and
sell those receipts into Kuru bids with a minimum net AUSD output. The Kuru leg
uses fill-or-kill. Fees are already deducted from the returned AUSD amount.
The test verifies final balances, remaining bid size, backing and a higher pool
buy quote after the trade, moving toward the fixture's higher Kuru bid.

## 3. Kuru to pool

Spend a fixed AUSD budget against Kuru asks using fill-or-kill and a minimum net
receipt output. The plan specifies the exact net receipt quantity after fees.
An unexpected quantity, including a larger quantity after an improved ask, causes
rollback and requires a fresh plan. Unwrap exactly that quantity and sell it to
the pool at the supplied minimum proceeds. The test verifies no leftover receipt
inventory and a lower pool buy quote, moving toward the fixture's lower ask.

This strict equality is a rehearsal constraint, not optimized production sizing.
The operator must simulate the entire route; multiplying an order-book midpoint
by quantity does not establish execution or profit.

## 4. Failure and authorization evidence

Thirteen tests cover both successful routes, an inclusive profit boundary,
pre-existing inventory, fees/allowance eliminating apparent profit, stale pool
buy/sell quotes, insufficient bid/ask depth, worse bid prices, changed net receipt
quantity, expired/invalid plans, operator authorization and wrong-pair rejection.

Failure snapshots include factor tables, required collateral, receipt supply,
order storage, pool/receipt/market allowances, wallet and margin balances, and
internal holdings. Failures on the second leg restore the first leg as well;
fee collection confirms failed fills accrued no protocol fees. On a real chain,
a reverted transaction would still cost gas. No revert-loss or MEV protection is
claimed here.

## 5. Measurements and handoff

Configuration: solc 0.8.28, optimizer 200 runs, Cancun, pinned local fork.
Each route starts from its own unchanged fixture, with ten YES units already
issued by the pool. The operator has 20 AUSD and a 0.01 AUSD synthetic gas
allowance; its minimum profit is another 0.01 AUSD.

| Route | Executed amounts | Gross AUSD gain | After synthetic allowance | Measured call gas |
|---|---|---:|---:|---:|
| Pool → Kuru bid at 0.9 | Buy 1 receipt for 0.740737; sell for 0.897300 after Kuru fee | 0.156563 | 0.146563 | 678,122 |
| Kuru ask at 0.5 → pool | Spend 0.500000; receive 0.997 receipts after fee; sell for 0.718945 | 0.218945 | 0.208945 | 646,093 |

Gas is measured around the executor call with setup, quotes and assertions
outside the region. Earlier calls warm state. Each measured call has an 800,000
gas regression budget; these are not cold transaction gas estimates, deployment
costs, or dense-graph worst-case bounds. Both pool quote movements are directional
checks for a fixed size, not proof of convergence or calibrated correlations.

The AUSD gas allowance is a fixture input. It is not derived from current MON
gas prices or MON/AUSD conversion, so these figures are not live net-profit
claims. A live candidate needs fresh gas estimation, a conservative native-token
conversion and a policy for data freshness and failed transactions.

The complete suite passes 27 fork tests (13 arbitrage, 11 factored lifecycle/fill,
three reference) and 225 offline Solidity tests. Shared setup was extracted to
`KuruLifecycleFixture` so the new suite reuses pair validation without duplicating
inherited test counts. Reproduce:

```sh
FOUNDRY_PROFILE=kuru_fork forge test --fork-url https://testnet-rpc.monad.xyz -vv
forge test --offline
forge fmt --check
forge fmt --check contracts/fork/KuruOrderLifecycle.t.sol contracts/fork/FactoredKuruOrderLifecycle.t.sol contracts/fork/KuruArbitrage.t.sol contracts/fork/helpers/FactoredArbitrage.sol
```

A [read-only candidate scanner](ARBITRAGE_SCANNER.md) now evaluates configured
sizes in both directions using matching-engine quotes, gas conversion, full
calldata simulation and stale/unprofitable rejection. Its HTTP integration now
passes against a [persistent local deployment](DEMO_DEPLOYMENT.md). The next
delivery target is a manual test dashboard.
Repeated trading, multiple makers/levels,
inventory policies, market upgrades, MEV and deployment gas remain open. The
factored CRE port, actual conditional securities, mobile/Mera/AUSD, Envio,
Alchemy, MetaMask and independent usage evidence remain required elsewhere.

No human input was needed for this local batch. Live execution later requires a
dedicated funded account and reviewed deployments/configuration; mobile passkeys
still need the domain and missing bounty criteria previously requested.
