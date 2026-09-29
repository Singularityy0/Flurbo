# Local general-source settlement rehearsal

This run hosts the application, monitor and transaction worker locally while using a fresh market on public Monad testnet. It does not require another Render service, a production deployment, a commit or a push. It must not be described as a completed unattended test until the actual proposal, finalization, delivery and holder redemption receipts are recorded.

## Scope and immutable question

The separate collection uses two short USGS earthquake catalogue intervals. Its questions concern the count in the **first complete retained catalogue snapshot generated and captured during a published window**. They do not ask for the eventual physical earthquake count. Earthquakes can enter the catalogue late. A complete zero-count response can support NO or YES according to the committed comparison. Missing, partial, malformed, late or ambiguous evidence cannot be interpreted as zero.

The general mode also supports reviewed JSON records and narrowly specified BLS and FOMC records. It does not interpret arbitrary prose. Each new question needs an explicit source, record identity, parser, comparison, vintage and deadline policy. Ethereum activity continues through its existing adapter.

`prepare-deterministic-test.ts --prepare` starts the immutable deadlines. Do not run it until tools, public evidence serving, funding and the operator are ready. Trading closes approximately 90 minutes later. Each five-minute event interval has its own five-minute snapshot capture window after a two-minute reporting allowance. The latest observation end is approximately 20 minutes after trading close. The unchanged resolver requires a one-hour challenge window, so earliest ordinary delivery is approximately 170 minutes after preparation, plus transaction and polling delays. Disputes or missing results take longer.

## Isolation

- The new deployment uses `DeployDeterministicTest`, a path-only subclass of `DeployPilot`. No `contracts/src` logic changes are required for this recipe.
- Artifacts use `target/deployments/deterministic-test-*`. Existing Pilot, September, Showcase and activity-Test manifests remain unchanged.
- Runtime state uses `target/local-settlement-rehearsal/live-source-test`. The runner accepts an exact pool and rules hash and does not inherit production pool, Redis, signer or finish-only configuration.
- The bot is separate from the creator, reviewers and traders. It must hold no prediction-market positions. Do not import its key into a trading workflow.
- Source captures, evidence, packet bytes, transaction journals and leases persist locally. The display indexes and local account sessions are separately disposable and reconstructible. The durable worker journal must never be deleted to recover a stuck transaction.
- Only the evidence gateway on port 18868 is exposed publicly. It serves immutable evidence/packets and a minimal health endpoint. The website on port 18867, account routes, configuration and wallet files stay on loopback.
- Local notifications are flushed alert files, not email or proof that someone read them. Hosted watchdog and email delivery are not exercised by this runner.

## Secure Windows signer

Initialize the dedicated bot once in PowerShell:

```powershell
cd C:\Users\anany\Flurbo
& .\apps\web\scripts\local-settlement-wallet.ps1 -Mode initialize
```

The key is generated in process and persisted with Windows DPAPI encryption for the current Windows user. Only its address is printed. The protected file lives under the ignored rehearsal directory. It is not a portable backup. The worker launcher decrypts it only into the child process environment, restores the parent environment afterward, and never passes it in command arguments or logs. On this machine, DPAPI requires the actual logged-in Windows profile rather than the restricted tool sandbox.

## Public evidence gateway

Keep these processes alive for the entire rehearsal and any challenge/review period:

```powershell
node apps/web/scripts/serve-settlement-evidence.mjs target/local-settlement-rehearsal/live-source-test 18868
```

In a second terminal, if using the already installed Cloudflare helper:

```powershell
& 'C:\Program Files (x86)\cloudflared\cloudflared.exe' tunnel --url http://127.0.0.1:18868 --no-autoupdate
```

Record the resulting public HTTPS origin in `bootstrap.json` in the isolated state directory, together with the dedicated signer address, state directory, website port 18867 and polling interval 60. The schema is `flurbo.rehearsal-bootstrap.v1`. Never tunnel the application port. Confirm `/healthz` reports read-only evidence serving, while account routes and wallet-file paths return 404.

A quick tunnel is temporary infrastructure. Retaining local bytes does not keep an old on-chain URI reachable when the tunnel closes or changes. Do not change the evidence origin after submitting a proposal. For production, use a stable public origin and durable retention through every challenge and review window. This rehearsal does not establish archival uptime.

