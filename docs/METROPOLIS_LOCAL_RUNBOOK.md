# Metropolis local partner runbook

All commands below are for Monad testnet and test assets. Open a fresh PowerShell window in `C:\Users\anany\Flurbo`. Set credentials in that window only. Do not paste keys into chat, commit them, or put them in a `VITE_` variable. The registry already contains the deployed pool and resolver addresses.

## 1. Start the web app with real market reads

1. Get an Alchemy API key at https://dashboard.alchemy.com/. Open **Apps**, create an app with **Monad Testnet**, then use its **Endpoints** tab to confirm the HTTP endpoint. The expected URL prefix is `https://monad-testnet.g.alchemy.com/v2/`.
2. In PowerShell:

```powershell
cd C:\Users\anany\Flurbo\apps\web
npm ci
$env:FLURBO_COLLECTIONS_SOURCE = 'registry'
$alchemyKey = [System.Net.NetworkCredential]::new('', (Read-Host 'Alchemy API key' -AsSecureString)).Password
$env:FLURBO_ALCHEMY_TESTNET_RPC_URL = 'https://monad-testnet.g.alchemy.com/v2/' + $alchemyKey
Remove-Variable alchemyKey
$env:MOONSHOT_MODEL = 'kimi-k3'
$env:MOONSHOT_API_BASE = 'https://api.moonshot.ai/v1'
$env:MOONSHOT_API_KEY = [System.Net.NetworkCredential]::new('', (Read-Host 'Kimi API key' -AsSecureString)).Password
npm run dev
```

Open `http://localhost:18767/markets`. If port 18767 is in use, run `npm run dev -- --port 18769` and open `http://localhost:18769/markets`. The API key is optional for market reads: unset `FLURBO_ALCHEMY_TESTNET_RPC_URL` to use the public Monad RPC. Verify Alchemy's RPC without showing the key:

```powershell
$reply = Invoke-RestMethod -Uri $env:FLURBO_ALCHEMY_TESTNET_RPC_URL -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
if ($reply.result -ne '0x279f') { throw 'RPC is not Monad testnet' }
'Monad testnet RPC verified'
```

3. Get a Kimi key at https://platform.kimi.ai/ by opening the API Platform and creating an API key. Check the model available to your account. The international API uses `https://api.moonshot.ai/v1` and the current quickstart model `kimi-k3`. If your key is for the China platform, use `https://api.moonshot.cn/v1` and a model listed in that account instead. In Thesis or What If, select two questions, press the Kimi button, and check that a model hypothesis appears. With an unset or invalid key, the UI must show an error and no synthetic Kimi forecast.

## 2. Envio local indexer

Envio requires Linux Node 22 or newer and Docker. On Windows, use Ubuntu WSL2 with Docker Desktop WSL integration. On this machine, Linux Node 24.13.0 is installed at `~/.local/node-v24.13.0`. Config generation, codegen, type checking, and a local chain sync passed on 3 October 2026. Docker Desktop's Ubuntu integration is enabled.

1. Create a free Envio account at https://envio.dev/app/ and obtain a HyperSync API token at https://envio.dev/app/api-tokens. There is no fixed hosted GraphQL URL until you deploy an indexer. Local GraphQL is `http://127.0.0.1:8080/v1/graphql` after `envio dev` starts.
2. In Ubuntu WSL, after installing Linux Node 22 and enabling Docker integration:

```bash
cd /mnt/c/Users/anany/Flurbo/packages/envio-indexer
export PATH="$HOME/.local/node-v24.13.0/bin:$PATH"
node --version
docker info >/dev/null
npm ci
npm run config
npm run codegen
npm run typecheck
export ENVIO_API_TOKEN="$(sed -n 's/^ENVIO_API_TOKEN=//p' .env)"
test -n "$ENVIO_API_TOKEN" || { echo 'Missing Envio API token'; exit 1; }
npm run dev
```

`npm run config` reads active addresses from `config/collections.json`; rerun it whenever the registry changes. The local Envio console is `http://localhost:8080`. For GraphQL, use the local admin secret shown by Envio; this local run used `testing`. The local sync indexed all six pools: 37 trade or redemption rows, six pool summaries, and 27 resolution event rows at the verification point. An indexed trade at block 67596218, log index 142 matched the Monad RPC transaction log `0xc98febcc71d952ab5045b4466be1f899e1f0bcf128c56f370b9fb4f9f4e16d4d` in trader, scope, mask, quantity, and amount. `netCashflowAtoms` is cumulative cash movement in the indexed window, not mark-to-market profit.

3. In the PowerShell window used for the web app, set the proxy variables **before** starting Vite:

```powershell
$env:FLURBO_ENVIO_GRAPHQL_URL = 'http://127.0.0.1:8080/v1/graphql'
$env:FLURBO_ENVIO_GRAPHQL_ADMIN_SECRET = 'testing'
$env:VITE_ENVIO_GRAPHQL_URL = '/envio'
npm run dev
```

The Vite proxy keeps the Hasura admin secret out of browser JavaScript. Recent indexed trades appear in What If only after GraphQL returns rows. For Envio Cloud, copy the deployment's GraphQL endpoint from the Envio dashboard; do not use the old hardcoded `indexer.bigdevenergy.link` URL.

On 3 October 2026, a separate Vite instance on `http://127.0.0.1:18769` returned indexed `GetTrades` and `GetPosition` data through `/envio`. The local GraphQL URL and `testing` secret are only for development. The Envio process and Vite instance must remain running for the browser view to show indexed activity.

### Deploy Envio data with the Render web app

