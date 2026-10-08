# Metropolis final stretch: execution plan

Written 8 October 2026, about 08:30 UTC, from read-only verification of this checkout, the live site, Monad testnet and mainnet, the CRE CLI, and the MetaMask plugin SDK. No code, configuration, deployment or Git state was changed while writing it.

**Hard deadline:** every sponsor bounty closes **14 Oct 2026 09:29 IST = 14 Oct 03:59 UTC** (`resources/*.txt`). **Internal submit target: 12 Oct 18:00 UTC.** 13 Oct is buffer only.

**Scope:** Monad testnet (10143) and test AUSD only. Monad mainnet (143) is read only, for the Chainlink feeds.

---

## 0. Rules for the executor

1. Steps marked **[OWNER]** need the owner: signing with a keystore, dashboards (Render, Alchemy, Envio, Kimi, CRE, MetaMask), GitHub merges, publishing, and bounty forms. Prepare the exact command, then stop and hand it over. Never ask for or print a private key, API key, keystore password or RPC token. Read secrets only through hidden prompts or `.env` files that are ignored.
2. Never run `git add .` or `git add -A`. Stage the exact paths listed in each step. Never commit `tmp/`, `target/`, `secrets/`, `design/`, `.superdesign/`, `.freebuff/`, `.agents/`, `.claude/`, `resources/`, `skills-lock.json` or `apps/web/.env.local`.
3. Every on-chain step has a dry run first, with no `--broadcast`. Inspect it, then broadcast.
4. Every step ends with its **Verify** line. Do not move on until it passes. If a Verify fails, apply the step's **Stop** rule.
5. Do not claim anything in docs, UI or submissions that a Verify line has not proven. In particular:
   - CRE is evidence orchestration, not settlement authority, unless phase 5B passes.
   - MetaMask trading counts only after a real `mm flurbo trade` transaction hash.
6. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
7. Shell: the commands below are Git Bash unless marked PowerShell. Tool paths verified on this machine:
   - `~/.foundry/bin/forge.exe` 1.5.0 and `~/.foundry/bin/cast.exe`
   - `bun` 1.4.2
   - `node` 24.13.0
   - `cre` CLI 1.33.0 at `/c/Users/anany/AppData/Local/Programs/cre/cre`
   - solc at `target/tools/solc-0.8.28.exe`
   - Keystores: `flurbo-testnet` (deployer), `flurbo-kuru`, `flurbo-settlement`, and others.

---

## 1. Verified state on 8 Oct

