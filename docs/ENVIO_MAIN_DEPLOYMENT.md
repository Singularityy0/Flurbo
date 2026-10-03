# Envio on the Flurbo main deployment

Status: prepared in the `main` worktree, not committed or deployed by Codex.
The Envio Cloud **development** deployment at
`https://indexer.dev.hyperindex.xyz/84870f9/v1/graphql` was active and synced
when last checked. The owner reported adding that URL to Render. Confirm the
current Envio dashboard endpoint before each deployment or promotion.

## What Envio does for Flurbo

Envio HyperIndex follows the listed Monad testnet pools and resolvers and
turns their logs into queryable trade, redemption, position cash-flow, and
resolution-event records. The web app uses its recent `Trade` rows to display
historical pool activity in **What if?**. This avoids replaying the pool's
complete event history in every browser session.

The indexer is eventually consistent. Its `TraderPosition` row records costs,
proceeds, redemptions, and net cash flow in the indexed window; it is not a
current wallet balance, current position, or complete realized P&L. Fresh RPC
reads from the pool remain authoritative for quotes, holdings, close status,
settlement, and redemption. Envio never chooses an outcome or executes a trade.

## Components and configuration

- `packages/envio-indexer/` is the indexer source. Envio Cloud currently
  deploys the `metropolis` branch from that directory. The same package is
  included on `main` to keep the web release reviewable and reproducible.
- `apps/web/server/envio-proxy.mjs` accepts only bounded, server-owned
  `trades` and `position` queries and forwards them to the configured public
  Envio GraphQL endpoint. It never accepts arbitrary GraphQL or forwards an
  admin credential.
- `apps/web/src/components/EnvioActivity.tsx` shows five recent indexed trades
  for the selected pool, plus loading, empty, and unavailable states. It is
  mounted in the What-if panel. The Vite development server exposes the same
  `/envio` path for local testing.

Set this variable in **Render > flurbo-testnet > Environment**:

```text
FLURBO_ENVIO_GRAPHQL_URL=https://indexer.dev.hyperindex.xyz/84870f9/v1/graphql
```

This URL is a public read endpoint, not an API token. Do not set
`ENVIO_API_TOKEN` or a local Hasura admin secret on the Render web service.
The token is for running the indexer locally. After publishing the web code on
`main`, Render must finish a new deployment before `/envio` exists.

## Smoke test after Render deploys main

From Git Bash, request a known pool with an indexed trade:

```bash
curl -sS -i 'https://flurbo.singu.online/envio' \
  -H 'Content-Type: application/json' \
  --data '{"kind":"trades","pool":"0xd8ed3137446d99372f82573e716b3340d3dba7b3","limit":5}'
```

Expected: HTTP 200, a JSON `data.Trade` array, and at least one row for this
previously verified pool. HTTP 503 means the Render URL is missing or invalid;
HTTP 502 means the Envio endpoint failed or timed out. A 200 response with an
empty array can be valid for a newly deployed or not-yet-indexed pool, so use
the known pool above for the first test.

Then sign into the live Flurbo site, open a market's **What if?** panel, and
expand **Recent pool activity · Envio**. It should show historical rows for a
pool with indexed activity. The UI explicitly treats these rows as historical,
not live pricing information.

## When a new market is deployed

Add its pool and resolver to `config/collections.json`, regenerate
`packages/envio-indexer/config.yaml` with `npm run config` in the indexer
directory, and publish an Envio Cloud deployment from its configured release
branch. Verify that the hosted indexer has synced the new addresses before
using its history in the app. Envio Cloud's release branch is currently
`metropolis`; a web deploy from `main` does not itself redeploy the indexer.
