# Crypto weekend ETH/USD YES on Kuru

This integration lists only **event index 2, YES** in the Crypto weekend Flurbo pool on Monad testnet. The Flurbo pool remains the prediction and settlement venue. Kuru adds a separate receipt/AUSD limit order book. A holder can wrap one unwrapped YES share into one ERC-20 YES receipt, deposit it in Kuru, trade, withdraw, and unwrap it. Kuru balances and orders are read from chain through the Flurbo server; this does not move portfolio storage to Kuru.

The selected pool is `0xf8beba5827bfaaf6ace08a40cd9db740233ca9fe`. Its canonical event 2 YES receipt is `0x0792929003a193c3129462116cfe9c70c73db15b`. The operator is `0xf1fea08ebba92ed342acc5639db312c3694bc391`. Trading closes at **2026-10-03 18:00 UTC / 23:30 IST**. The deployment script refuses to start within one hour of close. Existing receipts, withdrawals and unwrapping can still be managed after close.

## What the script does

`contracts/script/DeployPilotKuru.s.sol` deploys one Kuru receipt/AUSD pair with 0.0001 AUSD price ticks and 0.01 receipt size steps. It buys and wraps test YES shares from the Flurbo pool, deposits receipts and test AUSD into Kuru, and places resting orders: two bids at 0.46 and 0.48 and two asks at 0.52 and 0.54 test AUSD, each the same size. These are operator offers, not outcome probabilities. The inventory is set by `FLURBO_KURU_SEED_SHARES` (default 10 shares), `FLURBO_KURU_MAX_COST` (per-leg cost cap, default 10 test AUSD), `FLURBO_KURU_BALANCE_NO` (1 also buys the same quantity of NO and keeps it unwrapped) and `FLURBO_KURU_LEVEL_SIZE` (default 2 receipts). Buying equal YES and NO is a complete set that pays exactly 1 per share whatever happens, so the pool price returns to about where it started and the cheap Kuru quotes are not an arbitrage against the pool; buying YES alone would move the pool price. With 40 shares at b = 100 the legs cost about 21.99 and 18.01 test AUSD and the YES price goes 0.5013, 0.5999, 0.5013. The first Crypto weekend book was seeded with the earlier single-level version (one bid at 0.45, one ask at 0.50). The last dry run estimated about 0.80 test MON in network gas at its then current gas price; actual gas price can change.

## Deployment verified on Monad testnet

The operator broadcast the ETH/USD event 2 deployment on 2026-10-03. All 13 transactions succeeded. The deployed Kuru market is `0xe92649cdD20425239695221191515E1E51631d2A`. Foundry reported 0.513080757 test MON paid in total. `apps/web/scripts/verify-kuru-listing.mjs` checked live deployed code, Kuru's verified-market flag, the pool, receipt, pair parameters, settlement rules and a canonical block. The verified public listing is saved at `target/deployments/crypto-weekend-eth-kuru-verified.json` and loaded into the ignored local `apps/web/.env.local` as `FLURBO_KURU_LISTING_JSON`.

A fresh Flurbo server read saw two operator orders: a 0.45 test AUSD bid and a 0.50 test AUSD ask, each for 2 YES receipts. The operator wallet held 8 remaining wrapped receipts. These are live on-chain observations; prices and balances may change. Do not rerun the deployment script: it would create another market and buy more shares.

The signing sequence below is retained as an audit and recovery reference. Start at **Local app and Render** to test the deployed market.

## Operator signing and verification in Git Bash

Use the same Git Bash shell for the whole sequence. The RPC URL is read from the ignored `apps/web/.env.local` without running the file or printing its value. In this checkout that file currently points to the public Monad testnet RPC. For a paid QuickNode URL, enter it at a hidden prompt after the first block below. Never type a private key into a command argument or chat.

```bash
cd /c/Users/anany/Flurbo
mkdir -p target/deployments
export FLURBO_DEPLOYER=0xf1fea08ebba92ed342acc5639db312c3694bc391
export FLURBO_KURU_POOL=0xf8beba5827bfaaf6ace08a40cd9db740233ca9fe
export FLURBO_KURU_EVENT_INDEX=2
export FLURBO_KURU_MANIFEST=target/deployments/wave2-f2-testnet.json
export FOUNDRY_PROFILE=demo
while IFS='=' read -r key value; do
  if [[ "$key" == FLURBO_ALCHEMY_TESTNET_RPC_URL ]]; then
    export ETH_RPC_URL="${value%$'\r'}"
  fi
done < apps/web/.env.local
test -n "$ETH_RPC_URL" && test -f "$FLURBO_KURU_MANIFEST" || { echo 'Missing RPC URL or verified manifest'; exit 1; }
~/.foundry/bin/cast.exe chain-id --rpc-url "$ETH_RPC_URL"
```

