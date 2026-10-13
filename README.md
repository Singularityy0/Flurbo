# Flurbo

Flurbo brings individual and combined predictions into one shared market,
letting users see how the market prices relationships between events.
The current consumer demo uses practice markets on Monad testnet and test AUSD.
What-if is read-only; tradable conditional positions remain research.

## Monad Metropolis hackathon

Live site: https://flurbo.singu.online. Monad testnet and test AUSD only; Monad mainnet is read only, for Chainlink price feeds. Proof rows marked pending are filled in from real runs; nothing pending is claimed.

**Kuru: new assets and markets, and consumer trading app.**
Event-outcome receipts for correlated crypto questions trade on a Kuru order book, with a documented issuance, backing, settlement and redemption path.
Code: [`DeployPilotKuru.s.sol`](contracts/script/DeployPilotKuru.s.sol), [`kuru-collection.mjs`](apps/web/server/kuru-collection.mjs), [`CollectionKuru.tsx`](apps/web/src/pages/CollectionKuru.tsx); write-up: [KURU_SUBMISSION.md](docs/KURU_SUBMISSION.md).
Proof: live ETH Yes book `0xe92649cdD20425239695221191515E1E51631d2A` on Crypto weekend; lifecycle transactions for the new pools are pending.

**Chainlink CRE.**
A CRE workflow reads the Chainlink feeds on Monad mainnet at a pool's committed observation block, applies its thresholds exactly, and reports whether it agrees with the pool's on-chain result.
Code: [`price-feed.ts`](workflows/cre/src/price-feed.ts), [`price-feed-main.ts`](workflows/cre/src/price-feed-main.ts); write-up: [CHAINLINK_CRE_INTEGRATION.md](docs/CHAINLINK_CRE_INTEGRATION.md).
Proof: `cre workflow simulate` output for the settled Crypto weekend pool, yes mask 8 and matching on-chain, in [crypto-weekend-simulation.txt](docs/cre-evidence/crypto-weekend-simulation.txt); simulated, not deployed.

**MetaMask Agent Wallet plugin.**
Five `mm flurbo` commands (markets, quote, holdings, trade, redeem); every transaction goes through the Agent Wallet and the plugin holds no key.
Code: [`packages/metamask-agent-plugin`](packages/metamask-agent-plugin), skill: [`SKILL.md`](skills/flurbo-trading/SKILL.md).
Proof: unit-tested against the real SDK's request shape; a live `mm flurbo trade` transaction hash is pending.

**Envio.**
A HyperIndex indexer for pool trades, redemptions, receipt wrapping, Kuru fills and resolution, consumed by What If, Portfolio and the Kuru page.
Code: [`packages/envio-indexer`](packages/envio-indexer) (config, schema, handlers); write-up: [ENVIO_INTEGRATION.md](docs/ENVIO_INTEGRATION.md).
Proof: the deployed Envio Cloud endpoint, queried through the site's `/envio` route.

**Alchemy.**
Alchemy's Monad testnet RPC serves site reads, the settlement bot and the chain readers.
Code: [`network.mjs`](apps/web/server/network.mjs); write-up: [ALCHEMY_INTEGRATION.md](docs/ALCHEMY_INTEGRATION.md).
Proof: dashboard request counts are pending the switch.

**Kimi.**
Kimi supplies a labelled joint-probability hypothesis on Thesis and What If, and can drive the paper-trading agent through the OpenAI-compatible provider.
Code: [`kimi-forecaster.mjs`](apps/web/server/kimi-forecaster.mjs), [`kimi-agent.json`](packages/sdk/examples/kimi-agent.json); write-up: [KIMI_INTEGRATION.md](docs/KIMI_INTEGRATION.md).
Proof: a real Kimi response and the article are pending an API key.

**Limitations.** Testnet only; the test AUSD has no value. Settlement uses an operator-run bonded resolver with a single-operator reviewer panel, not independent reviewers. The Chainlink CRE workflow observes and compares; it does not settle. Kuru liquidity is seeded by the operator, and Kuru markets cannot be paused by Flurbo, so the operator cancels its orders at close. Activity totals include team testing. Kimi output is a hypothesis, never a result. No real-money launch is planned without professional legal review.

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

The [iOS and Android app](apps/native/README.md) is a native shell around the
website, so sign-in, markets, portfolio and trading follow the site. The earlier
Expo project in `apps/mobile` is retired.

## Current phase

