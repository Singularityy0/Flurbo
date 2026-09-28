# V2 and semantic validation integration

Prepared on 2026-09-28. This document describes local changes and a proposed release sequence. It is not evidence of a hosted deployment or of hosted configuration.

## Git state and scope

The current checkout is `redesign/v2`. The original integration started at `901542a` and preserved semantic ancestry from `fbbeba1`, the source of PR #2. Integration commit `5cf8ab2` and quote-test fix `120a692` have been pushed in PR #3. The remaining browser follow-up is described below.

The previous agent copied semantic files into the then-uncommitted V2 working tree. The original integration confirmed that all 58 files changed by the semantic branch were present. At that point, 50 matched that branch after newline normalization and eight contained intentional integration changes. The later browser follow-up also updates rollout documentation; those original file counts are a historical snapshot.

`V2_RELEASE_PATHS.txt` records the original combined snapshot. Its one-time packaging is complete. For subsequent fixes, stage only the changed files. Keep personal skill folders, design experiments, local resources, research proposals, temporary reports and credentials out of release commits.

## Follow-up changes

1. CI now runs every browser test file, including semantic trade-ticket, loader, UI controls, portfolio, discovery and What-if coverage. The general test run skips browser tests without the browser environment. Browser files run sequentially to avoid launching many competing Chromium processes.
2. The shared purchase validator exposes a typed collision error carrying the validated assessment. The agent approval screen renders that assessment with the ordinary loss explanation and separate VOID maximum payout. It offers no acknowledgment input or agent override. A fresh review clears the old explanation. No wallet transaction or pending intent is created for a blocked purchase.
3. The loader retains its two-sided contour merge and reduced-motion behavior. Completion timing is shorter: normal merge 240 ms, logo reveal and hold 200 ms, exit 180 ms. With the 60 ms readiness debounce, the normal completion sequence takes 680 ms instead of 1500 ms. An already displayed fast loader may use its minimum visible duration. A state-machine regression bounds the completion sequence to 750 ms. These are animation timings, not total network or route loading times.
4. Browser tests wait for the loader to release focus before testing keyboard input, and wait for runtime registration navigation before operating its settings.

This does not change semantic enforcement defaults, contracts, authentication, approvals, budgets, SDK trading policy or recovery behavior. This work does not certify mainnet readiness.

## Commit and push from Git Bash

The one-time integration helper already ran to produce `5cf8ab2`. Do not run it again. For the remaining browser fixes, use:

```bash
cd /c/Users/anany/Flurbo
git status --short
git switch redesign/v2
git add .github/workflows/checks.yml apps/web/src/pages/AccountPortfolio.tsx
git add apps/web/tests/pilot-ledger-browser.test.ts apps/web/tests/practice-collections-browser.test.ts apps/web/tests/showcase-browser.test.ts
git add apps/web/tests/wallet-session-browser.test.ts apps/web/tests/what-if-browser.test.ts apps/web/tests/workspace-browser.test.ts
git add docs/V2_INTEGRATION_RELEASE.md docs/SEMANTIC_VALIDATION_ROLLOUT.md
git diff --cached --stat
git commit -m "Fix remaining V2 browser regressions and enforce full browser CI"
git push origin redesign/v2
```

The helper preserved the tested tree and semantic ancestry, with a recovery snapshot on `backup/redesign-v2-tested-snapshot`. That branch need not be pushed. No force push, reset or repeat integration is needed for these fixes. Check the staged diff before committing.

## Merge order

Pushing a branch is not approval to deploy it. Keep both PRs in draft until their intended checks and review are complete. The full browser suite is now a CI release gate; historical failures must not be used to waive a new failure.

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

## Original integration validation record

This table records the earlier integration before the browser repairs. See the follow-up section for current results. Mocked browser tests use the real production bundle and local fixtures, not a funded public-network wallet. The inherited four-language CI remains the cross-platform release authority.

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

The files with failures at that time were:

- `pilot-ledger-browser.test.ts`: five tests covering fresh-device combined holdings, refresh, history outage, wallet/pool isolation, and bounded/cancelled discovery.
- `practice-collections-browser.test.ts`: multiple-pool directory and portfolio.
- `showcase-browser.test.ts`: landing example and directory.
- `wallet-session-browser.test.ts`: wallet session persistence and switching.
- `what-if-browser.test.ts`: read-only comparison, pending replacement and expiry.
- `workspace-browser.test.ts`: portfolio deep links and legacy history.

These cover real release concerns. The follow-up repairs them with equivalent behavioral coverage rather than skipping them. All four remote CI jobs, including the newly expanded full browser job, must pass on the final V2 head.

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