| Area | Fact | How it was verified |
|---|---|---|
| Repositories | Hackathon submission is the **personal** repo `Singularityy0/Flurbo`, this checkout `C:\Users\anany\Flurbo`, branch `metropolis`. The startup line is `Flurbo-cmm/Flurbo` (`C:\Users\anany\Flurbo-company`, site `flurbopm.singu.online`) and is **out of scope**. | `C:\Users\anany\Flurbo-company\README.md`: "The personal repository remains the hackathon submission." |
| Git access | `git fetch origin` fails with "Repository not found". `gh` is logged in as `Flurbo-cmm` only. `Singularityy0/Flurbo` returns 404 when unauthenticated, so it is private. | `gh auth status`, `gh repo view` |
| Branches | Local `origin/main` = `8443469`. It has 3 commits not on `metropolis` (Alchemy webhook, Envio activity and portfolio). `metropolis` has 4 commits not on main (Envio indexer, Envio pin, Alchemy, mobile MetaMask). The merge base is `d2254ed`. | `git log` |
| Uncommitted work | 20 modified and about 40 untracked files from 2 to 3 Oct (Kuru order book, Kimi UI, MetaMask plugin, docs). | `git status` |
| Hackathon site | `https://flurbo.singu.online` (Render `flurbo-testnet`, deploys personal `main`). Settlement bot healthy (cycle 1396, monitor ok, worker wait). | `/healthz` |
| Pools | All 6 registry pools are **closed for trading**. Jobs Friday `0xc440…0077`: resolved, state 5. Crypto weekend `0xf8be…a9fe`: resolved, state 8 (only SOL YES). Brazil `0x1606…8dcc`: unresolved, runoff 25 to 29 Oct. | `cast call resolved()/resolvedState()` |
| Kuru | Market `0xe926…1d2A` (Crypto weekend, ETH YES receipt `0x0792…b15b`) is live, but ETH resolved **NO**, so its receipts pay 0. `trading_available` is false after close. `target/deployments/kuru-…-event-0-unverified.json` is a dry run with no code at its address. | `apps/web/server/kuru-collection.mjs:60`, `cast codesize` |
| Deployer | `0xf1fe…c391` holds 318.38 MON and 51,194.53 test AUSD. | `cast balance`, `balanceOf` |
| Envio | Envio Cloud endpoint `https://indexer.dev.hyperindex.xyz/84870f9/v1/graphql` is synced for 6 pools. The live `POST /envio` returns HTTP 200 with rows. The Envio Cloud release branch is `metropolis` (`git show origin/main:docs/ENVIO_MAIN_DEPLOYMENT.md`). Totals: 10 distinct traders, 35 trades, about 51.2 test AUSD volume. | `curl` |
| CRE | `cre whoami` succeeds (`singucodes@gmail.com`, org `org_4wJUp0ZTDvJJNEWe`). `cre account access` reports deployment access enabled; there are no linked owner keys yet. | CRE CLI |
| CRE simulation | The `synthetic` target simulates successfully. The **`pilot` target fails to compile**: `pilot-main.ts → pilot-observer.ts → event-draft.ts → apps/web/server/settlement-publication.mjs → settlement-rules.mjs` (`node:crypto`) `→ settlement-readers.mjs` (`fetch`, `setTimeout`). | CRE CLI |
| CRE network | Tenant supports `monad-testnet` (selector `2183018362218727504`): forwarder `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (8591 bytes of code) and mock forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192` (4579 bytes). Also `monad-mainnet` (`8481857512324358265`). | `cre workflow supported-chains` |
| CRE limits | ChainRead 15 calls per execution, HTTPAction 15, Cron at fastest 30 s, HTTP trigger 1 per 30 s, execution timeout 5 min. | `cre workflow limits export` |
| Chainlink feeds (Monad mainnet) | MON `0xBcD7…22fb` = 0.02548, BTC `0xc1d4…0546` = 83,119.39, ETH `0x1B14…0A04` = 2,578.36, SOL `0x16F8…F4F2` = 116.40 (8 decimals, at writing). A historical read works: ETH at block 110317697 (4 Oct 00:00:00 UTC) = 2,687.38, which is below 2,700, so NO. This matches Crypto weekend state 8. | `cast call --block` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` exists on both Monad chains. | `cast codesize` |
| Contracts | `PilotPool.resolve(uint32 yesMask, uint32 invalidMask)` is callable only by its `PilotResolver`. `FactoredCreSettlementReceiver` targets `FactoredPool.resolve(uint32)` instead, so CRE cannot be the authority for a listed PilotPool without new contracts. | `contracts/src/*.sol` |
| MetaMask | The plugin (`packages/metamask-agent-plugin`) has one read-only `flurbo:quote` command. Its SDK is `@metamask/agent-wallet` 7.0.0. The manifest says `minCliVersion: "^6.2.0"`, which excludes 7.x under semver. The Agent Wallet docs list Monad Testnet 10143 as supported. `mm` is not installed on this machine. The SKILL.md documents `holdings`, `trade` and `thesis` commands that do not exist. | package files, docs.metamask.io |
| Kimi | `apps/web/server/kimi-forecaster.mjs` defaults to model `kimi-k3`. The docs disagree (`kimi-k2.6` in `METROPOLIS_DEPLOYMENT_ENV.md`). The key is unavailable; the owner is searching. The SDK runner already supports `openai-compatible` providers (`packages/sdk/src/node/research.ts:105`). | source |
| Alchemy | Render's `FLURBO_ALCHEMY_TESTNET_RPC_URL` holds a **QuickNode** URL (the name is historical). `readerProvider()` and `hostedConfig()` already accept `monad-testnet.g.alchemy.com` (`apps/web/server/network.mjs:15-23`). | source |
| Tests | Web: 488 tests, 439 pass, 0 fail, 49 skipped (browser tests skipped). CRE: 62 pass. Web typecheck is clean. | `npm test`, `bun test` |

---

## 2. Decisions

Locked:
- **D1. Agora/Perpl is dropped.** Perpl never granted API access. Remove the Agora bounty from the project's selections ([OWNER], step 11.1). Do not touch `apps/mobile` beyond leaving it untouched.
- **D2. Target bounties:**

  | Bounty | Prize |
  |---|---|
  | Kuru "Bring new assets and markets" | $5k |
  | Kuru "Consumer trading app" | $5k |
  | Chainlink CRE | $3k |
  | MetaMask Agent Wallet plugin | $2.5k |
  | Envio | $1k |
  | Alchemy | $1k credits |
  | Kimi | credits |

- **D3. CRE role.** CRE is a **Chainlink price-feed settlement orchestration and attestation workflow**. The bonded resolver remains the settlement authority. Optional phase 5B adds an on-chain CRE attestation contract that has no settlement power.
- **D4. New markets reuse the Crypto weekend recipe.** Four Chainlink feeds on Monad mainnet, read by `evm-rpc.v1`. It is already auto-settled by the bot (proven on `0xf8be…`), correlated (so combinations matter), and readable by CRE.
- **D5. Integration branch `metropolis-final` is cut from `origin/main`.** Main's Envio code is newer and wins. Metropolis-only work is ported onto it.

Open, for the owner to answer before the phase that needs it:
- **Q1. Mera bounty.** `tmp/FLURBO_COMPETITION_STRATEGY.md` lists a Monad Foundation "Mera account/UX" bounty ($2.5k), but `resources/` has no brief for it. If it is selected, add a submission entry in section 11; no extra build.
- **Q2. Which docs go public.** Default: exclude `docs/HANDOFF.md`, `docs/AGENT_BRIEF_PRODUCT_PRIORITIES.md` and `docs/PROPOSAL_PRODUCT_PRIORITIES_2026-09-28.md` (internal); include everything else listed in phase 1.
- **Q3. Kimi key.** Phases 7.1 to 7.4 block on it. If there is no key by **11 Oct 12:00 UTC**, submit Kimi as not delivered (skip the bounty) rather than fake it.

---

## 3. Timeline (UTC)

| When | Phases | Gate |
|---|---|---|
| 8 Oct | 0, 1, 2.1 to 2.3 | Repo access works; integration branch green; batch file prepared |
| 9 Oct | 2.4 to 2.7, 3, 4 | Both pools live and listed; both Kuru books live; Alchemy RPC on Render |
| 10 Oct | 5A, 6 | CRE simulation matches the on-chain result; `mm flurbo trade` tx hash |
| 11 Oct | 5B (stretch), 7, 8, 3.10 (pool M1 resolves about 01:30) | Full Kuru lifecycle including redeem; Envio shows new pools |
| 12 Oct | 9, 10, 11 | Main deployed; repo public; videos recorded; all forms submitted by 18:00 |
| 13 Oct | Buffer | Re-verify links and the live site only |

---

## Phase 0: Access and baseline (8 Oct)

**0.1 [OWNER] Restore access to the personal repo.**
- In PowerShell, run `gh auth login`, choose GitHub.com and HTTPS, and log in as **Singularityy0** (keep `Flurbo-cmm` as a second account).
- Then run `gh auth switch -u Singularityy0` and `gh auth setup-git`.
- **Verify:** `gh repo view Singularityy0/Flurbo --json visibility,defaultBranchRef` prints `PRIVATE` and `main`, and `git -C C:/Users/anany/Flurbo fetch origin` exits 0.
- **Stop:** if the repo is gone or renamed, find its new name with `gh repo list Singularityy0`, then `git remote set-url origin <new>`. Do not push anywhere else.

**0.2 Confirm remote heads have not moved.**
- Run `git log --oneline -1 origin/main` and expect `8443469`.
- Run `git log --oneline -1 origin/metropolis` and expect `289e69c`.
- If either differs, list the new commits (`git log 8443469..origin/main`) and include them in the phase 1 conflict review.

**0.3 Safety snapshot of the working tree** (no commit):
```bash
cd /c/Users/anany/Flurbo
git stash create > target/metropolis-wip-stash.txt   # dangling snapshot of tracked edits
tar -czf target/metropolis-wip-$(date -u +%Y%m%dT%H%MZ).tgz $(git ls-files -m) $(git ls-files -o --exclude-standard | grep -v -E '^(tmp|design|\.superdesign|\.freebuff|\.agents|\.claude|resources)/')
```
- **Verify:** the archive exists and `tar -tzf` lists `apps/web/server/kuru-collection.mjs` and `packages/metamask-agent-plugin/src/index.ts`.

**0.4 Baseline tests.** Already captured: web 439/0/49, CRE 62/0. Re-run only if 0.2 found new commits.

---

## Phase 1: Integration branch `metropolis-final` (8 Oct)

**1.1 Create the branch in a separate worktree**, so the WIP checkout stays intact:
```bash
cd /c/Users/anany/Flurbo
git worktree add ../Flurbo-final -b metropolis-final origin/main
```
Every later path in this plan is relative to `C:\Users\anany\Flurbo-final` unless it says "WIP checkout" (`C:\Users\anany\Flurbo`).

**1.2 Copy files that do not exist on main, verbatim**, from the WIP checkout into the same paths in `Flurbo-final`:

- **Kuru:**
  - `apps/web/server/kuru-collection.mjs`
  - `apps/web/src/pages/CollectionKuru.tsx`
  - `apps/web/scripts/verify-kuru-listing.mjs`
  - `apps/web/tests/kuru-collection.test.ts`
  - `docs/KURU_CRYPTO_WEEKEND.md`
- **Kimi:**
  - `apps/web/server/kimi-forecaster.mjs`, from the **committed** metropolis version: `git -C ../Flurbo show metropolis:apps/web/server/kimi-forecaster.mjs > apps/web/server/kimi-forecaster.mjs`
  - `apps/web/tests/kimi-forecast.test.ts`
- **MetaMask:**
  - the entire `packages/metamask-agent-plugin/` **except** `node_modules/`, `dist/` and `oclif.manifest.json`, which are build output
  - `skills/flurbo-trading/SKILL.md`
- **Docs:**
  - `docs/METROPOLIS_PARTNER_DESIGN.md`, `docs/METROPOLIS_LOCAL_RUNBOOK.md`, `docs/METROPOLIS_DEPLOYMENT_ENV.md`
  - `docs/CHAINLINK_CRE_INTEGRATION.md`, `docs/CRE_NEXT_BATCH_DEPLOYMENT.md`, `docs/ENVIO_INTEGRATION.md`, `docs/ALCHEMY_INTEGRATION.md`, `docs/KIMI_INTEGRATION.md`, `docs/METAMASK_AGENT_PLUGIN.md`
  - `docs/HANDOFF2.md`
  - `docs/handbook/*`, after Q2
  - this file
- **Browser test:** `apps/web/tests/partners-e2e-browser.test.ts`, which runs only in Docker.

Do **not** copy these WIP files: `apps/web/server/envio-proxy.mjs`, `apps/web/src/envio.ts` and `apps/web/tests/envio-proxy.test.ts`. They are older than main's.

**1.3 Apply modified-file hunks by hand** (diff the WIP file against main's copy):

| File | Take from WIP | Keep from main |
|---|---|---|
| `apps/web/server/local-api.mjs` | Import line `import {listingForCollection, parseKuruListing, readKuruCollection} from './kuru-collection.mjs';`; `const kuruListing = …` (changed again in step 3.2); the whole `['/api/pilot/kuru-listing','/api/pilot/kuru']` GET block; the Kimi import and the `POST /api/pilot/kimi-forecast` block (WIP lines about 391 to 395) | Everything else, including the Alchemy webhook routes |
| `apps/web/server/production.mjs` | Only the page regex change `(?:\/(?:thesis|kuru))?` | Main's `/envio` handler and `config.envioGraphqlUrl` |
| `apps/web/src/App.tsx` | `<Route path="/markets/:collection/:event/kuru" component={AccountRoute} />` | Everything else |
| `apps/web/src/pages/Markets.tsx` | `CollectionKuru` import and the `(thesis|kuru)` routing | Everything else |
| `apps/web/src/pages/MarketDetail.tsx` | `kuruListed` state, effect and the "Trade YES receipts on Kuru" panel | Everything else |
| `apps/web/src/pages/ThesisExplorer.tsx` and `thesis.css` | All Kimi hunks | Everything else |
| `apps/web/src/pages/WhatIf.tsx` | Kimi hunks | Main's `EnvioActivity` mount (`git show 14143cf -- apps/web/src/pages/WhatIf.tsx`) |
| `apps/web/shared/kuru.mjs`, `kuru.d.mts`, `apps/web/src/kuru.ts`, `apps/web/src/pages/Kuru.tsx`, `apps/web/tests/kuru.test.ts` | Whole WIP file (endpoint parameterisation) | n/a |
| `apps/web/vite.config.mjs` | Registry dev-server logic (`configurePracticeCollections`, `registryEnabled`, `TESTNET`, loading `.env.local` into `process.env`, `hosts` for any port) | **Main's** bounded `/envio` middleware: `server.middlewares.use('/envio', (req,res)=>{ void envioProxy(req,res,envioUrl); })`. Drop WIP's raw Vite proxy with `x-hasura-admin-secret`. |
| `contracts/script/DeployPilotKuru.s.sol` | Whole WIP file (then step 3.4) | n/a |
| `apps/web/README.md` | WIP additions | n/a |
| `docs/TECHNICAL_LITEPAPER.md` | WIP version (0.3) | n/a |
| `config/collections.json` | **Nothing.** Keep main's file; new pools arrive through `batch.ts register` in phase 2. | Whole file |
| `.gitignore` | Add `/secrets/` and `/apps/web/.env.local` | n/a |
| `apps/mobile/src/WhatIf.tsx` | **Nothing** (mobile out of scope, D1) | n/a |

**1.4 Install and test:**
```bash
cd /c/Users/anany/Flurbo-final/apps/web && npm ci && npm run typecheck && npm test
cd ../../workflows/cre && bun install --frozen-lockfile && bun test && bun run typecheck
```
- **Verify:** web is 0 failures, with at least 439 plus the newly added Kuru and Kimi tests passing. CRE is 62 pass.
- **Stop:** on a failure, fix only the port. Never edit unrelated tests to pass.

**1.5 Commit in three slices:**
1. `Add Kuru order book for listed pool receipts`: the Kuru files and the contract script.
2. `Add Kimi joint hypothesis to Thesis and What If`: the Kimi files.
3. `Add MetaMask Agent Wallet plugin and partner docs`: the plugin and docs.

Push the branch. Do not merge yet; phase 9 does the merge.

---

## Phase 2: Two new crypto pools (8 to 9 Oct)

Purpose:
- **M1** gives a full trade, Kuru, settle and redeem lifecycle before the deadline.
- **M2** stays open through judging.

**2.1 Write `config/markets/metropolis-final.json`.** Copy the `wave2-f2` pool from `config/markets/wave2-fast.json` exactly. Change only the fields below, and keep each question string's wording pattern with the new date and threshold.

```json
{
  "schema": "flurbo.market-batch.v1",
  "defaults": { "assertionPeriod": 43200, "challengePeriod": 3600, "votingPeriod": 3600, "bond": "1", "settlement": "auto" },
  "pools": [
    { "id": "metro-crypto-sat", "title": "Crypto Saturday", "label": "Crypto Saturday",
      "closesAt": "2026-10-10T18:00:00Z", "b": "100", "rules": ["4 rules: MON, BTC, ETH, SOL, in that order"] },
    { "id": "metro-crypto-judging", "title": "Crypto judging week", "label": "Crypto judging week",
      "closesAt": "2026-10-19T18:00:00Z", "b": "100", "rules": ["same 4 feeds"] }
  ]
}
```

Per-rule edits:
- **`eventId`:** `metro-sat-mon`, `metro-sat-btc`, `metro-sat-eth`, `metro-sat-sol`, and the same with `metro-jud-`.
- **`source.reader.at` and `observation.period`:**
  - M1: `2026-10-11T00:00:00Z`
  - M2: `2026-10-20T00:00:00Z`
- **`window`:**
  - M1: opens `2026-10-11T00:05:00Z`, closes `2026-10-11T04:05:00Z`
  - M2: opens `2026-10-20T00:05:00Z`, closes `2026-10-20T04:05:00Z`
- **`decision.value`:** re-read at prepare time, so each question starts near 50%. Use `cast call <feed> 'latestAnswer()(int256)' --rpc-url https://rpc.monad.xyz/` with the scale of 8, rounded as follows:

  | Feed | Round to | At writing |
  |---|---|---|
  | MON | 4 decimals | 0.0255 |
  | BTC | nearest 250 | 83000 |
  | ETH | nearest 25 | 2575 |
  | SOL | nearest 1 | 116 |

  Use the same thresholds in M1 and M2.
- **`question`:** the same sentence as wave2-f2 with the threshold, date and window replaced. For example: "Will the Chainlink ETH/USD feed on Monad mainnet report at least 2575 USD (latestAnswer) at the first block at or after 00:00 UTC on 11 October 2026, read from the public Monad RPC between 00:05 and 04:05 UTC?"

Funding is 2 × 100 × 4 × ln 2 = **554.52 test AUSD**. Gas is about 3 MON per pool, against 51,194 AUSD and 318 MON available.

**2.2 Prepare and check** (run in `Flurbo-final`):
```bash
bun workflows/cre/scripts/batch.ts prepare --spec config/markets/metropolis-final.json
bun workflows/cre/scripts/batch.ts check --ids metro-crypto-sat,metro-crypto-judging
```
- **Verify:** both write `target/deployments/<id>-prepared.json` and `<id>-listing.json`, and `check` prints the deploy command with no refusal.
- **Stop:** a rule-check failure means the batch file is wrong. Never add `expectPending` to silence an `evm-rpc.v1` error.

**2.3 Dry-run the deploy** (no account, no broadcast):
```bash
FOUNDRY_PROFILE=demo FLURBO_DEPLOYER=0xf1fea08ebba92ed342acc5639db312c3694bc391 FLURBO_DEPLOY_IDS=metro-crypto-sat,metro-crypto-judging \
~/.foundry/bin/forge.exe script contracts/script/DeployPilotBatch.s.sol:DeployPilotBatch --use target/tools/solc-0.8.28.exe \
  --rpc-url https://testnet-rpc.monad.xyz --sender 0xf1fea08ebba92ed342acc5639db312c3694bc391 --slow
```
- **Verify:** the simulation succeeds and total funding is about 554.52 AUSD.

**2.4 [OWNER] Broadcast:** the same command plus `--account flurbo-testnet --broadcast`.
- **Verify:** `target/deployments/<id>-unverified.json` exists for both pools.

**2.5 Verify and register:**
```bash
bun workflows/cre/scripts/batch.ts verify --ids metro-crypto-sat,metro-crypto-judging
bun workflows/cre/scripts/batch.ts register --ids metro-crypto-sat,metro-crypto-judging --feature metro-crypto-judging --settlement auto
```
- **Verify:** `config/collections.json` has 8 collections, the 2 new ones `auto` and `active`, with `featured` set to the M2 pool address.

**2.6 Commit** `config/collections.json`, `config/markets/metropolis-final.json` and the generated listing files the batch tool commits (match what PR #31 committed). Commit message: `List Crypto Saturday and Crypto judging week pools`.

**2.7 Regenerate the Envio config:** run `cd packages/envio-indexer && npm run config`, then commit `packages/envio-indexer/config.yaml`.

---

## Phase 3: Kuru, "new assets and markets" (9 to 11 Oct)

**3.1 Spec.** One YES-receipt order book per new pool on **event index 2 (ETH)**. Two pools need **multi-listing**, because `FLURBO_KURU_LISTING_JSON` currently holds exactly one listing (`parseKuruListing` in `apps/web/server/kuru-collection.mjs:28`).

**3.2 Code, multi-listing** (`apps/web/server/kuru-collection.mjs`):
- Keep `export function parseKuruListing(raw)` unchanged; it validates one `flurbo.kuru-listing.v1` object.
- Add:
  ```js
  /** Accepts null, one flurbo.kuru-listing.v1 object, or {schema:'flurbo.kuru-listings.v1', listings:[1..8]}. */
  export function parseKuruListings(raw) // → Array<listing>
  ```
  - Each entry goes through `parseKuruListing`.
  - Throw `Error('Invalid Kuru listing configuration.')` if a `pool + eventIndex` pair repeats, there are more than 8 entries, or the schema is unknown.
- Change the signature to:
  ```js
  export function listingForCollection(listings, manifest, eventIndex) // listings: Array|object|null → listing|null
  ```
  - It normalises a single object to `[object]` and returns the first entry that satisfies today's predicate.
- `readKuruCollection` is unchanged, because it already takes one listing.
- In `apps/web/server/local-api.mjs`, replace `const kuruListing = parseKuruListing(process.env.FLURBO_KURU_LISTING_JSON)` with `const kuruListings = parseKuruListings(process.env.FLURBO_KURU_LISTING_JSON)`, and pass `kuruListings` to `listingForCollection`.
- New script `apps/web/scripts/combine-kuru-listings.mjs`:
  ```js
  export function combineKuruListings(listings) // → {schema:'flurbo.kuru-listings.v1', listings}
  ```
  - CLI: `node apps/web/scripts/combine-kuru-listings.mjs <verified1.json> <verified2.json>` prints compact JSON.
  - Each input must have `status: "verified_kuru_snapshot"`.
- Tests in `apps/web/tests/kuru-collection.test.ts`:
  - a single legacy object still works;
  - two listings on different pools each resolve to their own collection;
  - a duplicate pool and event is rejected;
  - 9 listings are rejected;
  - an unverified status is rejected.
- **Verify:** `npm test` has 0 failures.

**3.3 Seed liquidity design.** The current script buys 10 YES and seeds a single 2-receipt bid at 0.45 and ask at 0.50. Buying YES alone moves the pool price: 40 YES at b = 100 moves 0.5 to about 0.60, which would make cheap Kuru asks an arbitrage against the operator. Use **complete-set issuance** instead: buy N YES **and** N NO, so the pool price returns to about 0.5. Then wrap the YES and quote around 0.5.

**3.4 Code, parameterise `contracts/script/DeployPilotKuru.s.sol`.**

Add `function envOr(string calldata,uint256) external returns(uint256);` to `PilotKuruVm`. Read these settings:

| Variable | Default | Plan value | Meaning |
|---|---|---|---|
| `FLURBO_KURU_SEED_SHARES` | `10e6` | `40e6` | YES bought and wrapped |
| `FLURBO_KURU_MAX_COST` | `10e6` | `25e6` | Per-leg maximum cost |
| `FLURBO_KURU_BALANCE_NO` | `0` | `1` | Also buy the same quantity of NO (`pool.buy(scope, 1, seed, maxCost, deadline)`), kept unwrapped |
| `FLURBO_KURU_LEVEL_SIZE` | `2e6` | `5e6` | Size of each resting order |

- Replace the single bid and ask with two levels each side, all `postOnly=true`: bids at `460000` and `480000`, asks at `520000` and `540000`.
- Deposit `2*level` receipts and `(460000+480000)*level/1e6` cash.
- Raise the balance requirement to `2*maxCost + bidCash + 1e6`.
- Keep every existing `require` and approval reset.
- **Verify:** `forge build` succeeds and the step 3.5 dry run succeeds.

**3.5 Dry run per pool, then [OWNER] broadcast.** Run this for each of `metro-crypto-sat` and `metro-crypto-judging`:
```bash
export FLURBO_DEPLOYER=0xf1fea08ebba92ed342acc5639db312c3694bc391 FOUNDRY_PROFILE=demo FLURBO_KURU_EVENT_INDEX=2
export FLURBO_KURU_SEED_SHARES=40000000 FLURBO_KURU_MAX_COST=25000000 FLURBO_KURU_BALANCE_NO=1 FLURBO_KURU_LEVEL_SIZE=5000000
export FLURBO_KURU_MANIFEST=target/deployments/<id>-testnet.json FLURBO_KURU_POOL=<pool from that manifest>
~/.foundry/bin/forge.exe script contracts/script/DeployPilotKuru.s.sol:DeployPilotKuru --rpc-url https://testnet-rpc.monad.xyz --sender $FLURBO_DEPLOYER --slow
# [OWNER] then: same + --account flurbo-testnet --broadcast
```
The script refuses within 1 hour of close, so M1 must be deployed **before 10 Oct 17:00 UTC**. The dry run writes `target/deployments/kuru-<pool>-event-2-unverified.json` with a simulated market address; the broadcast overwrites it.

**3.6 Verify each market:**
```bash
node --env-file=apps/web/.env.local apps/web/scripts/verify-kuru-listing.mjs target/deployments/<id>-testnet.json \
  target/deployments/kuru-<pool>-event-2-unverified.json > target/deployments/<id>-eth-kuru-verified.json
