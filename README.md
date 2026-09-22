# Flurbo

An on-chain combinatorial market maker for prediction markets: one shared
liquidity pool that coherently prices multi-leg claims through a deterministic
cost function, with tradable conditional claims as a planned extension.

## Product direction

The product source is the user's `flurboidea.md`, currently located at
`tmp/flurboidea.md` (a local, ignored planning file). Its shared on-chain maker,
factored inference, tradable conditionals, and Kuru anchoring remain the target.
The previous routing-first strategy does not supersede it. See
[integration milestones and open requirements](docs/INTEGRATIONS.md).

- **One shared pool per event cluster:** base and composed claims draw on the
  same funded liquidity and joint-state liability ledger. Composing a new claim
  inside that cluster does not require funding a separate pool.
- **Coherent multi-leg pricing:** arbitrary AND/OR/NOT combinations within the
  supported event set compile to canonical payoffs and use the same cost function.
  Small two- and three-event enumeration remains an oracle for validating the
  bounded-treewidth engine; the factored trade language currently supports
  Boolean claims over at most three selected events in a cluster of up to 32.
- **On-chain execution:** contracts compute and enforce executable pool prices
  from current state, with user slippage limits. Rust supplies reference calculations
  and simulations. Trading against the pool must work without RFQ responses or Kuru.
- **Conditional claims remain on the roadmap:** displaying `P(A | B)` alone does
  not implement a tradable claim. First specify the payout/collateral behavior
  when B is false, fungibility, and settlement; then prove accounting and implement
  it as a separate milestone. Phase 1 covers Boolean claims only.
- **Kuru anchoring is required:** base-event ERC-20 claims trade on its CLOB; a
  keeper compares executable depth against pool prices. Transformation routing
  can follow, but does not replace the two-tier mechanism in the idea document.

The first end-to-end gate is a funded on-chain pool that quotes, buys, sells,
and settles base and multi-leg claims from the same state while preserving
collateral coverage. Kuru integration follows that gate.

Public Monad/AUSD/Kuru infrastructure checks and the Expo/Mera setup requirements
are recorded in [integration readiness](docs/INTEGRATION_READINESS.md), with a
repeatable read-only probe. These checks do not constitute completed integrations.

The [Expo mobile preview](apps/mobile/README.md) now provides the native client
foundation and a read-only testnet connection check. Account authentication,
balances and trading are not connected; native-device validation remains pending.

## Current phase

A [factored pricing reference](docs/FACTORED_PRICING.md) now evaluates one global
LMSR cost, conjunction probabilities and maximum liabilities for up to 32 binary
events under a validated elimination order of width at most two. Buy/sell
simulations support Boolean claims over up to three selected events, revalidate
the resulting graph and numeric domain, and reuse exact-scope factor tables.
These Rust simulations remain reference tools.
The [Solidity factored evaluator](docs/FACTORED_NUMERICS.md) now validates graph
width and computes a conservative cost enclosure using bounded tables, with an
explicit error propagation budget. It also computes exact maximum liabilities
over the shared outcome space. [Factored buy/sell quotes](docs/FACTORED_QUOTES.md)
now apply local Boolean trades, round collateral conservatively, and return
the exact resulting maximum liability. The [funded factored pool](docs/FACTORED_POOL.md)
now integrates owner holdings, conservative execution, exact collateral coverage,
trusted resolution and redemption in local tests. Gas optimization, public
deployment and porting partner adapters remain pending.
The [first gas optimization](docs/FACTORED_GAS.md) reduces the measured large-graph
quote costs by 29–34% with unchanged outputs; deployment gas limits remain a gate.

Phase 1 provides payoff algebra for one to three binary events and split/merge
validation. Phase 2a adds an enumerated LMSR reference model: shared probabilities,
conditional-probability analytics, and fee-free buy/sell simulations checked
against independent 80-digit Decimal fixtures. Neither phase executes trades.

Phase 2b adds `ReferenceLedger`, an unresolved single-cluster accounting model.
It records buys/sells in `u128` atomic units, tracks each owner's canonical claim
holdings, and enforces `collateral >= max(terminal liabilities)` after every
accepted operation. One claim quantity unit pays one collateral atomic unit in
a winning state. Overselling, overflow, zero quantities, and uncovered payouts
are rejected without changing state. Headroom is coverage surplus, not profit.

The ledger accepts separately authorized integer collateral receipts/payouts;
it does not compute or validate trade prices, authenticate users, check wallet
balances, or move tokens. Initial funding is supplied explicitly, not calculated
from floating-point LMSR. Pricing and accounting remain separate reference tools
until conservative fixed-point quoting and contract enforcement are implemented.
Transfers, split/merge accounting, and final settlement remain later work.

Solidity now includes `QuoteMath` for exact conversion and interval rounding and
`LmsrCost` for bounded, enumerated cost evaluation using pinned PRBMath 4.1.0.
The cost error allowance is derived for 2/4/8 states and a declared parameter
range, with exact-rational source-constant checks and independent Decimal fixtures.
This is a small-state validation engine, not the final factored engine.
See [the numerics specification](docs/NUMERICS.md) and
[cost error derivation](docs/COST_ERROR_BOUND.md) for guarantees and remaining gates.

