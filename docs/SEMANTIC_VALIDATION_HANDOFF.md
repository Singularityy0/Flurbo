# Semantic trade validation: development handoff and release gate

Status: implemented and tested locally, parked on `semantic-trade-validation` in a separate checkout. Not production-ready until the release gates below are completed. This document records work performed on 27 September 2026, based on main commit `b033b49`. It is not an audit, an ADR for contract changes, or evidence of a hosted rollout.

Read [the protocol specification](../protocol/specs/semantics.md) for the JSON schema, endpoint contract, configuration example and exact execution behavior. This document explains the implementation, remaining work and rollout sequence. No credentials or private keys are included or required for the new configuration.

## Update: disabled-by-default integration (28 September 2026)

The branch now merges current main and adds an explicit mode switch, `FLURBO_SEMANTIC_MODE` (`off` by default, or `enforce`). Disabled mode returns a claim-bound `mode: "disabled"` assessment, which updated clients treat as "proceed without assurance"; failures are never treated as disabled. Enforced mode validates rules once at startup and isolates a bad entry to its own pool. The server logs the mode, revision and per-market coverage at startup and exposes them to the operator at `GET /api/semantic-status`. The native app now passes its market namespace and shows the acknowledgment. See [the specification](../protocol/specs/semantics.md#modes). Production enforcement stays off until reviewed mappings and candidate-deployment checks pass. The final Pilot review UI must be reconciled with the unpublished V2 redesign.

Configuration, rollout gates, rollback and current test results for this integration are in [the rollout guide](SEMANTIC_VALIDATION_ROLLOUT.md). Where it differs from the staged rollout below, the rollout guide applies: code can reach main with the mode off, and enforcement is a separate configuration change.

No semantic collision has been demonstrated in the currently reviewed markets (the pilot release events, Showcase v0 Ethereum block metrics and the rehearsal set). Threshold and range markets are the obvious future application.

## Problem and scope

Flurbo's probability model operates over Boolean outcomes. Numerical consistency does not establish whether a state is possible under the real-world event definitions. For example, the same official ETH closing observation cannot be both at least $3,000 and below $2,500. A claim selecting both Yes outcomes has no ordinary winning state under those definitions.

That example does not imply that holding two separate, exclusive single-event positions always loses money overall. Their quantities, purchase prices and settlement results matter. Nor does it imply that reaching $3,000 intraday and closing below $2,500 are exclusive. Observation identity is part of the rule.

This branch adds a deterministic, off-chain compatibility guard for one claim in one existing shared pool. It preserves deployed payout semantics, including VOID, and keeps the existing pricing function and contracts unchanged. It does not implement portfolio-level optimization, cross-pool claims or globally coherent agent forecasts.

## Code map

| Component | Files | Responsibility |
| --- | --- | --- |
| Semantic engine | `apps/web/server/semantic-validation.mjs` | Parse operator rules, enumerate feasible states, calculate ordinary and VOID payout bounds. |
| Manual endpoint | `apps/web/server/local-api.mjs` | Authenticated, same-origin `POST /api/{namespace}/validate-trade`, under existing account/access controls. |
| Agent endpoint | `apps/web/server/agents/runtime-api.mjs` | Credential-scoped `POST /api/agent-runtime/v1/markets/:namespace/validate-trade`; requires an allowed namespace and `markets:read`. |
| Prepared review | `apps/web/server/pilot.mjs` | Attach assessment and quoted purchase cost to buy preparation, including approval preparation. |
| Browser submission | `apps/web/src/pilot.ts` | Refresh the assessment before wallet submission and bind any acknowledgment to the reviewed mapping digest. |
| Manual UI | `apps/web/src/components/SemanticReview.tsx`, `apps/web/src/pages/Pilot.tsx` | Conflict warning, quoted cost, ordinary payout, separate VOID payout and typed acknowledgment. |
| Assisted agent UI | `apps/web/src/pages/Agents.tsx` | Pass the correct market namespace through shared submission. No collision override UI is added here. |
| TypeScript SDK | `packages/sdk/src/semantics.ts`, `src/node/{headless,executor,runner}.ts` | Validate assessment; check before purchase approval and buy signing; guard paper fills. |
| Python SDK | `packages/sdk-python/flurbo_sdk/semantics.py`, `runtime/{headless,executor,runner}.py` | Equivalent behavior. |
| Rust SDK | `packages/sdk-rust/src/semantics.rs`, `src/runtime/{headless,executor,runner}.rs` | Equivalent behavior. |
| C++ SDK | `packages/sdk-cpp/src/{chain,executor,runner}.cpp`, `include/flurbo/runtime.hpp` | Equivalent behavior. |
| Shared compatibility cases | `protocol/fixtures/semantics.json` | Cross-language binding, freshness, status and payout-matrix rejection cases. |
| API documentation | `protocol/openapi/agent-runtime.v1.yaml`, `protocol/specs/semantics.md` | Runtime route and behavioral contract. |

## Algorithm and trust model

1. The server loads `FLURBO_SEMANTIC_RULES_JSON`. Entries bind to an exact pool and its existing rules hash. Invalid configuration or a mismatched binding causes the check to fail.
2. Each event may have one reviewed integer predicate: `lt`, `lte`, `gt`, `gte` or `eq`. The predicate includes an observation identifier, threshold and explanatory `sourceRule`.
3. Predicates sharing one observation identifier must describe exactly the same underlying observation. Different identifiers are unconstrained relative to each other; this is not a declaration of statistical independence.
4. The engine enumerates all Boolean pool states. For each observation, values at every threshold and one integer on either side are sufficient to test the supported comparisons. A state is admissible when every observation group has a satisfying value.
5. The claim's scope and mask determine which states pay. If no admissible state pays, the result is a collision. The engine works on masks, not a client-provided AND/OR label.
6. Ordinary minimum and maximum payouts are calculated over admissible Boolean states. VOID is evaluated separately using existing uniform-completion payout rules. Semantically excluded completions are not removed from the contract's VOID average.
7. The response binds to the pool, rules hash, exact claim and quantity, plus a digest of the configured mapping. Its lifetime is sixty seconds.

The server supplies the admissibility decisions. SDKs validate the response binding, freshness, shape and mask-derived payout bits; they do not independently fetch and prove the correctness of real-world rules. Correct metadata and an uncompromised service are trust assumptions.

The metadata digest is not an on-chain commitment or a signature. Existing resolvers can still deliver answers inconsistent with that metadata. Do not describe the guard as a contract-level guarantee or as independent adjudication.

## Behavior that must remain explicit

| Situation | Manual buy | Updated autonomous SDK |
| --- | --- | --- |
| Reviewed collision | Warn; require exact typed acknowledgment tied to the current review and mapping. | Abort and log `SEMANTIC_COLLISION`. |
| Combination with incomplete coverage | Show that compatibility has not been verified; user may continue. | Abstain with `SEMANTICS_UNKNOWN`. |
| Single-event claim without coverage | May proceed without semantic assurance. | May proceed after a valid unknown response, without semantic assurance. |
| Missing, stale, invalid or inaccessible assessment | Stop submission and request a retry. | Abort new purchase with `SEMANTICS_UNAVAILABLE`. |
| Sell or redemption | Existing path. | Existing path. |
| Already-signed transaction | Existing reconciliation path. | Recovery may rebroadcast identical journaled bytes; do not re-sign as a new trade. |

The guard runs before the allowance approval in the normal agent execute path and again before signing a planned buy. Custom strategies using SDK execution are covered. A custom signer or direct contract call outside the SDK is not covered. An approval already sent before a rules change is not automatically revoked.

Paper runners use the same guard before recording a fill. Agents have no typed or configuration override for a known collision in this implementation. The existing spend/loss policies continue to apply independently.

## Release blocker: current market metadata

No reviewed mappings for public deployments are included. An empty configuration is supported but is not a production compatibility policy: updated agents will abstain on combined purchases.

Prepare a review record for every pool proposed for rollout:

| Required field | Review requirement |
| --- | --- |
| Namespace, chain, pool, resolver, rules hash | Verify against the hosted manifest and live deployment; record the verification block and time. |
| Event index and published rule | Preserve event order and exact Yes/No definitions. Do not rewrite rules to fit the checker. |
| Observation identity | Specify source, asset or event identity, timestamp or window, sampling, units, precision and rounding. |
| Predicate and threshold | Prove equivalence to the published rule, including strict versus inclusive boundaries. |
| Relationship coverage | Identify unsupported dependencies and ambiguities. A separate observation identifier is not a substitute for reviewing a relationship. |
| VOID and exceptional cases | Explain how missing or disputed evidence resolves under existing rules. |
| Reviewer and revision | Record who checked the mapping, when, source references and the mapping digest used in acceptance. |

Release questions and other natural-language events may not be representable honestly with the current scalar predicate language. Leave them unknown until a suitable representation and tests exist. Do not copy the synthetic local Anvil mapping into Render or invent unrelated observations solely to enable combination trading.

Save approved mappings as a versioned, reviewable public configuration artifact before entering them into Render. No production mapping artifact has been created by this branch.

## Remaining development

### Required before enabling this feature live

- Complete the deployment and rule review above. If a supported market cannot be represented, explicitly decide whether to keep automated combinations unavailable or extend the predicate model first.
- Add mapping-specific positive and negative fixtures, including boundaries, different observation windows and VOID outcomes.
- Confirm production request routing, auth, invite restrictions and agent-market allowlists for both endpoints.
- Rebase or merge current main into this branch and rerun checks before integration. The historical test results below do not certify future changes.
- Test paper behavior against the hosted candidate with real configuration in all four runtimes. No funded trade is required for this stage.
- Agree on the SDK upgrade schedule. There is no protocol-version bump or forced minimum-client-version mechanism in this change. Old clients can bypass the guard.
- Resolve or explicitly track the unrelated wallet-session browser assertion failure before claiming the full web suite is green.

### Separate probability-consistency gap

The reference agent still researches event pairs separately. Individually valid pair distributions may disagree on shared marginals or fail to admit any joint distribution over the full pool. This branch does not fix that.

A follow-up design should build one forecast per pool and observation snapshot, supported over admissible states, then derive all singles and combinations from that same distribution. For the current two-to-four-event pools this has at most sixteen ordinary states. If retaining separately supplied pair forecasts, check feasibility of nonnegative joint state weights summing to one whose marginals match the supplied forecasts. Reject or abstain on infeasibility; do not silently renormalize conflicting inputs into an alleged edge.

Add shared fixtures across all four languages for conflicting shared marginals, pairwise-consistent but jointly impossible sets, zero-probability conditioning, semantic support restrictions and stale evidence. Preserve explicit distinction between model forecasts, pool probabilities and executable quotes with trade-size impact.

### Other follow-ups, not completed here

- Richer typed relationships such as implication, mutual exclusion and release dependencies, with precise observation and rules binding. This needs a versioned schema and conformance cases, not title matching.
- A validated mapping management/check command and deployment diagnostics, avoiding manual JSON entry errors.
- Operational counters for abstention reasons and mapping coverage, without publishing account or position details.
- Evaluate the manual exception copy and accessibility with actual users. The typed acknowledgment is intentional friction, not proof that a user understood a trade.
- If stronger enforcement is desired, design contract or signer authorization separately. Existing deployed contracts cannot acquire this restriction through a frontend update.

## Validation performed

Passed locally on Windows:

- Web build and TypeScript SDK typechecks.
- Backend semantic-engine, manual-review, pilot and runtime endpoint regressions, including authenticated routes and invalid requests.
- Shared semantic fixtures and custom execution/signing rejection tests in TypeScript, Python, Rust and C++.
- Chrome desktop/mobile manual confirmation tests, including typed acknowledgment and no extra wallet submission before acknowledgment.
- Four TypeScript local Anvil integration tests: research/trade attribution, crash recovery, policy/pause/revocation, paper mode and concurrent reservations.

The local chain harness installs explicitly synthetic independent Boolean observations for its local deployment and restores the prior environment on normal shutdown. This is only a test fixture. The tests did not use public-network funds.

Not certified: full web suite, hosted endpoint behavior, hosted rule mappings, public-network agent trades or local-chain integration of all four languages after this patch. Rust and C++ checks in this work ran on Windows. A wallet-session browser test failed on its expectation for portfolio text absent from the current page; no fix to that unrelated test is included.

## Reproducing the focused checks

Use Node 24 or newer and install the repository dependencies required by each package. Commands below assume repository root unless enclosed in a subshell. These tests do not require production tokens or wallet keys.

```bash
npm --prefix apps/web run build
npm --prefix packages/sdk run typecheck
node --experimental-strip-types --test apps/web/tests/semantic-validation.test.ts apps/web/tests/semantic-review.test.ts apps/web/tests/pilot.test.ts apps/web/tests/agents-runtime-http.test.ts packages/sdk/test/semantics.test.ts
(cd packages/sdk-python && python -m unittest tests.test_semantics tests.test_runtime_units tests.test_conformance)
(cd packages/sdk-rust && cargo test --test semantics --test runtime_units --test conformance)
(cd packages/sdk-cpp && mingw32-make -j2 test)
```

Python must use a virtual environment with the package dependencies installed. C++ requires the compiler and OpenSSL setup in its README; use `make` instead of `mingw32-make` on the supported Unix setup.

For local-chain integration, put Anvil on PATH and build the required Foundry artifacts, including `LocalMulticall3`, `MockCollateral`, `PilotResolver` and `PilotPool`. The first local attempt failed because `LocalMulticall3.json` was missing; building that helper resolved the blocker. A Windows Foundry cache-directory/signature warning occurred after compilation, so verify the artifacts rather than treating that warning as a runtime test result.

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge build --use target/tools/solc-0.8.28.exe
node --experimental-strip-types --test packages/sdk/test/runtime-local.test.ts
```

Use the platform's installed Solidity compiler if that Windows-specific path is absent. The harness binds localhost test ports; do not point it at public RPCs. If a setup failure leaves a test process running, stop that test process and its child Anvil before rerunning.

Chrome test harness inputs are machine-specific:

```bash
export FLURBO_TEST_PLAYWRIGHT="/absolute/path/to/playwright-core/index.mjs"
export FLURBO_TEST_BROWSER="/absolute/path/to/chrome"
node --experimental-strip-types --test apps/web/tests/pilot-browser.test.ts apps/web/tests/markets-browser.test.ts
```

## Staged rollout

1. Keep this branch separate from production main until the required work above is complete. Check hosting auto-deploy settings before assigning this branch to any service.
2. Stop or pause compliant live agents; preserve their journals. Allow pending transactions to reconcile. Pausing cannot cancel an already-signed transaction.
3. Deploy a candidate backend/frontend with reviewed `FLURBO_SEMANTIC_RULES_JSON` on a test service. The value is public JSON, not a secret or signing key. No new wallet is needed.
4. Verify unauthorized callers are refused; authorized callers receive correct deployment and claim bindings. Check collision, ordinary allowed, unknown and invalid-configuration behavior with deliberate fixtures.
5. Verify manual collision acknowledgment is tied to the current review. Change the mapping on the candidate and confirm a stale acknowledgment cannot submit. Verify ordinary and VOID amounts and mobile layout.
6. Update each runtime to this branch's implementation and run paper mode. Confirm semantic collisions and unknown combinations abstain; compatible combinations still produce decisions when other policies permit them.
7. Verify existing sell, redemption and signed-transaction recovery still work. Review logs without recording tokens, keys or signed raw transactions in public artifacts.
8. Only after acceptance, integrate into the production branch, configure production mappings and deploy. Run one explicitly authorized, bounded testnet trade from a dedicated test wallet and verify the receipt, attribution and portfolio. Never execute a deliberately impossible funded trade just to prove rejection.
9. Resume agents gradually. Record release commit, server configuration digest, tested SDK revisions, acceptance results and any intentionally unsupported markets.

## Rollback and operational failure

Do not switch off checks in response to `SEMANTICS_UNKNOWN`; inspect the mapping and event definitions. An unavailable endpoint stops new updated-SDK purchases but does not prevent recovery. Check auth, namespace routing, rules-hash binding, mapping validity and clock skew.

If rollback is necessary, pause new agent actions first and retain journals. A server rollback that removes the endpoint will cause updated SDKs to stop new buys. Rolling SDKs back as well removes the protection and should be an explicit release decision, not an automatic fallback. Restore a previously reviewed mapping only when it still matches the deployment's rules. Clearing the configuration is not equivalent to restoring working combination trading.

No rollback requires changing contracts, settlement workers, reviewer wallets, balances or deployed pool addresses.
