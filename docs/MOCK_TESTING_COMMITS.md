# Small commits for the mock checkpoint

The agent has not staged, committed or pushed anything. Run these in Git Bash
from `~/Flurbo`. They include the previous turn's uncommitted verified manifest
and deployment notes. They deliberately exclude your `.gitignore`, resources
and Superdesign files. Stop if a command fails; inspect before continuing.

1. Preserve the verified real deployment and its notes.

```bash
git add config/pilot-testnet.json docs/ALPHA_TESTNET_LAUNCH.md docs/PILOT_TESTNET_DEPLOYMENT.md docs/REAL_EVENT_TESTNET.md
git commit -m "Record verified pilot and mock deployment handoff"
```

2. Add the separate scripted rehearsal's preparation and verification.

```bash
git add contracts/script/DeployPilot.s.sol contracts/script/DeployRehearsal.s.sol workflows/cre/src/pilot-config.ts workflows/cre/src/rehearsal.ts workflows/cre/scripts/prepare-rehearsal.ts workflows/cre/scripts/verify-pilot.ts workflows/cre/scripts/run-mock.mjs workflows/cre/scripts/test-pilot-local.ts workflows/cre/test/rehearsal.test.ts
git commit -m "Prepare isolated public settlement rehearsal"
```

3. Enable hosted rehearsal routing and improve transaction and history flow.

```bash
git add apps/web/server/pilot-config.mjs apps/web/server/production.mjs apps/web/server/local-api.mjs apps/web/server/pilot-index.mjs apps/web/shared/pilot.d.mts apps/web/src/pilot.ts apps/web/src/App.tsx apps/web/src/pages/Workspace.tsx apps/web/src/pages/Pilot.tsx apps/web/src/pages/PilotLedger.tsx apps/web/tests/pilot-config.test.ts apps/web/tests/pilot-access.test.ts apps/web/tests/pilot-browser.test.ts apps/web/tests/pilot-index.test.ts apps/web/tests/pilot-ledger-browser.test.ts apps/web/tests/production.test.ts
git commit -m "Separate hosted rehearsal and improve pilot testing flow"
```

4. Add the read-only readiness check and the manual testing handoff.

```bash
git add apps/web/package.json apps/web/scripts/check-mock-readiness.mjs docs/MOCK_TESTING.md docs/MOCK_TEST_RESULTS.md docs/MOCK_TESTING_COMMITS.md
git commit -m "Add mock readiness checks and acceptance checklist"
git push origin main
```

Push once after all four commits so Render builds the complete checkpoint.
Contract deployment remains separate; follow [MOCK_TESTING.md](MOCK_TESTING.md).