```
Then combine:
```bash
node apps/web/scripts/combine-kuru-listings.mjs target/deployments/metro-crypto-sat-eth-kuru-verified.json \
  target/deployments/metro-crypto-judging-eth-kuru-verified.json > target/deployments/kuru-listings.json
```
- **Verify:** each verified file has `status: verified_kuru_snapshot` and `eventIndex: 2`.

**3.7 [OWNER] Render.** In `flurbo-testnet`, open Environment and set `FLURBO_KURU_LISTING_JSON` to the single-line contents of `target/deployments/kuru-listings.json`. This replaces the dead Crypto weekend listing. The new value takes effect after phase 9 deploys.

**3.8 Local smoke test** before phase 9:
- Run `FLURBO_COLLECTIONS_SOURCE=registry FLURBO_KURU_LISTING_JSON="$(cat target/deployments/kuru-listings.json)" npm run dev` in `apps/web`.
- Open `http://localhost:18767/markets/practice-<M2 pool without 0x>/2/kuru`.
- **Verify:** the page shows 2 bids and 2 asks and the operator's receipt balance. Clicking "Review" does not prompt MetaMask; only "Confirm in wallet" does.

**3.9 Trade evidence, with a separate tester wallet and not the deployer.** On M1, before 10 Oct 17:00:
1. Buy 5 ETH YES in the pool.
2. Wrap 5.
3. Deposit into the Kuru margin account.
4. Sell 2 into the 0.48 bid (a market sell).
5. Place one limit ask.
6. Cancel it.

