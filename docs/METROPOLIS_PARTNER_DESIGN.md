# Metropolis partner integration design

Scope: Monad testnet, test assets only. This document covers the six tracks approved for both `metropolis` and `main`: Agora and Perpl, Chainlink CRE, Envio, MetaMask Agent Wallet, Alchemy, and Kimi. Other hackathon experiments stay on `metropolis`. The existing bonded settlement and factored LMSR pool remain authoritative.

## Trust boundaries

1. The pool and resolver contracts define prices, holdings, deadlines, and final outcomes. A partner service cannot change them.
2. Chainlink CRE can prepare official-source evidence. A CRE simulation or an AI response does not finalize a market. Production delivery requires authenticated workflow identity, contract receiver verification, a real deployment, and owner approval.
3. Envio indexes contract logs for history and portfolio cash flow. It is eventually consistent and cannot replace a fresh RPC quote or determine a current outcome.
4. Alchemy supplies a Monad testnet RPC. Its optional webhook is active only after a signed delivery for `MONAD_TESTNET`. Its in-memory activity buffer is not a durable audit log.
5. Kimi offers an optional, clearly labelled hypothesis inside Thesis and What If. The browser never receives the API key. Invalid or unavailable model output fails closed. Kimi never selects settlement evidence.
6. Perpl market data comes from its public testnet context. Exchange accounts and trading are separate from Flurbo shares. Perpl order placement requires an enrolled API key, exchange account, and on-chain forwarding permission. The Flurbo mobile app must not submit invented order calldata.
7. MetaMask Agent Wallet may quote a deployed pool with read-only calls. A trading command requires its own reviewed transaction capability and live wallet testing. The helper's signing context is a boundary, not a CLI registration by itself.

## Delivery map

| Partner | Current code path | Verification gate |
| --- | --- | --- |
| Agora / Perpl | `apps/mobile/src/perpl.ts`, `PerplTrade.tsx` | Live public context, collateral token and exchange match, account opening simulation, user-controlled testnet transaction, authenticated order stream and fill status |
| Chainlink CRE | `workflows/cre` | Tests, typecheck, CLI simulation after login, official-source evidence, authenticated receiver delivery |
| Envio | `packages/envio-indexer` and `apps/web/src/envio.ts` | Generate config from registry, codegen, typecheck, local sync, compare logs and GraphQL rows by block and transaction |
| MetaMask Agent Wallet | `packages/metamask-agent-plugin` | Manifest build, local plugin install, read-only quote versus direct RPC, wallet capability test for any future write command |
| Alchemy | `apps/web/vite.config.mjs`, `server/alchemy-webhook.mjs` | RPC chain ID 10143, signed webhook rejection and acceptance, dashboard delivery status |
| Kimi | `server/kimi-forecaster.mjs`, Thesis, What If | Real API key, structured response, validation, Frechet bounds, no forecast on API failure |

## User journey

The market directory reads the registry and fresh Monad RPC. Thesis and What If read a single pool snapshot and display model-implied relationships. The Kimi button, when configured, provides a separate forecast for the selected pair and marks it as a model hypothesis. Envio may show recent indexed trades when its GraphQL endpoint is configured and returns data. The rules hash is shown without claiming an active CRE deployment. Mobile lists live Perpl markets and opens the official Perpl testnet app for orders. Local account opening uses the live collateral and minimum from Perpl context.

## Known gates

- No Perpl API order flow is enabled inside Flurbo. The previous `placeOrder` contract call was unsupported. Perpl API key enrollment may need an approved integration origin. Until authenticated WebSocket orders and fills are tested, route users to Perpl.
- The current CRE pilot prepares evidence but has not delivered a signed report to the live resolver. The existing on-chain resolver has its own bonded process.
- Envio config generation, Linux codegen, type checking, and local chain sync passed on 3 October 2026. GraphQL returned indexed pool and position data through the Vite proxy. One trade row matched its Monad RPC log. A hosted Envio deployment and Render endpoint remain unverified.
- MetaMask quote is a real read-only CLI plugin command. The library trade helper is not exposed as a CLI command or verified with an Agent Wallet. Do not advertise Agent Wallet execution yet.
- Alchemy Monad RPC is available. Check the Alchemy dashboard for Monad testnet webhook support before creating a webhook. A signed fixture test proves validation, not live delivery.
- Kimi requires an API key and may require account credits. The model hypothesis is never treated as an official source.

## Branch handoff

Keep the six partner paths, this design, and the local runbook in a dedicated `metropolis` commit. The owner can cherry-pick that commit to `main` from a separate worktree. Review the staged file list because the working tree already contains unrelated uncommitted files. No partner secret or `secrets/` directory belongs in either branch.
