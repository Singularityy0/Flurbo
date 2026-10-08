# Chainlink CRE: price-feed observation for Flurbo pools

Target bounty: Best workflow with CRE. Scope: Monad testnet (10143) for the pool, Monad mainnet (143) read only for the Chainlink feeds.

## What it is, and what it is not

A CRE workflow that independently re-reads a pool's committed settlement rules and reports whether it agrees with the pool. For a pool whose questions are Chainlink price-feed thresholds it:

1. reads the pool's rules hash, close time, question count and resolution state on **Monad testnet**;
2. finds the first Monad **mainnet** block at or after the pool's committed observation time;
3. reads each question's Chainlink feed at that block (`latestAnswer()`, `latestRoundData()` and `decimals()`, which must agree);
4. applies each committed threshold with exact decimal arithmetic, no floating point;
5. produces the terminal yes mask, an observations hash and the seven-word report in the layout of `FactoredCreSettlementReceiver.SettlementReport`;
6. compares the yes mask with the pool's on-chain result when the pool has resolved.

**CRE is evidence orchestration here, not settlement authority.** The bonded `PilotResolver` still settles. A pool cannot accept a CRE report: `PilotPool.resolve` is callable only by its own resolver, and no contract in this repository gives CRE that power for a listed pool. The evidence says "agrees" or "differs"; it never moves funds.

## Where it is

| Part | File |
|---|---|
| Pure logic (decisions, multicall, block search, report, evidence) | `workflows/cre/src/price-feed.ts` |
| Workflow entry point, HTTP and cron triggers | `workflows/cre/src/price-feed-main.ts` |
| Config generator (from a verified pool manifest) | `workflows/cre/scripts/price-feed-config.ts` |
| Targets | `workflows/cre/workflow.yaml`, `workflows/cre/project.yaml` (`crypto-weekend`, `crypto-saturday`, `crypto-judging`) |
| Tests | `workflows/cre/test/price-feed.test.ts` |
| Simulator output | `docs/cre-evidence/crypto-weekend-simulation.txt` |
| Committed evidence shown in the app | `config/cre-evidence/<pool>.json`, `apps/web/shared/cre-evidence.mjs` |

The two workflow files import only `@chainlink/cre-sdk`, `viem`, `zod` and each other, and a test enforces that. Importing anything from `apps/web` makes the WASM build fail; that is why the older `pilot` target, which imports the web server's settlement readers, does not compile.

## How the observation block is chosen

The pool's rules say "the first block at or after 00:00 UTC". Monad produces several blocks per second, so many blocks can share one timestamp. The workflow therefore looks for the first block whose timestamp is at or after the committed time and checks that the block before it is earlier. For the Crypto weekend pool, blocks 110317694 to 110317697 all have timestamp 1791072000, and the first is **110317694** (its predecessor, 110317693, is 1791071999).

- **HTTP trigger** takes `{"observationBlock":"<decimal>"}`, reads that block and its predecessor, and refuses it unless it is exactly the first block at or after the time and is finalized.
- **Cron trigger** (every ten minutes) returns `{"status":"waiting"}` until the observation time plus the rules' 60 second finality margin, then finds the block itself by interpolating block time between finalized headers.

Reads per execution are bounded to fit CRE's limit of 15 ChainRead calls: at most 12 headers, one Multicall3 call for all feeds and one for the pool.

## Simulation (done)

```bash
bun workflows/cre/scripts/price-feed-config.ts --manifest target/deployments/wave2-f2-testnet.json --out target/deployments/wave2-f2-cre-price.json
cd workflows/cre
echo '{"observationBlock":"110317694"}' > ../../target/deployments/crypto-weekend-cre-trigger.json
cre workflow simulate . --target crypto-weekend --non-interactive --trigger-index 0 --http-payload ../../target/deployments/crypto-weekend-cre-trigger.json
cre workflow simulate . --target crypto-weekend --non-interactive --trigger-index 1
```

Both runs, with CLI 1.33.0 against the settled Crypto weekend pool `0xf8BeBA5827bFaaf6ACe08A40CD9DB740233CA9FE`: the workflow compiles with no unsupported API, picks block 110317694, reads ETH/USD 2687.38175423 against a threshold of 2700 (No), reports yes mask 8 (only SOL Yes) and `onchain.matches: true`. The saved output is `docs/cre-evidence/crypto-weekend-simulation.txt`. The unit tests pin the same numbers (observations hash, report bytes) so the TypeScript and the simulator cannot drift apart.

## Not done, and not claimed

- **Live deployment.** `cre workflow deploy` needs a linked owner key and was not run. The submission says "simulated" unless a deployment id exists.
- **Crypto Saturday.** The simulation against the new pool can only run after its observation time, 11 Oct 00:01 UTC, and after the pool is deployed.
- **On-chain attestation: built and tested, not deployed.** See below. The submission may say "CRE writes a signed attestation on Monad testnet" only after a real transaction hash exists.
- **Settlement by CRE.** Not implemented and not claimed.

## On-chain attestation (optional)

[`FlurboCreAttestation.sol`](../contracts/src/FlurboCreAttestation.sol) is a CRE report receiver that **records** the workflow's seven-word report and nothing else. It authenticates exactly like the settlement receiver (the Chainlink forwarder, then the workflow id, name and owner), checks the report's chain, pool, rules hash, question count and freshness, and stores one attestation per pool: the yes mask, the observation time, the observations hash and the report hash. It never calls `resolve`, moves no funds and gives CRE no authority over a result; anyone can compare an attestation with the pool's own resolved state.

- Tested in [`FlurboCreAttestation.t.sol`](../contracts/test/FlurboCreAttestation.t.sol) (9 tests): wrong forwarder, wrong workflow identity, malformed or misdirected reports, stale or early observations, replay, and a real `PilotPool`.
- The workflow writes the report only when its configuration names an attestation contract (`price-feed-config.ts --attestation <address>`) and the pool is not attested yet, which it reads in the same ChainRead as the pool state. Without that setting the workflow behaves exactly as simulated above.
- **Not yet run on-chain.** It needs a deployment with the forwarder for the target (the simulator's mock forwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192`, or the production forwarder `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`) and the workflow id, name and owner that forwarder will report, then `cre workflow simulate --broadcast` with a funded test key. If the first delivery reverts `UnauthorizedWorkflow`, redeploy with the identity values the delivery shows.
