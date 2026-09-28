# Semantic trade validation: disabled-by-default rollout

Status: integrated with main (901542a) behind `FLURBO_SEMANTIC_MODE`. **Enforcement is off by default and stays off in production** until the gates below pass. Merging this code does not turn the check on; enabling it is a separate, explicit configuration change.

Read with [the handoff](SEMANTIC_VALIDATION_HANDOFF.md) (algorithm, trust model, original release blockers) and [the specification](../protocol/specs/semantics.md#modes) (modes, response shape, startup validation). No semantic collision has been demonstrated in the currently reviewed markets (the pilot release events, Showcase v0 Ethereum block metrics and the rehearsal set). Threshold and range markets on one observation are the expected future application.

## Configuration

| Variable | Values | Effect |
|---|---|---|
| `FLURBO_SEMANTIC_MODE` | unset, empty or `off` (default) | Disabled. Rules are not read. Every valid request gets a claim-bound `mode: "disabled"` assessment; updated clients proceed and log `SEMANTICS_DISABLED`. The manual review shows no compatibility claim. |
| | `enforce` | Enforced. Rules are validated at startup and each assessment carries `mode: "enforced"` and a status. |
| | anything else | The server refuses to start. |
| `FLURBO_SEMANTIC_RULES_JSON` | public JSON, see the specification | Read only in `enforce` mode. Not a secret. |

In enforced mode the deploy fails on unreadable JSON, a wrong schema, more than 50 markets, or an entry without a valid lowercase pool address. A bad entry for a known pool (bad predicate, duplicate, or `rulesHash` mismatch) makes only that pool answer 503 `SEMANTICS_UNAVAILABLE`; other pools are unaffected.

Every assessment carries `configRevision`, a SHA-256 of the mode and (when enforced) the rules. The manual purchase flow asks for a new review if the revision changes between the review and the wallet prompt, including a mode switch.

Clients never read a failure as disabled. A network error, an error body, a stale or mismatched answer, a missing `mode` or `configRevision`, or any mode other than `disabled` or `enforced` stops the purchase with `SEMANTICS_UNAVAILABLE`.

### Operator diagnostics

- At startup the server logs `Semantic validation <mode> (revision <prefix>)` with each market's status, errors for misconfigured markets, and a warning for rules that name no known pool.
- `GET /api/semantic-status` returns the same information to the testing operator (401 without a login, 403 for other members). Statuses: `disabled`, `mapped`, `partial`, `unmapped`, `misconfigured`, with the reason.

## Rollout gates

Each step needs the previous one. Deploying code with the mode off is steps 1 to 3; enforcement starts only at step 6.

1. **Server before clients.** Deploy the server with the mode unset and confirm `/api/semantic-status` reports `disabled` and the startup log shows the revision. Updated SDKs against a server without the endpoint get a 404 and stop buying, so no updated SDK or native build ships before this.
2. **Disabled behavior.** On the deployed server, a manual buy and one paper-mode agent run per runtime proceed and log `SEMANTICS_DISABLED`. Sell, redeem and signed-transaction recovery are unchanged.
3. **Clients.** Release the SDKs and the web build. Native builds already installed keep their old behavior; new native builds pass the market namespace and show the acknowledgment.
4. **Reviewed mappings.** Write rules for each market from its published event definitions, with positive and negative fixtures (boundaries, observation windows, VOID). Check that every `rulesHash` matches the deployment.
5. **Candidate with enforcement.** On a test service, set `FLURBO_SEMANTIC_MODE=enforce` with the reviewed rules. Confirm `/api/semantic-status` shows every intended market as `mapped` and nothing `misconfigured`; exercise collision, compatible, unknown and misconfigured cases; confirm a changed mapping invalidates an earlier acknowledgment; run paper mode in all four runtimes.
6. **Production enforcement.** Only after steps 1 to 5 pass and the owner approves. Run one authorized, bounded testnet trade from a dedicated test wallet. Never fund a deliberately impossible trade to prove rejection.
7. **V2 redesign.** The final Pilot review UI must be reconciled with the unpublished V2 redesign before release. This is still an open integration check.

## Rollback

- **Turn enforcement off:** set `FLURBO_SEMANTIC_MODE=off` (or unset it) and restart. Updated clients proceed without semantic assurance and log `SEMANTICS_DISABLED`. This withdraws the protection; record it as a release decision.
- **Do not remove the endpoint.** Rolling the server back to a build without `/validate-trade` makes updated SDKs stop all new buys (`SEMANTICS_UNAVAILABLE`).
- **A bad mapping for one market:** fix or remove that entry. Startup validation already isolates it to its own pool.
- Pause agents before any rollback and keep their journals. No rollback touches contracts, settlement workers, reviewer wallets, balances or pool addresses.

## Results

Focused checks pass; ten browser failures also reproduce on main.

Run on Linux with Node 24.21 / npm 11, Anvil and Forge, the Rust analytics examples, Chromium 141 via playwright-core 1.56.1, Python 3, and OpenSSL 3.3 for C++.

| Suite | Result |
|---|---|
| Web typecheck and `npm test` | clean; 278 pass, 0 fail (browser tests skipped without Chrome) |
| Web with Chrome, all suites | 302 pass, 10 fail; the same 10 fail on main 901542a. The purchase-flow suites (`pilot-browser`, `markets-browser`, `agents-browser`) pass. |
| TypeScript SDK, including local chain | typecheck clean; 38 pass, 1 skipped |
| Python SDK, including local chain | 23 pass |
| Rust SDK, including local chain | all pass |
| C++ SDK | conformance 9/9, runtime units 12/12 (see below) |
| Mobile | `npm ci`, typecheck clean, 35 pass, Android bundle exports |
| OpenAPI | `scripts/check_protocol_documents.py` passes; it fails on the file as of e095e34 |

The ten browser tests that fail both here and on main 901542a:

| File | Test |
|---|---|
| `wallet-session-browser.test.ts` | Mera keeps linked wallets across pages and reload, while MetaMask restores silently and can switch |
| `what-if-browser.test.ts` | What-if stays read-only, replaces pending pairs, expires snapshots and fits mobile |
| `pilot-ledger-browser.test.ts` | account portfolio discovers older combinations on refresh without repeated background scans |
| `pilot-ledger-browser.test.ts` | combined shares appear in a fresh browser before history responds, with no saved trade hints |
| `pilot-ledger-browser.test.ts` | portfolio pool isolation and linked-wallet changes survive late replies |
| `pilot-ledger-browser.test.ts` | portfolio shares one discovery read across linked wallets, bounds reads and batches, and cancels work on leaving |
| `pilot-ledger-browser.test.ts` | practice history outage still shows owned shares through the retired history route; failed reads clear prior holdings |
| `practice-collections-browser.test.ts` | directory and portfolio include multiple pools without a collection selector |
| `showcase-browser.test.ts` | landing example and unified directory work on desktop and mobile without losing October |
| `workspace-browser.test.ts` | portfolio deep links and the retired history route restore auth, show full discovered claims and isolate wallet and market changes |

C++ does not build on Linux on main either (`Value(long)` duplicates `Value(int64_t)` in `json.hpp`, and OpenSSL 3.2 or newer is required). The local run removed that overload temporarily and reverted it. CI runs C++ unmodified on the supported platform, Windows MSYS2 UCRT64.

### Reproducing

With Node 24 on PATH, from the repository root:

```bash
# Rust analytics used by the server tests (as in apps/web/Dockerfile)
cargo build --locked -p flurbo-core --examples
cargo build --locked --release -p flurbo-core --example parlay_compare --example pair_analytics --example parlay_testnet_model
mkdir -p bin
cp target/release/examples/parlay_compare bin/flurbo-parlay-compare
cp target/release/examples/pair_analytics bin/flurbo-pair-analytics
cp target/release/examples/parlay_testnet_model bin/flurbo-learning-model

# Web, including every browser suite
(cd apps/web && npm ci && npm run typecheck && npx vite build)
export FLURBO_TEST_PLAYWRIGHT=/absolute/path/to/playwright-core/index.mjs   # playwright-core@1.56.1
export FLURBO_TEST_BROWSER=/absolute/path/to/chrome
(cd apps/web && node --experimental-strip-types --test tests/*.test.ts)

# SDKs (Anvil on PATH; forge build needs contracts/ dependencies)
npm --prefix packages/sdk ci && npm --prefix contracts ci && forge build
(cd packages/sdk && npm run typecheck && npm test)
python3 -m pip install -e packages/sdk-python && (cd packages/sdk-python && python3 -m unittest discover -s tests)
(cd packages/sdk-rust && cargo test --locked)
(cd packages/sdk-cpp && make test)   # supported on MSYS2 UCRT64

# Mobile
(cd apps/mobile && npm ci && npm run typecheck && npm test && npx expo export --platform android --output-dir /tmp/mobile-bundle)

# Protocol documents (needs PyYAML)
python3 scripts/check_protocol_documents.py
```

To compare against main, run the web command in a worktree of 901542a (`git worktree add ../flurbo-main 901542a`) with the same Rust binaries and browser variables. The same ten tests fail there.

## CI

`.github/workflows/checks.yml` runs on pull requests and pushes to main:

- **web:** Rust analytics, `npm ci`, typecheck, `npm test` (disabled and enforced modes), the three purchase-flow browser suites, and the protocol document check. The other browser suites are left out because they fail on main.
- **sdks:** TypeScript, Python and Rust against the local chain.
- **sdk-cpp:** Windows MSYS2 UCRT64, `make test`.
- **mobile:** `npm ci`, typecheck, tests and an Android bundle export.