The two affected flows passed locally with the held-response regression. The full seven-file CI browser selection then passed all 18 tests, with no failures or skips, on Windows with installed Chrome (Node 24.13.0). Logs are in the ignored files `tmp/v2-ci-market-fix.log` and `tmp/v2-ci-browser-fix.log`. The user subsequently supplied the PR #3 screenshot showing all four remote jobs passing for `120a692`. At that point, the ten broader browser failures were still outstanding; the following section records their repair.

## Full browser follow-up: all ten failures repaired

The six affected files were rerun against the production bundle at `120a692`: 11 tests ran, with the same ten failures and the existing workspace test passing. Updating the fixtures exposed a real archive navigation issue that had been hidden by the earlier missing API mock.

| Area | Cause and repair | Behavior retained or strengthened |
| --- | --- | --- |
| Portfolio and multiple collections | Fixtures served `/api/account/wallets` but not the current `/api/account/portfolio-sources`. Add the current read endpoint using the same verified account and wallets. | Fresh-browser discovery without saved hints, exact balances, separate pool totals, linked-wallet replacement, late-response isolation, failed-read recovery and cancellation on leaving. |
| Named combination discovery | The old expectation of 16 claims omitted the two XOR claims now included in discovery. Expect 18 and explicitly assert masks 6, 8 and 9 and both requested owners. | The batch remains bounded and combined shares appear before history responds. |
| History catch-up | Old copy and timing assertions predated bounded background history catch-up. Use the current notice and a controlled browser clock. | History errors stop catch-up, unchanged progress allows only one extra attempt, holdings reads remain bounded, and refresh cannot start history before initial holdings finish. |
| Showcase evidence | The old test expected a direct link with an arrow in its label; evidence now opens inline. Open the disclosure, verify the submitted statement, then check the raw record URL. | Published evidence is accessible and points to the correct namespace and hash. |
| Wallet persistence | The old portfolio sentence was removed, and its sources endpoint was missing from the fixture. Check the linked-wallet count and holdings section instead. | Linked wallets remain visible when MetaMask is locked, navigation and reload do not prompt reconnect, and switching wallets changes the quote owner. |
| What-if | A legitimate portfolio-sources read was being classified as an unexpected request. Mock that read explicitly. | Keep the assertion rejecting every other unexpected request and accepting only `a,b` analytics inputs; expiry, cancellation, invalid responses and mobile layout remain covered. |
| Legacy holdings navigation | The archive now has a dedicated `?legacy=1` URL, but the component read `window.location.search` without subscribing to router updates. Returning through the Portfolio navigation could leave the archive visible after the URL lost the query. Use `useSearch` and reset archive expansion when leaving that view. | Verify the archive detaches on return to `/portfolio`, can reopen with the same holdings, retains refresh/error recovery and redirects signed-out users without portfolio reads. |

No tests were removed or newly skipped. Application changes are confined to archive query navigation. Contract behavior, semantic enforcement defaults and transaction signing are unchanged. CI now runs `tests/*browser.test.ts` sequentially instead of the seven-file selection.

Final local verification on Windows, Node 24.13.0 and installed Chrome:

- Production build and TypeScript check: passed (`npm run build`).
- All browser files: **45 passed, 0 failed, 0 skipped** in approximately 211 seconds.
- Diff whitespace check: passed.

Ignored local logs: `tmp/v2-ten-baseline.log`, `tmp/v2-ten-fix.log`, `tmp/v2-legacy-fix.log`, `tmp/v2-ten-build.log`, and `tmp/v2-all-browser-fixed.log`. The first repaired run passed nine original failures and revealed the archive navigation bug; the final full run includes its fix. These results supersede the earlier 35-pass/10-fail V2 record. Ubuntu CI still needs to run on the newly pushed commit. No public-network transaction, commit, push, merge or deployment was performed during this follow-up.

## Loader timing follow-up after merging main

The CI log for `4dddba3` reports 44 browser tests passing and one failure in the quick-loader test: `shown for only NaNms`. The merge has no tree changes relative to its first parent. The test treated immediate mocked responses as evidence that a real browser would finish within the loader's show delay. Its initial detached check could finish before the loader appeared, and its later snapshot could contain an appearance without a disappearance. Subtracting the missing timestamp produced `NaN`.

The quick-load test now pauses browser time while the bundle and mocked data load. It waits for the agents empty state, advances through the readiness debounce, then advances beyond the show delay and asserts that the loader never appeared and the page is interactive. The separate slow-load test retains its real-time minimum-duration, focus and scroll assertions. No application code or loader timing was changed, and no test was skipped.

Local verification: all five loader browser tests and nine loader state-machine tests passed, with no failures or skips, using Node 24.13.0 and installed Chrome. The ignored log is `tmp/loader-clock-fix.log`. The full Ubuntu browser CI must pass on the follow-up commit before merging PR #3.