The [consumer website](apps/web/README.md) now implements the approved editorial
landing design with interactive event cards and Mera passkey signup/sign-in.
Run `cd apps/web`, `npm ci`, then `npm run dev` to open it at
http://localhost:18767. Local passkeys are separate test identities. The existing
local trading and learning dashboards keep their separate ports and functionality.
The user verified Mera signup and login. The [consumer workspace](docs/CONSUMER_WORKSPACE.md)
retains a seven-day account login across refresh. The hosted testnet site is
available at [flurbo.singu.online](https://flurbo.singu.online). Mera is for signup and account access only. MetaMask is the only trading wallet
offered by the web and native apps; earlier holdings remain available for read-only lookup.
Hosted read-only checks do not replace real-wallet and settlement acceptance;
see [mock test results](docs/MOCK_TEST_RESULTS.md).

An offline [ParlayMarket learning comparison](docs/PARLAY_COMPARISON.md) now adds
an exact pairwise model, cross-entropy gradient updates and explicit virtual
shadow books. It compares synthetic learning and order flow with the existing
Flurbo reference and accepts normalized historical replay inputs. This is the
user-selected comparison-first phase: it does not change executable pool prices.
Published historical results have not been reproduced; the authors' dataset is
unavailable. No statistical loss guarantees are claimed. Run
`python scripts/parlay_report.py` for the reproducible report and trajectories.

The next [funded repricing reference](docs/FUNDED_REPRICING.md) connects learned
prices to simulated trades while preserving actual payouts and requiring explicit
external funding. It tests reserve coverage, update limits and round-trip
extraction. Run `cargo run --offline -p flurbo-core --example funded_reprice`.
The [integer funded pool](docs/FUNDED_FACTORED_POOL.md) now passes local contract
tests with authenticated updates, movement/rate/funding limits and unchanged
customer payouts. [Learner-to-contract proposals and an isolated execution
rehearsal](docs/LEARNING_EXECUTION.md) now pass with deterministic quantization,
on-chain simulation and exact funding reconciliation. Dashboard review/execution
controls are next; its persistent deployment still uses the existing pool.

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
trusted resolution and redemption in local tests. Its [base-event ERC-20
receipts](docs/FACTORED_BASE_TOKENS.md) now support backed wrapping, transfers and
unwrapping using factored scope/mask keys. Further gas optimization, public
deployment and porting partner adapters remain pending. The [Kuru fork
rehearsal](docs/KURU_FORK_REHEARSAL.md) now passes with both enumerated and factored
receipts, including a 32-event pool and subsequent shared-pool sale/redemption.
[Local fill tests](docs/KURU_FILL_ACCOUNTING.md) now verify both directions,
partial fills, fees, rounding remainders and redemption. An [atomic arbitrage
rehearsal](docs/ARBITRAGE_REHEARSAL.md) now passes both directions with conservative
bounds and complete rollback. A [read-only scanner](docs/ARBITRAGE_SCANNER.md) now
implements candidate selection, gas conversion and full-route simulation checks.
Its [persistent local deployment](docs/DEMO_DEPLOYMENT.md) now passes manifest
verification and HTTP scanning. Public deployment and live anchoring remain
pending. The [manual dashboard data layer](docs/DASHBOARD_DATA.md) now serves
live state, executable pool quotes, requested wallet positions and transaction
status. The [local dashboard screen](docs/DASHBOARD_SCREEN.md) now runs at
`http://127.0.0.1:18765/` with a Boolean claim composer, pool quotes, wallet
inspection and transaction checks. [Local wallet trading](docs/DASHBOARD_TRADING.md)
now adds bounded approvals, buy/sell, slippage/deadline checks and event-confirmed
tracking. The user verified Firefox/MetaMask single-event and multi-leg buy/sell.
[Settlement and redemption](docs/DASHBOARD_REDEMPTION.md) now show final payouts
and support wallet-signed winning/losing claim redemption, with partial and zero
payouts verified on a disposable clone. Manual redemption popup testing remains.
[H YES wrap/unwrap controls](docs/DASHBOARD_RECEIPTS.md) now convert between
internal holdings and the canonical receipt for the Kuru pair. Exact conversion
accounting passes on a disposable clone; Kuru margin/order controls are next.
An opt-in **Set up local wallet** button now requests the local network, verifies
the exact fork and tops up missing test AUSD/MON. Wallet prompts still need approval.
The [gas optimizations](docs/FACTORED_GAS.md) reduce measured large-graph quote
costs by 35–38% cumulatively with unchanged outputs. The latest changes also cut
the measured pool buy/sell costs by about 9%; deployment gas limits remain a gate.

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

The [local learning dashboard](docs/LEARNING_DASHBOARD.md) adds wallet review and
confirmation of synthetic funded model updates at `http://127.0.0.1:18766/`.
It runs separately from the AUSD/Monad demo. The [CRE v2 boundary](docs/CRE_RECEIVER.md#factored-pools-report-version-2)
now settles factored/funded pools in local synthetic tests.