Record every transaction hash in `docs/KURU_SUBMISSION.md`, section "Evidence".

**3.10 Lifecycle completion.** Pool M1 settles on 11 Oct: the bot asserts during the 00:05 to 04:05 window, then the 1-hour challenge, finalize and deliver.
- **Verify:** `cast call <M1> 'resolved()(bool)'` is true.
- Then, with the tester wallet: withdraw receipts from Kuru, `unwrapBase(2,true,q)`, and `redeem(4,2,q)` (scope `1<<2`, mask 2) from Portfolio. Record the hashes. If ETH resolved NO, the redemption pays 0. Show that honestly, and redeem a winning NO or other leg as well.

**3.11 Write `docs/KURU_SUBMISSION.md`.** Sections map 1 to 1 onto the bounty deliverables (`resources/kuru.txt`). Source material is `tmp/FLURBO_COMPETITION_STRATEGY.md` §6.
1. Asset class and customer: event and outcome receipts for correlated macro and crypto questions.
2. Demand evidence: the real Envio numbers (10 traders, 35 trades, 51 AUSD as of 8 Oct; re-query on 12 Oct), the step 3.9 and 3.10 hashes, and the user test from phase 10.4. Label all of it as testnet.
3. Issuance and redemption:
   - complete-set buy;
   - `wrapBase`/`unwrapBase` 1:1 backing (`contracts/src/PilotPool.sol:114-133`);
   - collateral invariant `requiredCollateral()`;
   - uniform VOID.
4. Legal and operational plan: testnet only; no real-money launch before professional review; operator-run resolver disclosed; settlement-rule hashes on-chain.
5. Liquidity strategy: operator complete-set inventory; quote levels; LMSR backstop for the long tail; expiry cancellation; maker outreach.
6. Continuation plan: 30-day pilot with one cluster, one maker and a trader group.

---

## Phase 4: Alchemy (9 Oct)

**4.1 [OWNER] Create the endpoint.**
- In the Alchemy Dashboard, open Apps, create an app with the Monad Testnet network, and copy the Endpoints HTTP URL (`https://monad-testnet.g.alchemy.com/v2/<key>`).
- Test it with the PowerShell check in `docs/METROPOLIS_LOCAL_RUNBOOK.md` §1.
- **Verify:** the reply is `0x279f`.

**4.2 [OWNER] Set it on Render.** In `flurbo-testnet`, set `FLURBO_ALCHEMY_TESTNET_RPC_URL` to the Alchemy URL. This replaces QuickNode; first save the QuickNode URL in your secret store for rollback.
- `readerProvider()` returns `alchemy` for this host, and `scripts/check_monad_readiness.py` accepts `--provider alchemy`, so no code change is needed.
- **Verify** after redeploy:
  - `/healthz` shows `settlement_bot.monitor: ok`, and its `cycles` increase over 10 minutes;
  - Render logs have no `Unsupported public testnet RPC`;
  - the Alchemy dashboard shows request volume.
- **Rollback:** restore the QuickNode URL.

**4.3 Optional webhook** (only if the dashboard offers Monad Testnet webhooks):
- Create an Address Activity webhook for the two new pool addresses with callback `https://flurbo.singu.online/api/alchemy/webhook`.
- Set `FLURBO_ALCHEMY_WEBHOOK_SIGNING_KEY`.
- **Verify:** `GET /api/alchemy/activity`, signed in, shows `active: true` after one trade. If it is not offered, skip this and do not claim it.

**4.4 Submission text:** "Alchemy Monad testnet RPC serves every site read, the settlement bot's pool reads and the Python chain readers." Include a dashboard screenshot of request counts.

---

## Phase 5A: Chainlink CRE price-feed workflow (9 to 10 Oct, core)

Goal: a real CRE workflow, simulated with the CRE CLI and then deployed, that orchestrates a Flurbo settlement observation. It:
1. reads the Flurbo pool binding on **Monad testnet**;
2. reads 4 **Chainlink feeds on Monad mainnet** at the committed observation block;
3. applies each pool's committed threshold rules;
4. produces the terminal yes-mask, an observations hash and a 7-word report;
5. compares them with the pool's on-chain resolution when it exists.

This satisfies "integrate a blockchain with an external data source" and "successful CLI simulation" (`resources/chainlink.txt`).

**WASM rule:** the new files may import only `@chainlink/cre-sdk`, `viem` and `zod`, plus each other. Never import anything from `apps/web`; that is what breaks the `pilot` target.

