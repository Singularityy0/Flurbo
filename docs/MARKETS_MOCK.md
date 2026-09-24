# Consumer mock

The public landing page stays at `https://flurbo.singu.online/`. Sign-in opens
`/markets`, with Portfolio and History alongside it. This uses the current domain
and passkey setup; no additional DNS record is required.

Four separate practice questions share one pool:

1. Will the night market open?
2. Will the concert sell out?
3. Will it rain on Saturday?
4. Will the new cafe open?

Each has Yes and No shares. Users can optionally combine up to three answers.
All are explicitly practice events. Their scripted results are YES, NO, VOID,
YES. This exercises winning, losing, challenged and cancelled outcomes. Prices
come from the deployed pool, with a fresh check before signing. The app never
invents live prices while a service or deployment is unavailable.

The existing real-event pool, original demo, learning pool and Kuru remain
accessible in Testing tools. Earlier holdings are under the collection selector
in Portfolio and History. They are not moved into the new practice pool.

## Make the four markets live

Code and local tests are complete; public deployment still requires your wallet.
No public transactions were submitted by the agent. Run from Git Bash only when
ready to deploy. Preparation opens a 24-hour trading window; settlement follows.
You need **27.725888 test AUSD** for liquidity and test MON for gas. The read-only
simulation estimated about **2.42 MON**; actual fees can change.

```bash
cd ~/Flurbo
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
bun workflows/cre/scripts/prepare-rehearsal.ts
forge script contracts/script/DeployRehearsal.s.sol:DeployRehearsal --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow
```

Stop on any failure. Do not restart preparation or deployment after a partial
broadcast. Once all transactions succeed, verify before anyone trades:

```bash
bun workflows/cre/scripts/verify-pilot.ts --rehearsal
clip < target/deployments/rehearsal-testnet.json
```

Paste the copied JSON into Render's `FLURBO_REHEARSAL_MANIFEST_JSON`. Save and
deploy the latest code. Leave the real pilot manifest setting unchanged. Save a
copy of this public deployment JSON because `target/` is ignored by Git.

Visit `/markets`, sign in and confirm there are four cards. Choose a prediction
and connect a funded wallet. Prices load automatically as the answer and share
quantity change. Read the displayed maximum spend, click **Buy**, then confirm
in your wallet. If allowance is insufficient, **Allow payment** appears first;
the app checks that approval automatically and shows a fresh purchase price.
Approval alone does not buy shares. Each transaction still requires confirmation.

The selected prediction, answers and quantity are saved in this browser for the
signed-in account, including after approval completes. Reload reopens the draft;
reconnect the trading wallet to get a fresh price. Restoring a draft never signs
or resubmits a transaction. Known pending transaction hashes are checked
automatically, with a manual check available if polling fails or pauses. A missing
hash still requires checking wallet activity before continuing. Completed trades
clear the draft and show **Purchase complete**. Closing an unsent ticket discards
its draft. Portfolio should show the selected wallet's shares. Mera and
MetaMask have separate balances. Prices are one-share costs, not a probability
claim or a guaranteed execution price.

For operator settlement steps after trading closes, use
[MOCK_TESTING.md](MOCK_TESTING.md). Ordinary testers do not need that runbook.

## Small commits

No staging, committing or pushing has been performed by the agent. These commands
exclude the user's `.gitignore`, resources and design artifacts.

```bash
git add contracts/src/PilotPool.sol contracts/src/PilotResolver.sol contracts/script/DeployPilot.s.sol contracts/test/PilotLifecycle.t.sol workflows/cre/src/event-draft.ts workflows/cre/src/rehearsal.ts workflows/cre/src/pilot-verification.ts workflows/cre/scripts/create-pilot-publication.ts workflows/cre/scripts/prepare-rehearsal.ts workflows/cre/scripts/test-pilot-local.ts workflows/cre/test/rehearsal.test.ts
git commit -m "Support four separate practice events and settlement"

git add apps/web/server/pilot.mjs apps/web/server/local-api.mjs apps/web/server/production.mjs apps/web/tests/markets.test.ts apps/web/tests/pilot-access.test.ts apps/web/tests/production.test.ts
git commit -m "Serve verified market cards with on-chain share prices"

git add apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/pages/AuthPage.tsx apps/web/src/pages/Markets.tsx apps/web/src/pages/markets.css apps/web/src/pages/Pilot.tsx apps/web/src/pages/Workspace.tsx apps/web/tests/pilot-fixture.ts apps/web/tests/markets-browser.test.ts apps/web/tests/workspace-browser.test.ts docs/MARKETS_MOCK.md docs/MOCK_TESTING.md
git commit -m "Make markets the consumer entry after sign-in"
git push origin main
```
