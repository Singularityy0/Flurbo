# Kuru order lifecycle on a local Monad testnet fork

The opt-in suite passed **seven tests** at Monad testnet block **64,729,226** on
September 22, 2026: three for `KuruOrderLifecycleTest` (enumerated reference pool)
and four for `FactoredKuruOrderLifecycleTest` (32-event factored pool).
Foundry fetched that block's chain state and
executed every mutation locally. No public transaction, wallet signing, public
faucet claim, listing or live order was performed.

## What ran

The test uses the configured, deployed Kuru Router, MarginAccount, orderbook/vault
implementations, AUSD and Agora faucet. It calls the faucet's `requestFunds` method
inside the fork, following the [documented faucet interface](https://docs.agora.finance/instant-settlement/guides/getting-testnet-tokens)
and [Monad testnet addresses](https://docs.agora.finance/developer/contract-deployments).
It does not replace contract code, impersonate a privileged account or overwrite
token balance storage.

The reference setup deploys Flurbo's pool with synthetic two-event rules and
b=100 AUSD. The factored setup uses 32 synthetic events, ascending elimination
order and b=10 AUSD, keeping its initial subsidy within the fork faucet balance.
Each setup funds its pool with test AUSD, buys ten base YES claims and wraps all
ten into the canonical receipt. The factored asset is event 31: scope `0x80000000`,
local mask `2`. Its pool identity, scope, mask, decimals and registry are checked.
Kuru's factory then creates a receipt/AUSD pair using the reviewed draft settings.
The test checks margin registration and every returned market parameter against
the draft. The AMM vault is created by Kuru but left unseeded; these tests exercise
the order book with explicitly deposited margin.

| Test | Verified result |
| --- | --- |
| Post-only buy → cancel → withdraw | Deposit 2 AUSD; reserve 0.5 for one receipt; recover the full reserve on cancellation and restore the wallet/custody balances after withdrawal |
| Post-only sell → cancel → withdraw → redeem | Deposit three receipts; reserve one; recover and withdraw all three; then unwrap all ten receipts and redeem exactly 10 AUSD after local resolution |
| Crossing post-only buy | Reverts with `PostOnlyError`; both margin balances, the resting ask and Flurbo backing remain unchanged |
| Factored withdrawal → pool sale → composed claim → redemption | Cancel/withdraw three receipts; unwrap and sell one at the executable pool quote; buy one event-0 AND event-31 claim from the same pool; settle and redeem the nine remaining base receipts plus the composed claim for exactly 10 AUSD |

Both pool fixtures run the first three tests through shared Kuru operations and
assertions. The fourth runs only on the factored fixture. This retains the
small-state reference regression while testing the factored asset lifecycle.

Order IDs come from actual `OrderCreated` logs emitted by the local-fork Kuru
market. Owner, size, price and side are also checked against order storage.
Cancellation must delete the order and restore the expected margin balance.
Throughout Kuru custody and order operations, receipt supply, escrow holdings,
pool cash, terminal liabilities and required collateral remain unchanged.
Factored snapshots include every stored factor, the issuer's internal holdings,
and executable base and composed buy quotes. The fourth test also verifies
coverage and the shared maximum liability after the new pool trades.

## Reproduce in Git Bash

From the repository root, with the existing contract dependencies installed:

```sh
FOUNDRY_PROFILE=kuru_fork forge test --fork-url https://testnet-rpc.monad.xyz -vv
```

`foundry.toml` pins the block and grants this profile read access only to `config/`.
The tests reject the wrong chain/block. Historical state must be available from
the provider; a transport/archive error is not a passed rehearsal. A locally
configured Alchemy testnet endpoint may be substituted for the public RPC.
No private key is required, and there is no broadcast code in the harness.

The normal suite remains separate and offline:

```sh
forge test --offline
forge fmt --check
forge fmt --check contracts/fork/KuruOrderLifecycle.t.sol contracts/fork/FactoredKuruOrderLifecycle.t.sol
```

Verified with Foundry 1.5.0, Solidity 0.8.28, Cancun EVM settings and the repository's
optimizer settings. The offline suite passes 225 tests. The factored test gas
lines include expensive quote snapshots and assertions; they are not individual
Kuru transaction gas measurements. This fork result
establishes compatibility for these specific calls and state, not general source
equivalence, current deployment readiness or realistic transaction gas budgets.

## Remaining work

Public deployment, independent counterparties/fills, partial-fill fee/rounding
reconciliation, listing access, AMM liquidity and executable-price arbitrage
remain unverified. The fork uses a trusted local resolver; it does not deliver a
signed CRE report. Successful cancellation is not trading-volume evidence.

The next Kuru slice is two local counterparties executing fills, including
partial fills and exact fee/rounding reconciliation, followed by an executable
arbitrage loop against the factored pool. The CRE adapter still targets the
enumerated pool and needs its own port. Public testnet execution can follow a review of
the exact transactions and dedicated wallet/test MON/AUSD funding setup. Mera,
official settlement sources and the remaining partner milestones remain required.