**5A.1 `workflows/cre/src/price-feed.ts`** (pure functions, unit tested):
```ts
export const PRICE_FEED_SCHEMA = 'flurbo.cre-price-feed.v1';
export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
export type FeedRule = { eventIndex: number; label: string; feed: Address; operator: 'gte'; threshold: string /* decimal */ };
export type PriceFeedConfig = { schema: typeof PRICE_FEED_SCHEMA; chainId: 10143; pool: Address; rulesHash: Hex;
  closesAt: number; observationAt: number; sourceChainId: 143; eventCount: number; feeds: FeedRule[] };
export const priceFeedConfigSchema: z.ZodType<PriceFeedConfig>;   // strict; 2-4 feeds; unique eventIndex < eventCount; observationAt > closesAt
export function decideGte(answer: bigint, decimals: number, threshold: string): boolean; // exact decimal compare, no floats
export function yesMaskFrom(results: { eventIndex: number; yes: boolean }[]): number;
export function encodeFeedMulticall(feeds: FeedRule[]): Hex;      // aggregate3: latestRoundData() + decimals() per feed
export function decodeFeedMulticall(data: Hex, feeds: FeedRule[]): FeedObservation[]; // {eventIndex, feed, roundId, answer, updatedAt, decimals}
export function encodePoolMulticall(pool: Address): Hex;          // settlementRulesHash, closesAt, eventCount, resolved, resolvedState, voidMask
export function decodePoolMulticall(data: Hex): PoolState;
export function nextProbe(target: number, lo: { n: bigint; t: number }, hi: { n: bigint; t: number }): bigint; // interpolation search
export function observationsHash(obs: FeedObservation[], block: { number: bigint; hash: Hex; timestamp: number }): Hex; // keccak256(abi.encode)
export function encodeReport(c: PriceFeedConfig, observedAt: number, obsHash: Hex, yesMask: number): Hex;
  // 7 words, version 2, same layout as FactoredCreSettlementReceiver.SettlementReport (uint32 terminalState = yesMask)
export function buildEvidence(input: { config: PriceFeedConfig; pool: PoolState; block: {...}; prev: {...}; obs: FeedObservation[] }): PriceFeedEvidence;
  // throws if pool.rulesHash !== config.rulesHash, pool.closesAt !== config.closesAt, block.timestamp < observationAt, prev.timestamp >= observationAt
  // returns {schema:'flurbo.cre-price-evidence.v1', pool, rulesHash, block, observations, yesMask, observationsHash, unsignedReport,
  //          onchain: pool.resolved ? {resolvedState, voidMask, matches: resolvedState===yesMask && voidMask===0} : null,
  //          notice:'CRE observation. Settlement authority remains the bonded PilotResolver.'}
```

**5A.2 `workflows/cre/src/price-feed-main.ts`:**
```ts
import { cre, Runner, type Runtime, type HTTPPayload, decodeJson, encodeCallMsg, bytesToHex, LAST_FINALIZED_BLOCK_NUMBER,
  blockNumber, protoBigIntToBigint } from '@chainlink/cre-sdk';
const MAINNET = cre.capabilities.EVMClient.SUPPORTED_CHAIN_SELECTORS['monad-mainnet'];
const TESTNET = cre.capabilities.EVMClient.SUPPORTED_CHAIN_SELECTORS['monad-testnet'];
function onHttp(runtime: Runtime<PriceFeedConfig>, payload: HTTPPayload): string;  // input {"observationBlock":"<decimal>"} → verifies boundary, observes
function onCron(runtime: Runtime<PriceFeedConfig>): string;   // returns '{"status":"waiting"}' before observationAt+60 s, else finds the block itself
export function findObservationBlock(runtime: Runtime<PriceFeedConfig>, evm: InstanceType<typeof cre.capabilities.EVMClient>, target: number):
  { block: { number: bigint; hash: Hex; timestamp: number }; prev: { number: bigint; hash: Hex; timestamp: number } };
  // headerByNumber(LAST_FINALIZED) then nextProbe() interpolation; at most 8 header reads; throws if not converged
export async function main(): Promise<void>;
  // handlers: [cre.handler(new cre.capabilities.HTTPCapability().trigger({}), onHttp),
  //            cre.handler(new cre.capabilities.CronCapability().trigger({ schedule: '0 */10 * * * *' }), onCron)]
main();
```

Read budget per execution: at most 8 headers, plus 1 feed multicall on mainnet, plus 1 pool multicall on testnet. That is 10 or fewer of the 15 ChainRead calls. Use `evm.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: MULTICALL3, data }), blockNumber: blockNumber(n) }).result()` and `evm.headerByNumber(runtime, { blockNumber: blockNumber(n) }).result()`. The header JSON fields are `timestamp` (string), `blockNumber` (BigInt JSON) and `hash`. Return `JSON.stringify(evidence)`; it must stay under the 100 kb response limit.

**5A.3 Configs, generated by a script and never hand-written:** `workflows/cre/scripts/price-feed-config.ts`.
- CLI: `bun workflows/cre/scripts/price-feed-config.ts --manifest target/deployments/<id>-testnet.json --out target/deployments/<id>-cre-price.json`.
- For the already-settled pool, the source manifest is `target/deployments/wave2-f2-testnet.json` (Crypto weekend).
- Function:
  ```ts
  export function priceFeedConfigFromManifest(manifest: unknown): PriceFeedConfig
  ```
  - Reads pool, rulesHash, closesAt and the events' `source.reader.call.to`, `source.reader.at` and `decision.value` from the verified manifest's publication.
  - Refuses any rule whose adapter is not `evm-rpc.v1` with `chainId 143` and `data 0x50d25bcd`.
  - Takes `observationAt` from the shared `reader.at` and throws if the rules disagree.

**5A.4 Register the targets.**
- `workflows/cre/workflow.yaml`: add the following and leave `synthetic` and `pilot` as they are:
  ```yaml
  crypto-weekend:
    user-workflow: { workflow-name: flurbo-price-feed-crypto-weekend }
    workflow-artifacts: { workflow-path: ./src/price-feed-main.ts, config-path: ../../target/deployments/wave2-f2-cre-price.json, secrets-path: "" }
  crypto-judging:
    user-workflow: { workflow-name: flurbo-price-feed-crypto-judging }
    workflow-artifacts: { workflow-path: ./src/price-feed-main.ts, config-path: ../../target/deployments/metro-crypto-judging-cre-price.json, secrets-path: "" }
  ```
  Workflow names are passed as `bytes10` on-chain in 5B, so keep them as they are; the receiver only compares the encoded value.
- `workflows/cre/project.yaml`: add both RPCs to each new target:
  ```yaml
  crypto-weekend:
    rpcs:
      - { chain-name: monad-testnet, url: https://testnet-rpc.monad.xyz }
      - { chain-name: monad-mainnet, url: https://rpc.monad.xyz/ }
  ```
  Do the same for `crypto-judging`.

**5A.5 Tests in `workflows/cre/test/price-feed.test.ts`:**
- `decideGte` boundaries (equal is YES; one atom below is NO; MON at 4 decimals);
- `yesMaskFrom` for `[{0,false},{1,false},{2,false},{3,true}]` returns 8;
- `nextProbe` converges on synthetic headers within 8 probes;
- `buildEvidence` throws on a rules-hash mismatch, a closesAt mismatch, a stale block or a wrong boundary;
- `encodeReport` decodes back to its 7 fields;
- `priceFeedConfigFromManifest(wave2-f2-testnet.json)` returns 4 feeds with thresholds 0.0343, 84750, 2700 and 118.

**Verify:** `bun test` reports at least 62 plus the new tests passing, and `bun run typecheck` is clean.

**5A.6 Simulate against the settled Crypto weekend pool:**
```bash
cd workflows/cre
echo '{"observationBlock":"<block>"}' > ../../target/deployments/crypto-weekend-cre-trigger.json
cre workflow simulate . --target crypto-weekend --non-interactive --trigger-index 0 --http-payload ../../target/deployments/crypto-weekend-cre-trigger.json
cre workflow simulate . --target crypto-weekend --non-interactive --trigger-index 1     # cron path finds the block itself
```
- To get `<block>`, run `cast find-block 1791072000 --rpc-url https://rpc.monad.xyz/` (verified: 110317697).
- **Verify:** both runs print evidence with `yesMask: 8` and `onchain.matches: true`, the ETH observation answer is `268738175423`, and compilation reports no "Unsupported API".
- Save the full simulator output to `docs/cre-evidence/crypto-weekend-simulation.txt`, removing any local paths.
- **Stop:** if compilation flags an API, find the importing file and remove the dependency. Never import from `apps/web`.

**5A.7 Run the same against M1** after 11 Oct 00:01 UTC: generate its config with target `metro-crypto-sat` and simulate.
- **Verify:** once the bot delivers, the CRE `yesMask` equals `resolvedState`.

**5A.8 [OWNER] Deploy the M2 workflow live.**
1. Dry run: `cre workflow deploy . --target crypto-judging --unsigned`. Read which chain or registry the raw transaction targets and what gas token it needs.
2. If the owner agrees, link a **new dedicated** owner key: `cre account link-key`. Its private key goes only in `workflows/cre/.env` as `CRE_ETH_PRIVATE_KEY`; check that the file is gitignored.
3. Run `cre workflow deploy . --target crypto-judging`, then `cre workflow activate . --target crypto-judging`.
4. **Verify:** `cre workflow get --target crypto-judging` reports active, and `cre execution` lists a cron execution returning `{"status":"waiting"}`.

**Stop:** if the deploy needs mainnet ETH or anything the owner declines, skip it. The bounty accepts simulation; say "simulated" in the submission.

