# @flurbo/sdk (0.1.0-beta.0, private)

Typed TypeScript toolkit for Flurbo agents on Monad testnet (chain 10143, test assets only). Not published to npm.

## What it does

- Reads the market directory, a pool's markets and one-share prices, pair analytics and canonical claim analytics.
- Requests executable quotes for exact claims and quantities, read from the pool contract at one snapshot block.
- Builds and validates structured joint forecasts (normalized distributions in parts per million).
- Runs the reference strategy `joint-edge` v1: compare a joint forecast with finite-size quotes and propose at most one purchase, or abstain with reasons.
- Records and evaluates paper trades with an explicit fill model.
- Manages agent profiles and records through the authenticated Flurbo API.

## What it does not do

- It never signs, submits or retries a transaction. Live purchases are prepared as unsigned reviews and confirmed by the user in MetaMask in the web app.
- It does not compute prices. Quotes are the pool's own `quoteBuy` and `quoteSell`.
- It does not encode combinations itself. Claims use the canonical Flurbo model (`flurbo.claim.v1`, `apps/web/shared/claims.mjs`).
- It does not make trades private, promise profit, or settle markets.

## Setup

Node 24 or later runs the TypeScript source directly (type stripping). No dependencies are needed for the core.

```bash
node packages/sdk/examples/offline-research.ts   # offline, no credentials, fixture data only
cd packages/sdk && node --test test/*.test.ts     # unit tests
node ../../apps/web/node_modules/typescript/bin/tsc -p tsconfig.json   # typecheck (core only)
```

The core compiles against ES2022 only, so it cannot reach `window`, `localStorage` or React. Transport, authentication and storage are injected.

## Transports

- `fixtureTransport()`: offline, deterministic. Every label says "Fixture" or "not live"; the client reports `mode: 'fixture'`. Fixture quotes are hand-written numbers, not a pricing model.
- `browserTransport()` (`@flurbo/sdk/browser`): same-origin requests that reuse the signed-in Flurbo session cookie. The SDK never reads or stores credentials.
- Node access to live account data is not provided. Do not export browser cookies. A future headless credential would need to be scoped, revocable and read-only, and would never imply signing authority.

## Numbers

- Token and share amounts are `bigint` atoms internally (10^6 atoms = one share or one test AUSD) and decimal strings at JSON boundaries. Floating point is never used for amounts or limits.
- Forecast probabilities are integer parts per million that sum exactly to 1,000,000. Pair inputs must satisfy the Fréchet bounds `max(0, P(A)+P(B)-1) <= P(A and B) <= min(P(A), P(B))`; contradictory input is rejected.
- Model-implied probabilities (analytics) and finite-size average prices (quote divided by quantity) are different quantities and are reported separately.

## Errors, timeouts and retries

All failures are `FlurboError` with a `code` (for example `unauthenticated`, `invite_required`, `unsupported_claim`, `cross_pool`, `stale_quote`, `rate_limited`, `timeout`, `aborted`). Reads retry at most twice on outages and rate limits, honouring `Retry-After`. Mutations are never retried. Every call accepts an `AbortSignal`.

## Reference strategy: joint-edge v1

For each claim covered by the forecast (single answers, each "all of these" pair combination, "at least one" and "exactly one" of each pair), the expected payout under the forecast is compared with the worst-case cost `ceil(quote x (10000 + slippage) / 10000)`. It proposes the largest edge that clears the minimum edge (relative and absolute) and the budget. It abstains when trading is closed, evidence is insufficient, quotes are unavailable or expired, the budget is exceeded or no edge clears the threshold. Expected value assumes no VOID outcome and excludes gas; both assumptions are listed in every decision. Edge is a model estimate, not a promised profit.

## Paper trading

Fill model `quote-at-snapshot-no-impact-v1`: a paper fill costs the pool quote for that quantity at the decision's snapshot; hypothetical positions do not move live prices; a claim cannot be filled again unless a quote comes from a strictly newer block, and each decision fills once. Paper results are realized only after the pool resolves (VOID pays fractionally, as the contracts do). Unknown values are reported as unknown, never zero.
