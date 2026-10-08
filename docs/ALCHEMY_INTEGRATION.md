# Alchemy Monad Testnet Integration

> Status on 8 October 2026: the code already accepts an Alchemy Monad testnet endpoint, but the hosted site does not use one yet. Render's `FLURBO_ALCHEMY_TESTNET_RPC_URL` currently holds a QuickNode URL (the variable name is historical), so Alchemy is **not** serving the site's reads today. The webhook handler has signed payload tests, but no live Monad webhook delivery has been verified; confirm webhook network support in the Alchemy dashboard. Do not describe Alchemy as in use until the switch below is done and its dashboard shows requests. See `METROPOLIS_DEPLOYMENT_ENV.md`.

Technical reference for Flurbo's Alchemy RPC and webhook infrastructure on Monad testnet (chain 10143).

## 1. Overview

Flurbo reads Monad testnet through one configurable RPC endpoint. Once `FLURBO_ALCHEMY_TESTNET_RPC_URL` is an Alchemy endpoint (`https://monad-testnet.g.alchemy.com/v2/<key>`), Alchemy serves:
- the web application's chain reads, the settlement bot's pool reads and the Python chain readers (`readerProvider()` and `hostedConfig()` in `apps/web/server/network.mjs` already accept the Alchemy host, and `scripts/check_monad_readiness.py` accepts `--provider alchemy`);
- optionally, if the dashboard offers Monad testnet address-activity webhooks, signed notifications to `POST /api/alchemy/webhook`, readable at `GET /api/alchemy/activity`. This is not claimed unless a delivery is verified.

## 2. Environment Configuration

| Variable | Scope | Purpose |
|---|---|---|
| `FLURBO_ALCHEMY_TESTNET_RPC_URL` | Process environment / Render secret | Primary HTTPS endpoint for Monad testnet RPC |
| `FLURBO_ALCHEMY_WEBHOOK_SIGNING_KEY` | Process environment / Render secret | HMAC-SHA256 signing secret for authenticating Alchemy webhooks |

Secrets are configured exclusively via hidden environment variables or hosting secrets. They are never committed to version control, logged, or exposed in client responses.

## 3. Webhook Architecture

Alchemy Notify is configured with an Address Activity webhook targeting Flurbo's endpoint:

```
POST /api/alchemy/webhook
```

### 3.1. Authentication

Every request is verified using the `x-alchemy-signature` header:
1. The server reads the raw request payload buffer.
2. An HMAC-SHA256 digest is calculated using the configured `FLURBO_ALCHEMY_WEBHOOK_SIGNING_KEY`.
3. The calculated digest is compared against the header using `crypto.timingSafeEqual` to prevent timing attacks.
4. Requests with invalid or missing signatures are rejected with HTTP 401.

### 3.2. Payload Processing

Incoming address activity events are parsed by `apps/web/server/alchemy-webhook.mjs`:
- Token movements on test AUSD (`0xa9012a055bd4e0edff8ce09f960291c09d5322dc`) are identified as pool activity.
- Transactions interacting with `PilotPool` and `PilotResolver` contracts are categorized and recorded in an in-memory activity ring buffer.
- Recent activities are made available via `GET /api/alchemy/activity` for application telemetry.

## 4. Switching the hosted site to Alchemy (owner steps)

1. In the Alchemy dashboard create an app on the Monad Testnet network and copy the HTTP endpoint.
2. Check it: `eth_chainId` must return `0x279f` (see `METROPOLIS_LOCAL_RUNBOOK.md`, section 1).
3. Save the current QuickNode URL in your secret store for rollback, then set `FLURBO_ALCHEMY_TESTNET_RPC_URL` on the Render service `flurbo-testnet` to the Alchemy URL and let it redeploy.
4. Verify: `/healthz` shows `settlement_bot.monitor: ok` and its `cycles` keep increasing for ten minutes; Render logs contain no `Unsupported public testnet RPC`; the Alchemy dashboard shows request volume.
5. Roll back to the QuickNode URL immediately if the bot turns unhealthy.

Submission text, once step 4 has passed: "Alchemy's Monad testnet RPC serves every site read, the settlement bot's pool reads and the Python chain readers." Include a dashboard screenshot of request counts. Nothing in the app displays an Alchemy indicator; Thesis and What If read the chain through the same endpoint like every other page.

## 5. Verification and Testing

The webhook processor and signature verification suite is verified with:

```bash
cd apps/web && node --test tests/alchemy-webhook.test.ts
```

All tests execute offline with mock cryptographic fixtures, verifying:
- Accurate HMAC-SHA256 verification and refusal of tampered payloads.
- Correct parsing of Monad testnet address activity events.
- Ring buffer state persistence and telemetry output.