**5A.9 Display in the web UI** (small):
- New `apps/web/shared/cre-evidence.mjs`:
  ```js
  export function parseCreEvidence(raw) // → validated flurbo.cre-price-evidence.v1 or null
  ```
- Commit the evidence JSON files at `config/cre-evidence/<pool>.json`.
- On `MarketDetail.tsx`, add a panel "Chainlink CRE check": the workflow's per-question YES/NO, the observation block with a monadscan link, and "matches the on-chain result" or "pending".
- Test: `apps/web/tests/cre-evidence.test.ts`.

## Phase 5B: CRE on-chain attestation (stretch; start only if 5A.6 passes by 10 Oct 18:00)

**5B.1 Contract `contracts/src/FlurboCreAttestation.sol`:**
```solidity
contract FlurboCreAttestation is ICreReceiver {          // ICreReceiver from CreSettlementReceiver.sol
  struct Attestation { uint32 yesMask; uint64 observedAt; bytes32 observationsHash; bytes32 reportHash; }
  constructor(address forwarder_, bytes32 workflowId, bytes10 workflowName, address workflowOwner, uint64 maxAge);
  mapping(address pool => Attestation) public attestations;
  event Attested(address indexed pool, uint32 yesMask, bytes32 indexed observationsHash, uint64 observedAt);
  function onReport(bytes calldata metadata, bytes calldata report) external; // same metadata/forwarder/version/chainId/rulesHash/observedAt checks as
                                                                              // FactoredCreSettlementReceiver.onReport, reading PilotPool.settlementRulesHash()/closesAt();
                                                                              // one attestation per pool; NEVER calls pool.resolve
  function supportsInterface(bytes4) external pure returns (bool);
}
```
- Test it in `contracts/test/FlurboCreAttestation.t.sol`: wrong forwarder, wrong workflow, replay, wrong rules hash and a stale observation all revert; a valid report stores the attestation.
- Deploy with the **mock forwarder** `0xB9F79d863261869B234c481D1f9A7af84AeAd192` for simulation.

**5B.2** In `price-feed-main.ts`, add `evm.writeReport` targeting the attestation contract (testnet selector) after building the evidence. Simulate with `--broadcast`, using `CRE_ETH_PRIVATE_KEY`, a new key funded with 1 test MON.
- **Verify:** `cast call <attestation> 'attestations(address)' <pool>` returns `yesMask` 8 for Crypto weekend.

**5B.3** Only after this passes may the submission say "CRE writes a signed attestation on Monad testnet". It still has no settlement authority.

---

## Phase 6: MetaMask Agent Wallet plugin (10 Oct)

API facts:
- Verified from the `@metamask/agent-wallet@7.0.0` bundle and `github.com/MetaMask/agent-wallet-plugin-examples` (`plugins/sample/src/commands/demo/{balance,submit}.ts`).
- Active address:
  ```ts
  const s = this.ctx.walletStateManager.read();
  const address = [...s.byokWallets, ...s.remoteWallets][0]?.address;
  ```
  This needs capability `wallet-read` and dataAccess `accounts`.
- Reads: `this.ctx.publicClient(10143)`.
- Submit:
  ```ts
  const exec = await this.ctx.walletExecutor(io, this.pluginCommandId);
  const r = await exec({ kind: 'transaction', chainId: 10143, transaction: { to, data, value: '0x0' }, intent }, { signal: io.signal });
  ```
  The result has `r.kind === 'transaction'`, `r.hash`, `r.status`, `r.failureDescription` and `r.pendingJob?.pollingId`. This needs capability `wallet-submit`.

**6.1 Refactor `packages/metamask-agent-plugin/src/index.ts`:**
- Delete the fictional `PluginContext` interface and `executeTrade`.
- Keep `getQuote` and `getHoldings`, but take a `PublicClient` argument instead of creating one:
  ```ts
  export async function getQuote(client: PublicClient, p: { pool: Hex; scope: number; mask: bigint; quantity: bigint; side: 'buy'|'sell' }): Promise<{ atoms: bigint; ausd: string }>;
  export async function getHoldings(client: PublicClient, p: { pool: Hex; account: Hex; scope: number; mask: bigint }): Promise<{ atoms: bigint; shares: string }>;
  ```
- Add:
  ```ts
  export type TxRequest = { to: Hex; data: Hex; intent: string };
  export async function planTrade(client: PublicClient, p: { pool: Hex; owner: Hex; side: 'buy'|'sell'; scope: number; mask: bigint;
    quantity: bigint; slippageBps: number; deadlineSeconds: number; now: number }):
    Promise<{ approval: TxRequest | null; trade: TxRequest; quoteAtoms: bigint; limitAtoms: bigint; deadline: bigint }>;
    // buy: approval = exact AUSD approve(pool, maxCost) only if allowance < maxCost; simulateContract with account=owner before returning (skip the simulate when approval is needed, since it would revert)
    // sell: approval always null; minProceeds = quote*(10000-slippage)/10000
  export async function planRedeem(client: PublicClient, p: { pool: Hex; owner: Hex; scope: number; mask: bigint; quantity: bigint }): Promise<TxRequest>;
    // requires resolved()==true and holdings>=quantity; simulates first
  export function validateClaim(scope: number, mask: bigint, eventCount: number): void; // 1 <= popcount(scope) <= 3, scope < 2^eventCount, mask neither empty nor full
  ```
- Limits: slippage 0 to 100 bps (the skill says 50 to 100); quantity at most 10 shares (`10_000_000n`), the per-call quote support limit; `deadlineSeconds` 60 to 600.

**6.2 Commands** in `src/commands/flurbo/`, each `extends PluginCommand`, with `static override requiresAuth = true` for the wallet commands:

| File | `pluginCommandId` | Capabilities / dataAccess | Behavior |
|---|---|---|---|
| `quote.ts` (update) | `flurbo:quote` | `[]` / `[]` | Use `getQuote(createPublicClient(...))` as today |
| `holdings.ts` (new) | `flurbo:holdings` | `wallet-read` / `accounts` | Active address; `getHoldings` |
| `markets.ts` (new) | `flurbo:markets` | `[]` / `[]` | GET `https://flurbo.singu.online/api/public/markets` **only if** such a public route exists on main; otherwise read the pool list from a bundled snapshot of `config/collections.json` (pool, label, event questions, closesAt) generated at build by `scripts/snapshot-markets.mjs` |
| `trade.ts` (new) | `flurbo:trade` | `wallet-read`, `wallet-submit` / `accounts` | Inputs `--pool --side --scope --mask --quantity --slippage(50) --deadline(300) --approve`. Runs `planTrade`. If an approval is needed and `--approve` is absent, it returns `{status:'approval_required', amountAtoms}` without submitting. With `--approve`, it submits the approval first, waits for its receipt (`client.waitForTransactionReceipt`), re-plans, then submits the trade. Returns `{approvalHash?, hash, status, explorerUrl:'https://testnet.monadscan.com/tx/'+hash, quoteAtoms, limitAtoms}` |
| `redeem.ts` (new) | `flurbo:redeem` | `wallet-read`, `wallet-submit` / `accounts` | `planRedeem`, then submit |

- `package.json` `mm.commands`: list all 5 ids with the capabilities above and `"targetChains": [10143]` on every command.
- `minCliVersion`: keep `"^6.2.0"` (the template value). If `mm plugins install` on CLI 7.x rejects it, change it to `">=6.2.0"` and record why in the README.

**6.3 Tests, `packages/metamask-agent-plugin/test/plan.test.ts`** (`node --test` with a viem test client, or a fake `PublicClient` object):
- the buy approval is exact and only issued when needed;
- slippage maths rounds the right way;
- `validateClaim` rejects bad masks;
- redeem refuses an unresolved pool;
- no code path imports a private key. Also grep that `src/` contains no `privateKeyToAccount`, `mnemonic` or `PRIVATE_KEY`.

**Verify:** `npm run build && npm test` passes.

**6.4 Rewrite `skills/flurbo-trading/SKILL.md`**, and keep an identical copy at `packages/metamask-agent-plugin/skills/flurbo-trading/SKILL.md`. It should cover:
- only the 5 real commands;
- when to use each;
- the invariants (all transactions through Agent Wallet; approval only with `--approve` and an exact amount; at most 10 shares per call; read a fresh quote before every trade; never trade a closed pool);
- a worked agent flow: `markets`, then `quote`, then `trade --approve`, then `holdings`, then after resolution `redeem`.

**6.5 Update the README:** install steps, consent screen contents, each command with an example, the security model and the demo transcript.