The chain ID must be `10143`. To replace the public endpoint with your paid QuickNode URL without saving or displaying it, run `read -rsp 'Full Monad testnet RPC URL: ' ETH_RPC_URL; echo; export ETH_RPC_URL`, then rerun the chain ID check.

Import the **operator wallet** into an encrypted Foundry keystore if it is not already there. `--interactive` prompts for the key without placing it in shell history. Compare the displayed address with `FLURBO_DEPLOYER` before continuing.

```bash
~/.foundry/bin/cast.exe wallet import flurbo-kuru --interactive
~/.foundry/bin/cast.exe wallet address --account flurbo-kuru
```

Run one final simulation, inspect its calls and gas estimate, then sign and broadcast only if the displayed wallet is the operator address above. Foundry asks for the keystore password. **Do not add `--broadcast` to the first command.**

`FOUNDRY_PROFILE=demo` is required. The default Foundry profile denies file access to the manifest; the demo profile permits reading `config` and reading/writing `target/deployments`.

```bash
~/.foundry/bin/forge.exe script contracts/script/DeployPilotKuru.s.sol:DeployPilotKuru --rpc-url "$ETH_RPC_URL" --sender "$FLURBO_DEPLOYER" --slow
~/.foundry/bin/forge.exe script contracts/script/DeployPilotKuru.s.sol:DeployPilotKuru --rpc-url "$ETH_RPC_URL" --sender "$FLURBO_DEPLOYER" --account flurbo-kuru --broadcast --slow
```

Verify promptly, before the pool closes. This rechecks the live market code, Kuru's verified-market flag, pair parameters, pool, canonical receipt, settlement rules, and a canonical block. It outputs only public deployment data. A dry-run market address fails this command.

```bash
/c/nvm4w/nodejs/node.exe --env-file=apps/web/.env.local apps/web/scripts/verify-kuru-listing.mjs \
  target/deployments/wave2-f2-testnet.json \
  target/deployments/kuru-0xf8BeBA5827bFaaf6ACe08A40CD9DB740233CA9FE-event-2-unverified.json \
  > target/deployments/crypto-weekend-eth-kuru-verified.json
/c/nvm4w/nodejs/node.exe -e 'const x=require("./target/deployments/crypto-weekend-eth-kuru-verified.json"); if(x.status!=="verified_kuru_snapshot"||x.eventIndex!==2)process.exit(1);console.log("Verified Kuru market:",x.market)'
```

If verification fails, do not set `FLURBO_KURU_LISTING_JSON`; inspect the broadcast receipts and the current pool state. Do not rerun the broadcast command to fix a failed verification until you know whether the first broadcast created the pair and placed the seed orders.

## Local app and Render

For a local smoke test in the same Git Bash shell after verification:

```bash
export FLURBO_COLLECTIONS_SOURCE=registry
export FLURBO_KURU_LISTING_JSON="$(/c/nvm4w/nodejs/node.exe -e 'const fs=require("fs");process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync("target/deployments/crypto-weekend-eth-kuru-verified.json","utf8"))))')"
cd apps/web
npm run dev
```

Sign in at `http://localhost:18767/markets/practice-f8beba5827bfaaf6ace08a40cd9db740233ca9fe/2`. Use `localhost` for the local passkey, as in the web app runbook. The **Open order book** link appears only when the verified listing setting is present. The direct order-book path ends in `/2/kuru`. Connect MetaMask on Monad testnet. Check the live bid and ask, receipt balance and unwrapped share balance. Reviewing an action must not submit it; only **Confirm in wallet** prompts a signature.

To publish this pair on Render, deploy the web code from `metropolis` or a later user-approved branch containing these Kuru files. The current Render service tracks `main`, so pushing only `metropolis` does not update it. In Render **Environment**, add `FLURBO_KURU_LISTING_JSON` with the compact JSON printed by:

```bash
cd /c/Users/anany/Flurbo
/c/nvm4w/nodejs/node.exe -e 'const fs=require("fs");process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync("target/deployments/crypto-weekend-eth-kuru-verified.json","utf8")))+"\n")'
```

Keep `FLURBO_COLLECTIONS_SOURCE=registry` and your existing Monad testnet RPC setting. This integration needs no Kuru API key: orders are on-chain and wallet-signed. Render must restart after adding the listing setting. Do not paste the dry-run or unverified JSON into Render.
