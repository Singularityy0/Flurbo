# Perpl analytics: demo and remaining data requirements

## Implemented in Flurbo

Open `/perpl`. The full-width dark analytics panel switches between My portfolio and Protocol.

- Authenticated live positions, resting orders and session fills. Review close prepares the existing ticket; it never submits automatically.
- Account balances and locked balances, plus position collateral and estimated unrealized PnL. Missing locked balances are labelled, not assumed zero.
- Signed REST reads for historical fills, position exits and account events. Cursor pagination is bounded to ten pages per batch; Load more continues. Repeated events are deduplicated. Statistics disclose incomplete history.
- Exit-event realized performance including reported funding and entry/closing fees: win rate, profit factor, streaks, average hold time and best/worst market.
- Equity and PnL curves for 24h, 7d, 30d and all available time. Sampled equity drawdown is explicitly affected by deposits/withdrawals.
- Save wallet summaries locally, search saved addresses and compare up to three snapshots. Secrets are never stored with summaries. These are not arbitrary-wallet live profiles.
- Public 24h volume, market TVL and asset-denominated open interest; current funding rate and interval when supplied by context.
- Market price charts and protocol volume across listed markets for 1/7/30 complete UTC days. Public context refreshes every 30 seconds; historical volume every minute.

## Requirements still needing another data source

Enrollment whitelisting does not grant arbitrary-wallet or protocol-wide history access. The documented trading REST endpoints authenticate the API key owner. Do not advertise saved-wallet search as global address search.

The complete bounty needs an additional analytics provider or a validated on-chain indexer for arbitrary-wallet profiles, protocol deposit/withdrawal flows, all-time volume, fees/revenue, distinct active wallets, historical liquidation totals and long/short skew. Exact liquidation prices also need a verified risk calculation or provider field; Flurbo does not invent a price from leverage alone.

Request to send to Perpl's team:

> Our Flurbo origin is now whitelisted for key enrollment on Monad testnet 10143. We are building the protocol + wallet analytics dashboard bounty. Can you provide a public/read-only indexer API or event schemas and deployment blocks for historical backfill? We need arbitrary address account/position/trade history; protocol volume, fees, active wallets and deposit/withdrawal/liquidation events; long/short open interest; and the canonical liquidation-price calculation. Which endpoints support these independently of the key owner's private trading API?

Building our own indexer requires deployment start blocks, verified ABI/event semantics, resumable backfill, reorg handling, event deduplication, indexed wallet-account ownership, and reconciliation against Perpl's own account statistics. A newly launched scanner with only recent data cannot claim complete historical coverage.

Official references:

- https://github.com/PerplFoundation/api-docs/blob/main/authentication.md
- https://github.com/PerplFoundation/api-docs/blob/main/rest-endpoints.md
- https://github.com/PerplFoundation/api-docs/blob/main/types.md

## Two-minute demo sequence

1. Open Protocol: show source/update times, market volume/TVL/open interest/funding and timeframe switching.
2. Connect your own enrolled Perpl key. Show real positions, resting orders, collateral and balances.
3. Show historical fills and exit performance, then equity/PnL and drawdown.
4. Save the wallet summary and compare saved snapshots, explaining their timestamp and coverage.
5. Prepare Review close to demonstrate handoff without placing an unintended trade.

Record with a funded testnet account that has real history. Browser fixtures validate behavior but are not evidence of live Perpl fills or a live authenticated account. The current feature set is a substantial integration, not yet every requested bounty feature.

## Verification

Production build/typecheck passed. Full default web test suite: 492 passed, 49 skipped, zero failures. Dedicated production-bundle Perpl browser check passed on desktop and 390px mobile, covering signed history, charts, saved comparison, close-ticket preparation and no automatic order submission. Live signed REST reads with a real user's key still require a manual session check; credentials are not available to automated tests.
