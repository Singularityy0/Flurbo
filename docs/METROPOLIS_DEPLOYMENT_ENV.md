# Metropolis deployment credentials and endpoints

Verified on 3 October 2026. This inventory describes the current checkout and the existing `flurbo-testnet` Render blueprint. It contains no credential values.

## Render web service

| Variable | Needed for | Current finding | Obtain or set |
| --- | --- | --- | --- |
| `FLURBO_ORIGIN` | Canonical web origin | In `render.yaml` as `https://flurbo.singu.online` | Keep the existing value. |
| `FLURBO_NETWORK` | Monad testnet mode | In `render.yaml` as `public_testnet` | Keep the existing value. |
| `UPSTASH_REDIS_REST_URL` | Sessions and durable app state | Declared as a Render secret. The public site responds, but the dashboard value was not inspected. | Existing Render service Environment page or the Upstash Redis database REST API page. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash authentication | Declared as a Render secret. The dashboard value was not inspected. | Same Upstash database REST API page. |
| `FLURBO_COLLECTIONS_SOURCE` | Load the active collection registry | Local value is `registry`; absent from `render.yaml`. | Set `registry` in Render for the Metropolis registry release. |
| `FLURBO_ALCHEMY_TESTNET_RPC_URL` | Alchemy Monad testnet reads and partner integration | **Missing.** The local value is `https://testnet-rpc.monad.xyz`, a public Monad RPC. No working Alchemy endpoint was found in the checked local files. | Alchemy Dashboard > Apps > the Monad Testnet app > Endpoints > HTTP. The URL has the form `https://monad-testnet.g.alchemy.com/v2/<API_KEY>`. Confirm `eth_chainId` returns `0x279f`. |
| `FLURBO_ENVIO_GRAPHQL_URL` | Read indexed trades and positions through Render's `/envio` proxy | Envio Cloud development deployment `c74c28d` is active and synced. Its public endpoint is `https://indexer.dev.hyperindex.xyz/84870f9/v1/graphql`; the owner reports adding it to Render. The web proxy and UI code remain uncommitted, so the currently deployed site cannot use it yet. | Verify the existing Render service Environment value, then publish the web code in an owner-controlled commit before deploying. |
| `FLURBO_ALCHEMY_WEBHOOK_SIGNING_KEY` | Optional signed Alchemy webhook | Local value exists but no live webhook or delivery was verified. | Only set the signing key from the matching Alchemy Monad testnet webhook if the dashboard supports that webhook. Its callback would be `https://flurbo.singu.online/api/alchemy/webhook`. |
| `MOONSHOT_API_KEY` | Optional Kimi hypotheses | Local key exists but its API balance was zero in the last live check. | Kimi API Platform; do not copy a zero-balance key to Render expecting forecasts to work. |
| `MOONSHOT_API_BASE` | Kimi API host | Local value is `https://api.moonshot.ai/v1`. | Use with a key issued for the international API. |
| `MOONSHOT_MODEL` | Kimi model | Local value is `kimi-k2.6`. | Keep the account-supported model. |

`FLURBO_APPLICATIONS_SUPABASE_URL`, `FLURBO_APPLICATIONS_SUPABASE_SECRET`, `FLURBO_APPLICATIONS_RESEND_KEY`, `FLURBO_APPLICATIONS_CODE_SECRET`, and `FLURBO_APPLICATIONS_EMAIL_FROM` are needed only if `FLURBO_APPLICATIONS_ENABLED=true`. `FLURBO_SUPABASE_KV=true` also needs its Supabase configuration. These are separate application features, not partner integration prerequisites. Existing Render environment values could not be read from this checkout.

## Credentials that do not go on the Render web service

- `ENVIO_API_TOKEN` is present in the ignored `packages/envio-indexer/.env` and worked for local HyperIndex sync. Envio Cloud manages HyperSync access for its hosted indexers. The Render web service needs the hosted GraphQL URL, not this token or the local `testing` Hasura admin secret.
- CRE uses a Chainlink account and CLI login. The current CLI credential validation fails with HTTP 500 before simulation. There is no CRE API key to paste into the Render web service for the current read-only workflow.
- The current Perpl mobile integration reads public context and opens Perpl for orders. It needs no Render API key. In-app authenticated trading would require a separately enrolled Perpl Ed25519 API key and verified exchange account flow; that is not implemented.
- The MetaMask Agent Wallet read-only quote plugin needs no Render API key. Wallet initialization and transaction permission remain outside Render.

## Deployment order

1. Obtain and test an Alchemy Monad testnet HTTP endpoint. Set `FLURBO_ALCHEMY_TESTNET_RPC_URL` on Render only after it returns chain ID `0x279f`.
2. Envio Cloud indexing is active and synced. The owner reports setting its HTTPS GraphQL URL on Render. Publish the web `/envio` proxy and consumer code in an owner-controlled commit before deploying the web service.
3. Check the existing Upstash values in Render and set `FLURBO_COLLECTIONS_SOURCE=registry`.
4. Add the optional webhook signing key only after a real supported webhook is created. Keep Kimi as currently configured until its API balance and model are verified.
5. After the owner approves deployment, verify `GET /healthz`, live market reads, and a `/envio` trade query on the hosted site. A successful build alone does not prove the partner services are active.

Render's Environment page accepts these keys individually or from a local `.env` file. On an existing Blueprint, adding `sync: false` to `render.yaml` does not prompt for new values; add them directly to the existing service's Environment page.
