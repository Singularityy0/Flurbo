# V2 and semantic validation integration

Prepared on 2026-09-28. This document describes local changes and a proposed release sequence. It is not evidence of a hosted deployment or of hosted configuration.

## Git state and scope

The current checkout is `redesign/v2`, based on `901542a`. The semantic rollout reviewed here is `origin/feature/semantic-validation-rollout` at `fbbeba1`, the source of PR #2.

The previous agent copied semantic files into the uncommitted V2 working tree. All 58 files changed by the semantic branch are present. After this follow-up, 50 match that branch after newline normalization. Eight contain intentional integration changes: the CI workflow, production server, SemanticReview, Agents, Pilot, shared pilot client, agent browser tests, and market browser tests. No SDK, mobile, protocol, semantic backend or rollout documentation content from that branch is missing.

Do not use the earlier V2-only staging instructions. V2 now imports semantic modules that are not tracked on its current parent. `V2_RELEASE_PATHS.txt` lists the application, SDK, protocol, CI and release files that belong in this combined snapshot. It excludes personal skill folders, design experiments, local resources, research proposals, temporary reports and credentials.

## Follow-up changes

1. CI explicitly runs the semantic trade-ticket, loader and UI control browser tests. The general test run skips browser tests without the browser environment, so listing them in the actual browser step matters. Browser files run sequentially to avoid launching many competing Chromium processes.
2. The shared purchase validator exposes a typed collision error carrying the validated assessment. The agent approval screen renders that assessment with the ordinary loss explanation and separate VOID maximum payout. It offers no acknowledgment input or agent override. A fresh review clears the old explanation. No wallet transaction or pending intent is created for a blocked purchase.
3. The loader retains its two-sided contour merge and reduced-motion behavior. Completion timing is shorter: normal merge 240 ms, logo reveal and hold 200 ms, exit 180 ms. With the 60 ms readiness debounce, the normal completion sequence takes 680 ms instead of 1500 ms. An already displayed fast loader may use its minimum visible duration. A state-machine regression bounds the completion sequence to 750 ms. These are animation timings, not total network or route loading times.
4. Browser tests wait for the loader to release focus before testing keyboard input, and wait for runtime registration navigation before operating its settings.

This does not change semantic enforcement defaults, contracts, authentication, approvals, budgets, SDK trading policy or recovery behavior. This work does not certify mainnet readiness.

## Commit and push from Git Bash

The helper has not been executed against this repository. It creates local commits only when you run it.

```bash
cd /c/Users/anany/Flurbo
git status --short
git fetch origin
bash scripts/commit-v2-integration.sh
# Continue only if the helper succeeds.
git log -3 --oneline
git diff --stat origin/feature/semantic-validation-rollout...HEAD
git push -u origin redesign/v2
```

The helper contains the explicit staging command:

```bash
git add --pathspec-from-file=docs/V2_RELEASE_PATHS.txt
```

It refuses the wrong branch, a changed starting commit, a changed semantic branch, pre-existing staged edits or an existing recovery branch. It then:

1. Commits the complete selected working tree as a local snapshot.
2. Saves that commit on `backup/redesign-v2-tested-snapshot`.
3. Uses `git reset --soft fbbeba1` to move only the unpublished V2 branch parent. The index and working files remain intact.
4. Commits the V2 changes on top of the actual semantic history.
5. Verifies that the final tree is identical to the saved snapshot and that semantic history is an ancestor.

Each commit uses one `-m`, without attribution trailers. The temporary snapshot stays on the local recovery branch and need not be pushed. No force push is needed. If any command fails, stop and inspect `git status` and the recovery branch. Do not repeat the helper, use `reset --hard`, delete files, or overwrite the recovery branch.

This packaging changes commit ancestry without changing the tested application files. It avoids creating an apparent second implementation of PR #2 or resolving its conflicts again by discarding one side.

## Merge order

Pushing a branch is not approval to deploy it. Keep both PRs in draft until their intended checks and review are complete. The broader browser failures documented below remain release gates where they cover changed workflows.

1. Open a V2 draft PR into `main`. It will initially include semantic ancestry because PR #2 has not merged. Run all four CI jobs on this exact head, including the expanded browser step. PR #2's previous green status does not certify V2.
2. Confirm the effective hosted semantic mode is `off` in Render and in authenticated operator diagnostics. Absence from `render.yaml` does not prove the deployed environment is unset. Do not enable enforcement during this UI release.
3. Once semantic review is complete, merge PR #2 using **Create a merge commit**, not squash or rebase. This preserves the semantic commits shared by V2.
4. Bring the resulting `main` into V2, then rerun CI:

```bash
git switch redesign/v2
git fetch origin
git merge origin/main -m "Merge main into Flurbo V2 before release"
# If conflicts appear, stop. Resolve and test them rather than choosing one side wholesale.
git push origin redesign/v2
```

5. Review the V2 PR again after the base changes. It should now show only V2 and its integration follow-ups. Resolve outstanding browser release gates and check desktop and mobile sign-in/access, market purchase, acknowledgment, portfolio holdings, agent approval, runtime settings and restart tracking.
6. Merge the V2 PR using **Create a merge commit** after its current CI passes and the release gates are satisfied. Let Render deploy that reviewed `main` commit.
7. Update the local main branch after deployment:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

