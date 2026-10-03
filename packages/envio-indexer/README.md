# Flurbo Envio HyperIndex

This indexer follows active Monad testnet pools and resolvers from `config/collections.json`. Run `npm run config` after registry changes. It indexes the real `Traded`, `Redeemed`, `Asserted`, `Disputed`, `Finalized`, and `Delivered` events emitted by the contracts. It stores trade volume and each trader's cash movement in the indexed window. It does not claim a current collateral balance, realized profit, or current holdings from events alone.

Local development requires Linux Node 22 or newer, Docker, and an `ENVIO_API_TOKEN` from Envio. On Windows, use WSL2 with Docker Desktop integration. Run `npm ci`, `npm run config`, `npm run codegen`, `npm run typecheck`, then `npm run dev`. The web deployment and smoke-test steps are in [`docs/ENVIO_MAIN_DEPLOYMENT.md`](../../docs/ENVIO_MAIN_DEPLOYMENT.md).
