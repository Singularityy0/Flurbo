# Hosted Monad testnet beta

Flurbo's deployment target is public Monad testnet, chain 10143. All pool,
receipt, collateral and Kuru transactions stay on Monad. The website, session
service and read API run on ordinary web hosting. The learning lab is a separate
research tool and is not included in this deployment.

## What this change provides

- A standalone Node server serving the built consumer site and account API.
- Free-tier Render Docker configuration with a separate Upstash Redis session
  store. Server sleep/restart does not intentionally revoke valid login cookies.
- Seven-day HttpOnly, Secure, SameSite=Strict login cookies. Redis stores hashed
  tokens with expiry; login challenges are consumed atomically and rate limited.
- Required Mera passkey signup/login, followed by optional MetaMask trading.
  The Mera account identity stays fixed when the trading wallet changes.
  Wallet balances and positions remain separate. Browser wallets never sign up
  or log in to Flurbo; legacy wallet-login sessions are rejected.
- Public-testnet quote, approval, buy/sell, conversion and redemption support
  through the existing reviewed execution flow. Snapshot, contract, collateral,
  sender, chain, slippage and receipt checks remain required.
- A funding panel for the signed-in address with a MON faucet link and an
  explicit AUSD faucet transaction. No server-held wallet or automatic local mint.
- Account access can launch before the pool: without a verified public deployment
  manifest, market data/trading are unavailable. They never fall back to a fork.

## Free hosting setup

1. Create a **free Upstash Redis** database in your own account. Keep its normal
   REST URL and REST token in the hosting provider's secret settings. Do not use
   a read-only token, temporary demo database, browser-prefixed environment
   variable, committed file or chat message for the token.
2. Push the prepared code yourself. In Render, create a Blueprint from this
   repository and use `render.yaml`. The Docker build context is the repository
   root, not `apps/web`.
3. Supply `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` when prompted.
   The blueprint sets `FLURBO_NETWORK=public_testnet` and
   `FLURBO_ORIGIN=https://flurbo.singu.online`.
4. Add `flurbo.singu.online` as the Render service's custom domain. Create the
   exact DNS record Render shows in the DNS provider for `singu.online`; wait
   for domain verification and managed HTTPS. Do not guess the CNAME target.
5. Open the canonical domain. Provider preview URLs intentionally reject account
   access. The health-check endpoint `/healthz` reports service liveness only,
   not contract readiness.
6. Create a new Mera passkey account on the public domain. Localhost
   credentials have a different RP ID and do not recover a public-domain wallet.
   Reload, sign out, log in, and redeploy once to verify session persistence.

Render free services sleep after inactivity and can cold-start slowly. Upstash
has its own free quotas. This is a free testnet beta configuration, not an
always-on production SLA. Do not store sessions on Render's temporary disk or
use its in-memory free Key Value service as durable session storage.

Optional: set `FLURBO_ALCHEMY_TESTNET_RPC_URL` in Render's secret settings for
the reviewed Monad testnet Alchemy endpoint. Both reader and transaction relay
use it. Otherwise they use the public Monad testnet RPC. Never put the RPC key
in a frontend `VITE_` variable.

## Fund the deployer and users

Selected deployer: `0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391`.
Read-only check during preparation: 23.406477803496862664 test MON and 0 test
AUSD. These are observations, not guaranteed current balances.

The deployment script requires at least **100 test AUSD**. The official faucet
is `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`, with
`requestFunds(address)` (selector `0x544c7cf9`). Its request was successfully
simulated for the deployer against public testnet; nothing was broadcast.

The in-app funding panel funds the signed-in Mera address. To fund the separate
MetaMask deployer above, use the official faucet contract's verified explorer write page
with MetaMask on public Monad testnet. Check the transaction receipt and AUSD
balance, not just the wallet popup. Faucet limits and availability may change.

Users follow the same flow: MON for gas, test AUSD for collateral, then separate
approval and trade confirmations. The token contract is
`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` (6 decimals). AUSD at another
address or on another chain does not fund this account. No mainnet assets belong
in this beta. Mainnet acquisition/bridging is outside this testnet release.

## Public contract deployment

The existing `contracts/script/DeployDemo.s.sol` deploys and funds an eight-event
synthetic pool, H YES receipt, Kuru pair and arbitrage executor, then seeds two
small orders. It requires chain 10143 and explicitly declared synthetic rules.
The immutable deployer is the resolver. Choose the close time deliberately;
it must be between one hour and 30 days from deployment.

Use a locally configured encrypted Foundry account for the selected deployer,
or the equivalent hardware-wallet flags. Do not put a private key into the
server, commands committed to Git, or chat. These are Git Bash commands from
the repository root, after funding and configuring the signer:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
export FLURBO_DEMO_CLOSES_AT=$(node -p 'Math.floor(Date.now()/1000)+7*86400')
forge script contracts/script/DeployDemo.s.sol:DeployDemo --rpc-url https://testnet-rpc.monad.xyz --sender "$FLURBO_DEPLOYER"
```

Review the simulation and funding requirements. A dry run writes an **unverified**
manifest and does not deploy anything. Only after the dry run succeeds, broadcast
with the locally configured signer:

```bash
forge script contracts/script/DeployDemo.s.sol:DeployDemo --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow
```

If broadcasting is interrupted, inspect the recorded receipts and nonces before
resuming. Do not blindly deploy a duplicate pool. Explorer source verification
is a separate requirement from the RPC manifest checks below.

Run the read-only verifier with your Python 3 interpreter:

```bash
python scripts/verify_demo.py --manifest target/deployments/demo-unverified.json --output target/deployments/public-testnet.json --provider public
```

Only a successful result with `environment: public_testnet`, chain 10143 and
`status: verified_snapshot` is eligible. Put the **full JSON contents** in the
Render variable `FLURBO_MANIFEST_JSON`, then redeploy. It contains public contract
addresses and verification metadata, not signing keys. Never use the local-fork
manifest. The server starts a loopback-only, read-only Python data worker against
public Monad RPC; no Anvil process or balance mutation endpoint is started.

## Deployment acceptance

- Confirm DNS/HTTPS, direct `/login`, `/signup`, `/account` navigation and a
  session surviving refresh and service restart. Unsigned `/account` redirects.
- Create/recover a public-domain Mera account, then optionally connect MetaMask
  as the trading wallet. Switching wallets must not change the Mera login.
  Review a small AUSD withdrawal from Mera to a MetaMask receiving address and
  confirm the exact Transfer event. Open positions must be sold or redeemed first.
- Fund test assets; check explorer receipts and balances. Verify wrong-network
  and local-fork wallets are rejected even though they share chain ID 10143.
- Complete approval, single/combined buy and sell, receipt conversion, and
  eventual synthetic resolution/redemption. Do not treat approval as a purchase.
- Confirm contracts and transactions exist on the public testnet explorer.
- Verify local funding/admin RPC requests are rejected on the hosted origin.

Automated tests exercise the hosted HTTP boundary, simulated Redis protocol,
restart/replay/revocation behavior and public-network signing. Actual Upstash,
Render container build, DNS, deployed contract gas and wallet interactions still
need deployment verification. No public deployment has been made by this change.

This beta does not complete native Android trading, official event resolution,
tradable conditional securities, the full Kuru customer order interface or the
remaining partner requirements. It also does not deploy the learning experiment
as the live pricing engine.

Sources: [Render free services](https://render.com/docs/free),
[Upstash REST](https://upstash.com/docs/redis/features/restapi),
[Agora deployments](https://docs.agora.finance/developer/contract-deployments).