## Human deployment step

The existing testnet deployer is encrypted. The operator enters its password into Foundry's own local terminal prompts, never into chat. From Git Bash:

```bash
powershell.exe -NoProfile -File 'C:\Users\anany\Flurbo\apps\web\scripts\deploy-local-settlement-test.ps1'
```

The default keystore is `flurbo-testnet`. Add `-Account monad-deployer` only if that is the keystore containing the configured creator. The script checks the derived address against the reviewed selection and checks chain 10143 before sending anything. It tops up the dedicated bot to a one-test-MON gas reserve and supplies two test AUSD if needed, compiles before starting deadlines, prepares the immutable questions, deploys a new pool/resolver and verifies the result. The gas reserve covers the bounded multi-transaction lifecycle rather than only the first approval. The helper selects the existing `demo` Foundry profile, which permits deployment-artifact reads and writes, and restores the caller's profile afterward. Existing deployments are not replaced. A partial failure requires inspecting saved broadcast receipts, not blindly rerunning deployment. A Forge simulation also writes an unverified manifest; it must not be mistaken for an actual broadcast or promoted without live verification.

## Connect the local application and worker

After the new deployment is verified:

```powershell
node apps/web/scripts/configure-local-settlement-rehearsal.mjs target/local-settlement-rehearsal/live-source-test/bootstrap.json
node apps/web/scripts/serve-local-settlement-rehearsal.mjs target/local-settlement-rehearsal/live-source-test/config.json
```

Open `http://localhost:18867/markets` in Chrome. Local Mera passkeys are scoped to localhost and cannot reuse the production passkey. Complete the normal passkey and MetaMask steps. Confirm that the network is public Monad testnet and that the directory contains only the new rehearsal collection. Place a small test-asset position from a separate trading wallet before close. The settlement bot must never be that trader.

In another PowerShell terminal:

```powershell
& .\apps\web\scripts\local-settlement-wallet.ps1 -Mode run -ConfigPath target/local-settlement-rehearsal/live-source-test/config.json
```

For a read-only transaction dry run, before execution:

```powershell
node apps/web/scripts/run-local-settlement-rehearsal.mjs target/local-settlement-rehearsal/live-source-test/config.json --once
```

Dry run still monitors and retains real source evidence. It does not sign or broadcast. Starting the real worker is explicit through the launcher above. Every cycle saves `latest.json`, appends and flushes `cycles.jsonl`, and records local alerts. The loop stops after delivery completes or the operator interrupts it. The next run reconciles the existing journal. Keep the machine awake and online throughout the test.

## Acceptance record

Capture the following in the rehearsal report:

1. Verified deployment identities, immutable rules, source query windows, funded non-holder bot and separate holder trade receipt.
2. Local website and Chrome observations, including any real login or extension limitation. A mocked browser regression is not proof of a real wallet trade.
3. Complete source captures retained before cutoff, their hashes, selected snapshot identity and public packet/evidence readback.
4. Actual bot proposal receipts with the exact deterministic YES or NO outcome. No operator-authored substitute answer.
5. Bot restart with its journal retained and no duplicate transaction or changed evidence identity.
6. Unchallenged finalization and delivery receipts, followed by separate holder redemption and measured collateral balance change.
7. Any manual intervention, missed window, source failure or temporary evidence outage. Manual rescue means the unattended acceptance test failed, even if a later payout succeeds.

Missing evidence follows the existing pending-case timeout to VOID. A dispute requires the named reviewer process or its timeout. VOID uses the published payout rule and is not a purchase-price refund. The bot cannot extend on-chain deadlines or decide an unsupported question. Temporary network errors, stale monitoring, insufficient funds and ambiguous evidence must stop the relevant action rather than invent an answer.

## Completion boundary

Passing unit, source, browser and contract tests establishes local code behavior. A successful local public-testnet rehearsal adds evidence that this selected question and operator setup complete the transaction lifecycle. Neither alone proves GitHub cron reliability, permanent public storage availability, independent dispute adjudication or support for arbitrary markets. Review those separately before enabling a new production collection.