**6.6 [OWNER] Install and live test.** Use a test-only Agent Wallet, with Guard Mode and a small outflow limit.
```powershell
npm install -g @metamask/agent-wallet@latest
mm --version
mm chains list | Select-String 10143
cd C:\Users\anany\Flurbo-final\packages\metamask-agent-plugin; npm ci; npm run build
mm config set experimentalPlugins true; mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:$PWD" --accept-permissions
```
Fund the wallet: 1 test MON and 50 test AUSD through `/fund`, or a transfer from the deployer done by the owner. Then:
```powershell
mm flurbo markets
mm flurbo quote --pool <M2> --scope 4 --mask 2 --quantity 1000000 --side buy
mm flurbo trade --pool <M2> --side buy --scope 4 --mask 2 --quantity 1000000 --approve
mm flurbo holdings --pool <M2> --scope 4 --mask 2
```
- **Verify:** two transaction hashes (approve and buy) on testnet.monadscan, with the holdings increased by 1,000,000 atoms. If Guard Mode asks for approval, approve it by email or push and keep that in the video. That is the policy and MFA proof.
- **Stop:** if `mm chains list` lacks 10143, or the executor refuses the chain, report it to MetaMask and the owner. Do not add a bypass signer.

**6.7 Record the demo video** (5 minutes or less): install with the consent screen, `markets`, `quote`, a `trade` that triggers the policy approval, the tx on monadscan, `holdings`, and the same position shown on the Flurbo Portfolio page.

---

## Phase 7: Kimi (when the key arrives; Q3 cutoff 11 Oct 12:00 UTC)

**7.1 [OWNER] Find a valid model id** without printing the key (PowerShell):
```powershell
$k=[System.Net.NetworkCredential]::new('', (Read-Host 'Kimi key' -AsSecureString)).Password
(Invoke-RestMethod -Uri https://api.moonshot.ai/v1/models -Headers @{Authorization="Bearer $k"}).data.id
```
If that returns 401, try `https://api.moonshot.cn/v1`. Pick a **non-thinking** chat model from the list. The SDK sends `temperature: 0` and `response_format: json_object`; a model that rejects either fails the test in 7.2.

**7.2 Test the web route locally.**
- In `apps/web`, set `MOONSHOT_API_KEY` (hidden prompt), `MOONSHOT_API_BASE` and `MOONSHOT_MODEL=<id from 7.1>`, then run `npm run dev`.
- Open the Thesis page of M2, select ETH and BTC, and click "Analyze with Kimi AI".
- **Verify:** the rationale card shows text, and the 3 inputs fill with values that satisfy the Fréchet bounds.
- With the key unset, an error is shown and no numbers appear (`tests/kimi-forecast.test.ts` already covers this).

**7.3 Kimi-driven autonomous agent**, the core-feature claim. Use `packages/sdk`'s runner (no code change; the provider is `openai-compatible`).
- Write `packages/sdk/examples/kimi-agent.json`, based on `defaultConfig()` in `packages/sdk/src/node/runner.ts:46`:
  ```json
  { "schema":"flurbo.agent-config.v1", "mode":"paper", "markets":["practice-<M2 pool without 0x>"],
    "research": { "retriever": { "kind":"http", "allowHosts":["rpc.monad.xyz","docs.chain.link"] },
      "provider": { "kind":"openai-compatible", "baseUrl":"https://api.moonshot.ai/v1", "model":"<id>", "apiKeyEnv":"MOONSHOT_API_KEY" },
      "perCycle":1, "perHour":6, "maxEvidenceAgeDays":7 } }
  ```
  Merge in the rest of `defaultConfig()`. `parseConfig` must accept the file.
- [OWNER] Issue an agent token on `/agents` and set `FLURBO_AGENT_TOKEN`. Run `node packages/sdk/examples/ai-agent.ts packages/sdk/examples/kimi-agent.json --once` in **paper** mode.
- **Verify:** the journal in `.flurbo-agent/` contains a validated joint forecast (source `provider`, name `api.moonshot.ai/<model>`) and a paper decision.
- Optionally run one **live** cycle with a dedicated agent wallet holding 10 AUSD. **Verify:** a trade hash.

**7.4 [OWNER] Render.** Set `MOONSHOT_API_KEY`, `MOONSHOT_API_BASE` and `MOONSHOT_MODEL` on `flurbo-testnet`. Check that the account balance is above 0 first. Verify on the live site after phase 9.

**7.5 Article** (required deliverable). Draft `docs/KIMI_ARTICLE.md`, about 900 words:
- the joint-distribution problem and why it matters;
- how Kimi produces P(A), P(B|A) and P(B|not A) per pair in Thesis, and a whole-pool joint forecast in the agent;
- validation: Fréchet bounds, schema checks, and abstaining on failure;
- why Kimi never decides settlement;
- screenshots and a paper-trade log excerpt.

The owner publishes it on dev.to or Medium and submits the URL.

---

## Phase 8: Envio (11 Oct)

**8.1 [OWNER] Release branch.** In the Envio Cloud dashboard, change the indexer's release branch from `metropolis` to `main`, with root `packages/envio-indexer` and config `config.yaml`. If that isn't possible, push the phase 9 merge commit to `metropolis` as well (`git push origin main:metropolis` after a fast-forward check).
- **Verify:** a new deployment syncs, and `{ Pool(limit:20){ id } }` on the new endpoint returns 8 pools.
- If the endpoint URL changes, update `FLURBO_ENVIO_GRAPHQL_URL` on Render.

**8.2 Depth for judging** (only if 3.5 is done; about 0.5 day). Index the Kuru books and receipt flows:
- **`scripts/generate-config.mjs`:**
  - add a contract `KuruMarket` with events `Trade(uint40 orderId,address makerAddress,bool isBuy,uint256 price,uint96 updatedSize,address takerAddress,address txOrigin,uint96 filledSize)`, `OrderCreated(uint40 orderId,address owner,uint96 size,uint32 price,bool isBuy)` and `OrderCanceled(uint40 orderId,address owner,uint32 price,uint96 size,bool isBuy)` (from `apps/web/shared/kuru.mjs:3-12`);
  - read market addresses from `config/kuru-listings.json` (new, public, committed: the combined verified listings without secrets);
  - add `BaseWrapped` and `BaseUnwrapped` to the `PilotPool` events.
- **`schema.graphql`:** add these types:
  ```graphql
  type KuruMarket { id: ID! pool: String! eventIndex: Int! fillCount: Int! baseVolumeAtoms: BigInt! quoteVolumeAtoms: BigInt! lastPrice: BigInt }
  type KuruFill { id: ID! market: String! maker: String! taker: String! isBuy: Boolean! price: BigInt! sizeAtoms: BigInt! blockNumber: Int! timestamp: Int! txHash: String! }
  type ReceiptFlow { id: ID! pool: String! owner: String! kind: String! scope: Int! mask: Int! quantityAtoms: BigInt! blockNumber: Int! txHash: String! }
  ```
- **Handlers** in `src/handlers/Flurbo.ts`: add `indexer.onEvent({contract:'KuruMarket', event:'Trade'}, …)`, and `OrderCreated` and `OrderCanceled` handlers that only count orders, plus `BaseWrapped`/`BaseUnwrapped` that write `ReceiptFlow`.
- **Web:**
  - extend `envio-proxy.mjs` with a bounded `{kind:'kuru-fills', market, limit<=20}` query and test it in `tests/envio-proxy.test.ts`;
  - show the last fills on `CollectionKuru.tsx` as "Recent fills · Envio".
- **Verify:**
  - local `npm run codegen && npm run typecheck` in WSL (runbook §2);
  - after the cloud sync, the step 3.9 Kuru sell appears as a `KuruFill` whose tx hash equals the recorded hash.

**8.3 Demo video** (about 2 minutes): config.yaml and schema, the Envio dashboard synced, What If "Recent pool activity", Portfolio cash movement, and Kuru fills.

---

## Phase 9: Release to the hackathon site (11 to 12 Oct)

**9.1** In `Flurbo-final`, run the full checks:
```bash
npm --prefix apps/web ci && npm --prefix apps/web run typecheck && npm --prefix apps/web test && npm --prefix apps/web run build
cd workflows/cre && bun test && bun run typecheck
cd ../../packages/metamask-agent-plugin && npm ci && npm run build && npm test
cd ../sdk && npm test
```
Run the browser tests in Docker (memory: `mcr.microsoft.com/playwright:v1.56.1-noble`), including `apps/web/tests/partners-e2e-browser.test.ts`.
- **Verify:** 0 failures; record the counts.

**9.2** Open a PR `metropolis-final` → `main` on `Singularityy0/Flurbo`. The body lists each phase's Verify results. After opening it, bind it with the ccd_pr tools.

**9.3 [OWNER]** Before merging, confirm the Render variables: `FLURBO_COLLECTIONS_SOURCE=registry`, `FLURBO_KURU_LISTING_JSON` (3.7), `FLURBO_ALCHEMY_TESTNET_RPC_URL` (4.2), `MOONSHOT_*` (7.4) and `FLURBO_ENVIO_GRAPHQL_URL`. Then merge. Render deploys `main`.

**9.4 Smoke tests on `https://flurbo.singu.online`:**
- `/healthz` lists 8 practice collections, and the bot's `cycles` keep increasing.
- `POST /envio {"kind":"trades","pool":"<M2>","limit":5}` returns 200.
- Signed in:
  - Markets shows Crypto Saturday and Crypto judging week;
  - `/markets/practice-<M2>/2` shows "Trade YES receipts on Kuru", and `/kuru` shows 2 bids and 2 asks;
  - Thesis on M2 runs Kimi (if 7.4 was done);
  - the CRE panel shows the Crypto weekend match (5A.9).