The local `127.0.0.1:8080` endpoint exists only on your computer. Deploy the indexer separately on Envio Cloud using the GitHub repository, root directory `packages/envio-indexer`, config file `config.yaml`, and the branch you publish. Wait for its historical sync. In the Envio Cloud deployment dashboard, copy the production GraphQL endpoint, including `/v1/graphql`. The hosted indexer's URL is assigned after deployment; it is not the local URL or your HyperSync API token.

In the Render dashboard, select the `flurbo-testnet` web service, open **Environment**, and add `FLURBO_ENVIO_GRAPHQL_URL` with that full HTTPS GraphQL URL. Save and deploy. The production server forwards the browser's read-only `/envio` requests to the hosted endpoint. `VITE_ENVIO_GRAPHQL_URL` is not needed for the Docker build, and the local `FLURBO_ENVIO_GRAPHQL_ADMIN_SECRET=testing` must not be copied to Render. Envio Cloud normally manages its own HyperSync access; `ENVIO_API_TOKEN` is for local or self-hosted indexing. Verify a query in the Envio dashboard first, then check What If on the deployed site. If Envio Cloud endpoint access restrictions are enabled, allow the Render service to query it.

## 3. MetaMask Agent Wallet

Install the `mm` CLI using the current instructions at https://docs.metamask.io/agent-wallet/ and complete wallet initialization yourself. The read-only Flurbo plugin does not need a private key in this repository.

```powershell
cd C:\Users\anany\Flurbo\packages\metamask-agent-plugin
npm ci
npm run build
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install file:C:\Users\anany\Flurbo\packages\metamask-agent-plugin --accept-permissions
mm flurbo quote --pool 0x160647d16405f44989c56b83609a171247068dcc --scope 1 --mask 2 --quantity 1000000 --side buy
```

The quote is a read-only contract call. This pool returned a 0.5005 test AUSD quote for one share on 3 October 2026. It can close later; if it reports `Closed`, choose an open pool and valid claim from `/markets`. The previous example pool `0xc4409edbfb9e9d47167b028de22f0b0d6b630077` is already closed. The plugin has no `mm flurbo trade` command yet; no Agent Wallet transaction was verified. The existing TypeScript helper can prepare a bounded trade for a supplied wallet executor, but it is not exposed to the CLI.

## 4. Perpl and Agora

No API key is needed to read `https://testnet.perpl.xyz/api/v1/pub/context`. The mobile screen checks chain ID 10143, exchange address, AUSD token, and the current account opening minimum from that response. Use Node 24.13+ and an installed Android development client with the Android SDK, then start the app in another PowerShell window:

```powershell
cd C:\Users\anany\Flurbo\apps\mobile
npm ci
npm run typecheck
npm run android
```

`npm run android` builds and launches the development client. For later launches, run `npm start` instead. Open **Perpl perpetual trading** on the device. Expo Go cannot run the required native passkey module. The current device build has a separate passkey domain-association issue documented in `apps/mobile/README.md`; this was not verified on a physical device in this change. Review the Perpl account setup in your own wallet if you choose to test a transaction. This spends test AUSD and test MON, so it is an owner step.

For API trading, open https://testnet.perpl.xyz/apikeys and enroll an Ed25519 API key for your wallet. Perpl may need to approve the integration origin before programmatic enrollment. An enrolled key alone does not create an exchange account. Use the Perpl testnet app to create or inspect the account, enable one-click order forwarding in settings, then trade in that app. Observe the order stream until a fill or failure, not just an order acknowledgement. The WebSocket base is `wss://testnet.perpl.xyz/ws/v1/trading`. The Flurbo mobile app currently routes orders to Perpl because the prior in-app order contract call was not a real Perpl order API.

## 5. Chainlink CRE

Create a CRE account at https://app.chain.link/cre/discover and follow https://docs.chain.link/cre/getting-started/cli-installation for the CLI. Do login in your own terminal. In PowerShell:

```powershell
cd C:\Users\anany\Flurbo\workflows\cre
bun install --frozen-lockfile
bun test
bun run typecheck
cre login
cre workflow simulate . --target synthetic --non-interactive --trigger-index 0 --http-payload ./fixtures/observations.json
```

Do not add `--broadcast`. This synthetic target proves local workflow behavior only. The `pilot` target needs the deployment config at `target/deployments/pilot-cre.json`; inspect its address and rules hash before simulation. A CRE simulation does not make the existing resolver use Chainlink. Live authenticated delivery needs a separate contract and workflow review.

## 6. Alchemy webhook, if the dashboard offers Monad testnet

Alchemy's Monad testnet RPC is confirmed. Webhook availability is product specific, so check the Alchemy Dashboard's **Webhooks** network selector before relying on it. If it offers a Monad testnet address activity or custom webhook, create it for a test wallet or pool, use a public HTTPS callback ending in `/api/alchemy/webhook`, and copy that webhook's **signing key** from its detail page. Set only `FLURBO_ALCHEMY_WEBHOOK_SIGNING_KEY` on the server. A URL with `localhost` cannot receive Alchemy deliveries. The local handler rejects unsigned requests, wrong signatures, and non-Monad payloads. `GET /api/alchemy/activity` reports `active: true` only after a verified recent delivery. No local tunnel or hosted webhook was configured by this change.

## 7. Clear session variables

```powershell
Remove-Item Env:MOONSHOT_API_KEY,Env:FLURBO_ALCHEMY_TESTNET_RPC_URL,Env:FLURBO_ALCHEMY_WEBHOOK_SIGNING_KEY,Env:FLURBO_ENVIO_GRAPHQL_ADMIN_SECRET -ErrorAction SilentlyContinue
```
