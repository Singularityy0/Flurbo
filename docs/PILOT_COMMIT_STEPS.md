# Small user-run commits

Run these in Git Bash from `~/Flurbo`, in order. No files were staged, committed
or pushed by the agent. These explicit paths exclude your `.gitignore` edit,
`.superdesign/`, `resources/`, keys and ignored deployment/build artifacts.

Check `git diff --cached --name-only` first. If unrelated work is already staged,
separate it before using these commands. Stop at any failed command.

## 1. Separate pool and resolution lifecycle

```bash
git add contracts/src/PilotPool.sol contracts/src/PilotResolver.sol contracts/test/PilotLifecycle.t.sol
git commit -m "Add testnet pilot resolution and uniform void payouts"
```

## 2. Reviewed publication and shared transaction policy

```bash
git add apps/web/shared/pilot.mjs apps/web/shared/pilot.d.mts workflows/cre/src/pilot-config.ts workflows/cre/test/pilot-config.test.ts workflows/cre/scripts/create-pilot-publication.ts workflows/cre/scripts/prepare-pilot.ts workflows/cre/src/event-draft.ts workflows/cre/test/event-draft.test.ts
git commit -m "Bind pilot publications to reviewed rules and reviewers"
```

## 3. Deployment and compiled-runtime verification

```bash
git add contracts/script/DeployPilot.s.sol contracts/test/DeployPilot.t.sol workflows/cre/src/pilot-verification.ts workflows/cre/test/pilot-verification.test.ts workflows/cre/scripts/verify-pilot.ts
git commit -m "Prepare and verify separate pilot testnet deployments"
```

## 4. Evidence, trade preparation and signing

```bash
git add apps/web/server/pilot.mjs apps/web/src/pilot.ts apps/web/tests/pilot-fixture.ts apps/web/tests/pilot.test.ts
git commit -m "Add bounded pilot reviews and durable public evidence"
```

## 5. Hosted authorization and persistent history

```bash
git add apps/web/server/pilot-index.mjs apps/web/tests/pilot-index.test.ts apps/web/server/local-api.mjs apps/web/server/production.mjs apps/web/tests/pilot-access.test.ts
git commit -m "Guard hosted pilot operations and persist lifecycle history"
```

## 6. Consumer pilot, portfolio and history views

```bash
git add apps/web/src/pages/Pilot.tsx apps/web/src/pages/PilotLedger.tsx apps/web/src/pages/pilot.css apps/web/src/pages/Workspace.tsx apps/web/src/App.tsx apps/web/tests/pilot-browser.test.ts
git commit -m "Add real-event pilot views with reviewed wallet actions"
```

## 7. CRE source observation and local lifecycle rehearsal

```bash
git add workflows/cre/src/pilot-main.ts workflows/cre/src/pilot-observer.ts workflows/cre/test/pilot-observer.test.ts workflows/cre/src/github-release.ts workflows/cre/scripts/refresh-pilot-trigger.ts workflows/cre/scripts/test-pilot-local.ts workflows/cre/project.yaml workflows/cre/workflow.yaml
git commit -m "Prepare chain-bound CRE pilot evidence observations"
```

## 8. Kuru receipt compatibility and pair preparation

```bash
git add contracts/script/DeployPilotKuru.s.sol contracts/fork/PilotKuruOrderLifecycle.t.sol
git commit -m "Rehearse pilot receipts through deployed Kuru contracts"
```

## 9. Release gates and handoff

```bash
git add docs/PILOT_TESTNET_DEPLOYMENT.md docs/PILOT_COMMIT_STEPS.md docs/REAL_EVENT_TESTNET.md docs/DEPLOYMENT_ROLLOUT.md workflows/cre/README.md
git commit -m "Document pilot test evidence and remaining release gates"
git push origin main
```

Pushing can trigger the existing Render auto-deploy. With no
`FLURBO_PILOT_MANIFEST_JSON`, the new route says publication is pending and the
existing synthetic markets remain available. These commits do not create a
public pilot, choose reviewers, broadcast contracts or configure Render.