**Rollback:** in Render, open Deploys and redeploy the previous `main` commit. Revert the env variables listed in 4.2 and 3.7.

---

## Phase 10: Public repo and evidence (12 Oct)

**10.1 Secret scan before going public**, covering the whole history:
```bash
docker run --rm -v "C:/Users/anany/Flurbo-final:/repo" zricethezav/gitleaks:v8.24.3 detect --source /repo --log-opts="--all" --redact
```
Also check that `git ls-files` contains no `.env`, keystore, `secrets/` or `tmp/` files. Review the Q2 docs.
- **Stop:** on any real finding, do not publish. Rotate the credential first, then rewrite only with the owner's approval.

**10.2 [OWNER]** In GitHub, open Settings, then General, then Change visibility, and make `Singularityy0/Flurbo` public. This was planned for 12 Oct in memory. Then check that `https://github.com/Singularityy0/Flurbo/tree/main/packages/envio-indexer` loads while logged out.

**10.3 Root `README.md` "Metropolis" section.** For each bounty give 3 lines: what it does, where the code is, and the proof link (tx hash, video, endpoint). Add a one-paragraph "Limitations" that is honest:
- testnet only;
- operator reviewer panel;
- CRE is evidence, not authority (unless 5B);
- Kuru liquidity is operator-seeded.

**10.4 User test** (from `tmp/handoff.md` priority 8): 5 people, 15 minutes each, on M2. Tasks:
1. sign in with a passkey;
2. fund;
3. buy a single and an AND;
4. open What If;
5. find the Kuru book and sell 1 receipt.

Record completion and confusion points in `docs/USER_TEST_2026-10-12.md` as anonymised notes with no names. These are the "evidence of demand" inputs for Kuru.

---

## Phase 11: Submission package (12 Oct, by 18:00 UTC)

**11.1 [OWNER]** In the Metropolis portal:
- remove the Agora selection;
- confirm the selections for Kuru ×2, Chainlink, MetaMask, Envio, Alchemy and Kimi (plus Mera if Q1 says so);
- confirm the main project's own form fields, which have not been seen yet. Check them on 8 Oct and add any missing deliverables to this plan.

**11.2 Per-bounty materials** (each one exists before the form is filled):

| Bounty | Required by the brief | File, link or proof |
|---|---|---|
| Kuru new assets | Asset/customer, demand, issuance/redemption, legal/ops, liquidity, continuation | `docs/KURU_SUBMISSION.md`; market addresses; 3.9/3.10 hashes; video showing the lifecycle (about 3 minutes) |
| Kuru consumer app | Target users, evidence of demand, retention plan (form fields) | Same doc, consumer section; `docs/USER_TEST_2026-10-12.md`; live link |
| Chainlink CRE | Blockchain + external data; CLI simulation or deployment; meaningful use | `workflows/cre/src/price-feed*.ts`; `docs/cre-evidence/*.txt`; deployment id (5A.8) or "simulated"; short video of `cre workflow simulate` and the CRE panel |
| MetaMask | Installable plugin; all txs via Agent Wallet; `skills/<name>/SKILL.md`; README; demo of 5 minutes or less | `packages/metamask-agent-plugin`; `skills/flurbo-trading/SKILL.md`; 6.6 hashes; 6.7 video |
| Envio | Public repo with config/schema/handlers; consuming frontend; demo | `packages/envio-indexer`; Envio endpoint; 8.3 video |
| Alchemy | Functional Monad project with a meaningful Alchemy service | 4.4 text and screenshot |
| Kimi | Working product powered by Kimi; published article | 7.2 to 7.3 proofs; article URL |

**11.3 Video rules.** Record at 1080p with no secrets on screen. Do not show the Render env page, `.env` files or keystore prompts. Upload each video as unlisted. Agora's 2-minute limit no longer applies; the MetaMask limit is 5 minutes.

**11.4 Final check on 13 Oct.** Re-open every submitted link while logged out, re-run the 9.4 smoke tests, and check that the bot settled M1 and that the M2 Kuru book still has orders.

---

## Acceptance matrix (what "done" means)

| Bounty | Done when |
|---|---|
| Kuru new assets | Two verified Kuru markets on new pools; ≥1 tester fill; one full wrap → Kuru trade → settle → unwrap → redeem trail with hashes; KURU_SUBMISSION.md complete |
| Kuru consumer | Same, plus the user-test notes and a retention plan |
| CRE | `cre workflow simulate` output with `onchain.matches: true` for Crypto weekend (and M1); the code has no `apps/web` imports; optionally deployed or attested |
| MetaMask | `mm plugins install` succeeds on a current CLI; a real `mm flurbo trade` hash; SKILL.md lists only real commands |
| Envio | Public repo; cloud endpoint shows 8 pools; live What If and Portfolio use it |
| Alchemy | Render RPC is Alchemy; bot healthy for 24 hours after the switch |
| Kimi | Real model output on Thesis and the agent journal; article published |

## Stop and fallback summary

- **M1 not deployed by 10 Oct 16:00 UTC:** skip the M1 Kuru market. Show the lifecycle on M2 up to wrap and trade only, and show redemption on Crypto weekend (resolved; SOL YES pays).
- **CRE compile or simulate blocked after 4 hours:** submit the `synthetic` simulation plus the price-feed unit tests and say exactly that.
- **`mm` refuses chain 10143:** submit the plugin with a verified read-only path plus a tested `planTrade` and the MetaMask issue link. Do not claim trading.
- **No Kimi key by 11 Oct 12:00 UTC:** drop the Kimi bounty. Leave the button labelled as needing configuration.
- **Settlement bot unhealthy after the Alchemy switch:** roll back to QuickNode immediately.

## Planning sources

- Bounty briefs:
  - `resources/kuru.txt`, `chainlink.txt`, `metamask.txt`, `envio.txt`, `alchemy.txt`, `kimi.txt`, `agora.txt`
  - `resources/general.txt` (hackathon resources)
- Strategy: `tmp/FLURBO_COMPETITION_STRATEGY.md` (§6 per-bounty evidence); `tmp/handoff.md` (§22 priorities, §25 unknowns)
- Partner design and state:
  - `docs/METROPOLIS_PARTNER_DESIGN.md`, `docs/METROPOLIS_LOCAL_RUNBOOK.md`, `docs/METROPOLIS_DEPLOYMENT_ENV.md`
  - `docs/KURU_CRYPTO_WEEKEND.md`, `docs/CRE_NEXT_BATCH_DEPLOYMENT.md`, `docs/CHAINLINK_CRE_INTEGRATION.md`
  - `docs/ENVIO_INTEGRATION.md`, `docs/ALCHEMY_INTEGRATION.md`, `docs/KIMI_INTEGRATION.md`, `docs/METAMASK_AGENT_PLUGIN.md`
  - `git show origin/main:docs/ENVIO_MAIN_DEPLOYMENT.md`
- Architecture: `docs/HANDOFF2.md` (AD-1 to AD-19, mathematics), `docs/MULTI_POOL_OPERATIONS.md` (batch flow), `docs/TECHNICAL_LITEPAPER.md`
- Code:
  - `contracts/src/PilotPool.sol`, `contracts/src/FactoredCreSettlementReceiver.sol`, `contracts/src/CreSettlementReceiver.sol`
  - `contracts/script/DeployPilotKuru.s.sol`, `contracts/script/DeployPilotBatch.s.sol`
  - `apps/web/server/{kuru-collection,local-api,production,network,kimi-forecaster,envio-proxy}.mjs`
  - `apps/web/src/pages/{MarketDetail,Markets,CollectionKuru,ThesisExplorer,WhatIf}.tsx`
  - `workflows/cre/{workflow.yaml,project.yaml,src/pilot-main.ts,src/pilot-observer.ts}`
  - `packages/envio-indexer/{config.yaml,schema.graphql,scripts/generate-config.mjs,src/handlers/Flurbo.ts}`
  - `packages/metamask-agent-plugin/src/*`
  - `packages/sdk/src/{forecast.ts,node/research.ts,node/runner.ts}`
  - `config/markets/wave2-fast.json`
- External, checked 8 Oct:
  - docs.metamask.io/agent-wallet (plugins, build-a-plugin, quickstart, supported chains: 10143 listed)
  - `github.com/MetaMask/agent-wallet-plugin-template` and `github.com/MetaMask/agent-wallet-plugin-examples`
  - CRE CLI 1.33.0 (`supported-chains`, `limits export`, `account access`)
  - `@chainlink/cre-sdk` 1.22.0 typings (`EVMClient`, `CronCapability`, `HTTPCapability`, `encodeCallMsg`, `blockNumber`, `headerByNumber`)
- Memory notes:
  - `flurbo-metropolis-hackathon`, `flurbo-multi-pool-registry`, `flurbo-infra-2026-10`
  - `flurbo-project-wallets`, `flurbo-settlement-ops`, `flurbo-wave2-plan`