`LmsrQuote` now converts atomic-unit market snapshots into validated, fee-free
buy/sell quotes and fresh liability arrays. It checks claim masks, quantities,
before/after numerical domains and inclusive slippage limits. It rejects zero
payouts and numerically unquotable sizes. See [the quoting specification](docs/QUOTING.md).
`ReferencePool` now joins these quotes to fixed initial funding, per-owner claim
holdings, and exact ERC-20 buy/sell transfers. Base and composed claims share one
liability ledger, with execution-time pricing, slippage/deadline checks and actual
collateral coverage checks. Local tests cover normal and adversarial collateral.
The pool now supports one-time resolution after closing by an immutable resolver,
committed settlement rules, and partial redemption with exact winning payouts.
Losing claims burn for zero; coverage protects all remaining winners.
**Local tests only: the resolver is trusted and CRE is not integrated. Do not fund
this reference pool with real assets.** See [pool behavior](docs/REFERENCE_POOL.md)
and [settlement rules and limits](docs/SETTLEMENT.md).

[Base-event ERC-20 receipts](docs/BASE_EVENT_TOKENS.md) now wrap existing YES/NO
holdings without changing shared-pool liabilities or quotes. Holders can transfer,
unwrap, sell before close or redeem after resolution. Local tests cover backing
and payouts. A [Kuru fork rehearsal](docs/KURU_FORK_REHEARSAL.md) now passes pair
deployment, order cancellation and withdrawal using deployed Kuru/AUSD code in a
local fork. Public pairs, fills and arbitrage anchoring remain pending.

`ReferenceLmsr` uses whole collateral units and floating-point math. Its bounded
input domain is documented in the API. It enforces nonnegative simulated state
liabilities, but does not check ownership, token balances, or funded solvency.
Production settlement will use exact integer amounts and conservative fixed-point
quotes. A conditional probability is not yet a tradable conditional contract.

Event `i` is bit `i` of the terminal-state index. Bit `x` of a claim mask is
its payout in terminal state `x`. For two events, A is `0b1010`, B is `0b1100`,
and A AND B is `0b1000`. Equivalent expressions produce the same mask.
Constant claims are allowed during algebra but rejected by `validate_tradable`.
Masks describe payoffs only: future ledger keys must also identify the cluster
and its event definitions, collateral, resolver, and settlement rules.

Run from the repository root:

```sh
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

Regenerate the independent numerical fixtures with Python 3.11 or newer:

```sh
python scripts/reference_quotes.py
```

## Build phases

Each phase consists of small, reviewable tasks. Finish the task and its checks,
then give the user explicit `git add`, `git commit`, and `git push` commands.
**Agents must not stage, commit, or push unless the user explicitly changes this
instruction.** Avoid `git add .`; keep unrelated user files out of each change.

1. **Payoff foundation:** workspace, masks, Boolean operations, partition
   validation, and exhaustive conservation tests.
2. **Reference pricing and accounting:** stable exact-state LMSR, owned inventory,
   liability tracking, and independent numerical fixtures. Separate commits for
   pricing and accounting; floating-point results are reference calculations only.
3. **Week-one integration checks:** Alchemy/Monad connectivity, verified AUSD
   collateral configuration, Expo/React Native with Mera feasibility, and Kuru
   pair deployment plus order placement/cancellation. See the partner checklist.
4. **On-chain mechanism:** integer ledger, fixed-point pricing, factored state,
   supported trade language and structure-preserving updates. Differential-test
   against enumeration. Specify conditional payouts and false-condition behavior
   before implementing conditional trades. Gate: coherent executable quotes and
   collateral coverage; reject unsupported claims rather than silently approximate.
5. **Two-tier market:** backed base-event ERC-20 tokens on Kuru, funded books,
   and an executable-price arbitrage keeper. Gate: real orders, fills, and
   measured alignment after fees, depth, inventory requirements, and gas.
6. **Settlement and product:** CRE orchestration, Envio history/positions/coverage,
   Expo leg builder, Mera sessions and recovery, AUSD balances and redemption,
   plus the separate MetaMask Agent Wallet plugin. Verify each partner flow.
7. **Evidence:** gas/scaling limits, maker loss and collateral accounting,
   matched-claim quote comparisons, independent usage, and submission artifacts.
   Kimi structure proposals remain stretch scope as specified in the idea.

The [CRE receiver boundary](docs/CRE_RECEIVER.md) is now locally tested with fixed
forwarder/workflow authentication, report domain and freshness checks, and one-time
settlement. A [synthetic CRE workflow](workflows/cre/README.md) now validates fixture
observations and prepares unsigned settlement payloads in the actual CRE CLI.
Official source rules, API retrieval and verified network delivery remain pending.
Kuru anchoring, factored inference and tradable conditionals remain required
product milestones.