If other commits reach `main` or the semantic branch changes from `fbbeba1`, the tested integration has changed. Review those changes and repeat the relevant checks. Do not assume these commands guarantee an arbitrary future merge.

## Hosted checks and rollback

Check `/healthz`, direct page loads and refreshes, access approval, market discovery, a paper agent decision, portfolio attribution and an authorized small testnet purchase. Keep semantic enforcement off. Enabling it later needs reviewed observation mappings, operator diagnostics, updated clients and the separate semantic rollout procedure.

If V2 introduces a regression, revert the V2 merge commit through a reviewed revert PR and deploy that result. With the recommended merge order this keeps the semantic rollout installed with enforcement off. Do not revert PR #2 merely to roll back styling. Do not force-reset shared main. Keep the pre-release deployed SHA in the deployment record.

## Validation record

See the final verification results below. Mocked browser tests use the real production bundle and local fixtures, not a funded public-network wallet. The inherited four-language CI remains the cross-platform release authority; not every language suite has been rerun locally during this follow-up.

| Check | Result in this follow-up |
| --- | --- |
| Web production build and TypeScript check | Pass |
| Web suite without browser environment | 289 passed, 0 failed, 46 skipped |
| All browser files, sequential | 35 passed, 10 failed, 0 skipped |
| Expanded CI browser selection | All 18 selected tests passed in the sequential run |
| TypeScript SDK typecheck | Pass |
| TypeScript SDK tests, with Foundry on PATH | 38 passed, 0 failed, 1 skipped, including local-chain execution and recovery |
| Mobile typecheck and tests | Pass; 35 tests passed |
| Protocol YAML parse, CI-pinned PyYAML 6.0.2 | Pass; 13 API paths parsed |
| Commit helper rehearsal in a disposable Git repository | Pass; exact tree preserved, semantic ancestry present, unrelated untracked notes excluded |
| Whitespace check | Pass |

Local environment: Windows, Node 24.13.0, installed Chrome driven by Playwright, existing Rust example binaries, Foundry added to PATH for the local-chain tests. The cached Chromium executable could not launch; installed Chrome worked. PyYAML was installed only in the ignored temporary directory for the parser check. No public-network transaction was sent.

An initial all-tests parallel browser run had 16 failures. Sequential execution removed the six additional failures. The ten remaining test names match the prior main-baseline report in `SEMANTIC_VALIDATION_ROLLOUT.md`. Old main was not independently rebuilt and retested during this follow-up, so this is a match against the recorded baseline, not a new proof that all ten are harmless.

The unresolved files are:

- `pilot-ledger-browser.test.ts`: five tests covering fresh-device combined holdings, refresh, history outage, wallet/pool isolation, and bounded/cancelled discovery.
- `practice-collections-browser.test.ts`: multiple-pool directory and portfolio.
- `showcase-browser.test.ts`: landing example and directory.
- `wallet-session-browser.test.ts`: wallet session persistence and switching.
- `what-if-browser.test.ts`: read-only comparison, pending replacement and expiry.
- `workspace-browser.test.ts`: portfolio deep links and legacy history.

These cover real release concerns. Their existing status alone does not justify ignoring them. Before merging V2, determine which assertions or fixtures are obsolete, repair those with equivalent behavioral coverage, and fix any actual application regressions. Do not simply skip them or delete assertions. All four remote CI jobs must also pass on the final V2 head. A green focused CI job is not an all-browser-suite pass.

Local raw logs, intentionally excluded from commits:

- `tmp/v2-web-check.log`
- `tmp/v2-serial-browser.log`
- `tmp/v2-sdk-check.log`
- `tmp/v2-mobile-check.log`
- `tmp/v2-runtime-ui-check.log`

To reproduce browser coverage with the configured Playwright module and Chrome executable:

```bash
cd apps/web
npm run build
# Set FLURBO_TEST_PLAYWRIGHT to the absolute Playwright index.mjs path.
# Set FLURBO_TEST_BROWSER to the absolute Chrome executable path.
node --experimental-strip-types --test --test-concurrency=1 tests/*browser.test.ts
```

The loader timing improvement is covered by state-machine and browser tests. It is not a new network performance benchmark. The existing signed-in route prefetch remains, and total signed-in download cost still needs measurement under realistic network conditions.

## PR #3 browser CI follow-up

The uploaded CI log for `5cf8ab2` reports a successful web build and 16 of 18 selected browser tests passing. Both failures are in `markets-browser.test.ts`, for rehearsal and practice. After selecting a second prediction, the test waits for `Buy 5 shares`, which also labels the previous single-prediction quote. It can therefore assert against the old review before the combination quote arrives.

The follow-up waits for the exact combination request and its rendered claim. It also holds the response deliberately and verifies that the previous review and Buy button are absent, with no additional wallet transaction. The original claim assertions remain. Application code is unchanged; its confirmation path already checks the review against the selected owner, action, scope, mask and quantity before submission.

The two affected flows pass locally with the held-response regression. The full seven-file CI browser selection then passed all 18 tests, with no failures or skips, on Windows with installed Chrome (Node 24.13.0). Logs are in the ignored files `tmp/v2-ci-market-fix.log` and `tmp/v2-ci-browser-fix.log`. Remote Ubuntu CI must rerun after this fix is pushed. The ten broader browser failures documented above remain separate release concerns.
