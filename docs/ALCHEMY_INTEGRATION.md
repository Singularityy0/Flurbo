# Alchemy Monad Testnet Integration

> Status on 3 October 2026: the local RPC setting still points to the public Monad endpoint, not Alchemy. A working Alchemy API endpoint has not been found in the checked local files. The webhook handler has signed payload tests, but no live Monad webhook delivery has been verified. Confirm webhook network support in the Alchemy dashboard. See `METROPOLIS_DEPLOYMENT_ENV.md`.

Technical reference for Flurbo's Alchemy RPC and webhook infrastructure on Monad testnet (chain 10143).

## 1. Overview

Flurbo integrates Alchemy to provide high-throughput RPC routing and real-time webhook event streaming on Monad testnet. Alchemy powers:
- Read-only and transactional RPC routing across the web application, settlement worker, agent runtime, and starter funds.
- Alchemy Notify address activity webhooks for instant detection of pool trading activity and resolver dispute submissions.
- Reactive event telemetry feeding Thesis Explorer and What-If analysis.

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

## 4. Integration with Thesis and What-If

The combinatorial pricing model relies on up-to-date on-chain state to compute accurate implied joint distributions:
- **Thesis Explorer**: Displays the active Alchemy Monad stream indicator alongside Chainlink CRE and Envio HyperIndex provenance.
- **What-If Hypothesis Engine**: Ingests fresh block state streamed through Alchemy to evaluate price sensitivity scenarios and Fréchet probability bounds.

## 5. Verification and Testing

The webhook processor and signature verification suite is verified with:

```bash
cd apps/web && node --test tests/alchemy-webhook.test.ts
```

All tests execute offline with mock cryptographic fixtures, verifying:
- Accurate HMAC-SHA256 verification and refusal of tampered payloads.
- Correct parsing of Monad testnet address activity events.
- Ring buffer state persistence and telemetry output.
