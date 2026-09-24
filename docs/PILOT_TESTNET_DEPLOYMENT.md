# Real-event pilot deployment

Checkpoint: 2026-09-24. Implemented and locally tested, **not publicly deployed**.
The current original and learning pools remain synthetic. Their positions,
Kuru pair, history and settlement paths are unchanged.

## Scope and trust

One new pool prices supported claims over two or three real events. Claims in
this cluster share its factored cost function and AUSD collateral. This does
not support combinations across different pools. The pilot UI composes YES/NO
legs with AND or OR. It does not implement tradable conditional securities.

The resolver is a custom optimistic testnet contract, not UMA, Reality.eth or
Kleros. Public assertions and challenges require the fixed test AUSD bond.
A fixed panel of three or five named reviewers decides disputes with two or
three matching votes respectively. The selected alpha is single-operator mode: all three reviewer wallets are controlled by the creator. Two matching wallet votes are required, but this is centralized operator resolution. An independent panel remains a separate supported configuration.
Test faucet tokens do not establish economic security or Sybil resistance.
Reviewers cannot assert or challenge using their registered addresses; the
contract cannot detect another wallet controlled by the same person.

The creator commits the ordered questions, sources, deadlines, panel, bond and
void policy before funding. There is no creator outcome override, reviewer
rotation, upgrade, appeals round or sponsor withdrawal. A fresh pool is required
for changed rules. Anyone can finalize elapsed deadlines or deliver all final
outcomes. The site is not a keeper: somebody must submit those transactions.

An assertion is allowed after the event's observation window. An unchallenged
assertion wins when its challenge period elapses. A challenge opens the fixed
voting period. No assertion, or no matching voting majority by the deadline,
results in VOID. A majority decision can be YES, NO or VOID. Unchallenged bonds
return to the asserter. If a voted result matches a party, that party receives
both bonds. A third outcome or voting timeout returns each party's bond.
Bond credits require an explicit withdrawal transaction.

## Void payouts

Valid outcomes stay fixed. Each void bit has equal YES/NO weight. A claim pays
the average of its truth table over compatible states, not its purchase price.
For example, A YES AND B YES pays 0.5 AUSD per share when A is YES and B is VOID,
0 when A is NO and B is VOID, and 0.25 when both are VOID. The reserve rounds
up; each redemption rounds down to six-decimal AUSD atoms. Splitting redemption
cannot increase payout. Dust stays reserved. Transferred receipt tokens retain
the same backing and must be unwrapped before pool redemption.

## Required human inputs

1. Public signing addresses and an accurate control declaration. For this alpha, the user supplied three operator-controlled reviewer wallets. Never supply private keys.
2. Two or three exact release targets and future UTC windows. Supported source
   templates are `ethereum/go-ethereum` and `paradigmxyz/reth` stable GitHub
   releases with an exact `vMAJOR.MINOR.PATCH` tag. Release publication is not
   chain activation. Previously observed releases are not future events.
3. A trading close before every observation starts, reviewed dispute durations,
   bond amount, and acknowledgement of the uniform-void policy. Missing API data
   is not proof of NO; deletions, revisions and ambiguity require review.
4. The deployer's wallet confirmations, test AUSD subsidy and test MON fees.

Multiple wallets owned by one person do not constitute an independent panel. Use `reviewerControl: "single-operator"` and `independentReviewersConfirmed: false` for this alpha. This disclosure is included in the committed rule text and prominently shown in the UI. Do not claim these wallets represent independent people. The implementation cannot verify real-world control.

## Preparation and deployment (Git Bash)

Run from `~/Flurbo`. First write `target/deployments/pilot-selection.json` with
the fields below after the people and rules have actually been reviewed. The
list is a schema guide, not ready-to-deploy values:

| Field | Value |
| --- | --- |
| `creator` | Public deployer address |
| `clusterId`, `title` | Stable identifier and readable title |
| `closesAt` | UTC Unix seconds, between one hour and thirty days ahead |
| `reviewers` | Three or five objects with `name` and `address` |
| `reviewerControl` | `single-operator` for this alpha; `independent-panel` only for an actual independent panel |
| `independentReviewersConfirmed` | `false` in single-operator mode; `true` for a declared independent panel |
| `rulesReviewed` | Literal `true` only after the questions, dates and policies have been reviewed |
| `bondAtoms` | Positive decimal string, at most eight digits; 1000000 is 1 test AUSD |
| `assertionPeriod` | Seconds, 1 hour to 30 days |
| `challengePeriod`, `votingPeriod` | Seconds, 1 hour to 7 days |
| `events` | Two or three objects: `id`, `target: {repository, tag}`, `observationStartsAt`, `observationEndsAt` |

Observation ends must be within ninety days of preparation. Use durations that
allow all named reviewers to participate. Generate exact template wording and
read the resulting publication before preparing the deployment:

```bash
cd ~/Flurbo
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
mkdir -p target/deployments
bun workflows/cre/scripts/create-pilot-publication.ts target/deployments/pilot-selection.json > target/deployments/pilot-publication.json
bun workflows/cre/scripts/prepare-pilot.ts target/deployments/pilot-publication.json > target/deployments/pilot-prepared.json
```

Stop on any failed command. Check the exact addresses, question wording, windows
and policies in both output files. Files under `target/` are ignored artifacts.
The approved selection is `config/pilot-alpha-selection.json`; see [the five-day alpha plan](ALPHA_TESTNET_LAUNCH.md). Keep a durable copy of the final public rules and manifest outside build caches.

The fixed liquidity parameter is 10 AUSD. Initial subsidy is 13.862944 test AUSD
for two events or 20.794416 for three. It is consumed by funding the pool; gas,
later trading, assertion bonds and Kuru seed inventory are additional.

Simulate first, inspect the trace and only then run the broadcast:

```bash
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
forge script contracts/script/DeployPilot.s.sol:DeployPilot --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER"
# Only after reviewing the successful simulation:
forge script contracts/script/DeployPilot.s.sol:DeployPilot --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow
bun workflows/cre/scripts/verify-pilot.ts
```

Never rerun a partly broadcast deployment blindly. Inspect its transaction
receipts and Foundry broadcast artifact first. The dry run also writes an
unverified manifest; that file is not evidence that contracts exist publicly.
Verification checks the exact compiled runtime, all immutable configuration,
fresh block and chain, binding, empty initial positions, subsidy and canonical
receipts. Verify immediately before trading or seeding Kuru. Verification is
intentionally an initial-publication check, not a way to replace the index's
starting block after activity begins.

The verified output is `target/deployments/pilot-testnet.json`. Supply its exact
JSON as Render's `FLURBO_PILOT_MANIFEST_JSON` only after verification and the
release gates below. Keep existing original/learning manifests. Existing Redis
and public-testnet RPC settings are reused. With no pilot manifest, the site
continues serving existing pools and `/events` explains that publication is
pending. A malformed configured manifest fails startup rather than inventing
another market. Removing this variable stops new pilot UI actions but does not
cancel the contracts or their on-chain deadlines. Preserve manifest access for
holders and operate finalization/redemption if the UI is unavailable.

## CRE evidence gate

The `pilot` CRE target reads the configured pool/resolver binding from Monad and
retrieves the reviewed GitHub endpoint using the CRE HTTP capability. Output is
candidate evidence, not an authenticated settlement report or a transaction.
The synthetic target remains separate.

The verifier writes `pilot-cre.json` and an initial `pilot-cre-trigger.json`.
Refresh the trigger before every simulation; it is valid for at most 180 seconds:

```bash
bun workflows/cre/scripts/refresh-pilot-trigger.ts YOUR_REVIEWED_EVENT_ID
cd workflows/cre
cre workflow simulate . --target pilot --non-interactive --trigger-index 0 --http-payload ../../target/deployments/pilot-cre-trigger.json
cd ../..
```

No `--broadcast`. Archive the actual CLI output and source payload. The evidence
form can store an attachment with an assertion, but it does not authenticate an
operator-pasted file as a DON-signed result. WASM compilation and unit tests have
passed. A successful live pilot simulation, operated collection schedule and
authenticated automated delivery have **not** been demonstrated. Do not claim
full CRE partner completion or automatic resolution from these checks.

## Kuru gate

Pilot YES receipts have passed tests against actual Kuru contracts on a pinned
local Monad testnet fork. They require new pairs. The original H YES pair must
never be relabelled or used for these events.

`DeployPilotKuru.s.sol` prepares one explicitly selected event's pair with
10 YES shares, a 2-share bid at 0.45 and a 2-share ask at 0.50. These are operator
test offers, not probabilities. It buys and wraps inventory, deposits 0.9 test
AUSD plus two receipts, places post-only orders and clears token approvals.
It needs at least 11 additional test AUSD and MON. It emits only an **unverified**
pair artifact. Do not broadcast this script as part of pilot launch yet: a
separate pair verification and hosted pilot-pair routing are still required.
The current `/kuru` page deliberately continues to operate the original pair.

## Hosted acceptance

Mera remains mandatory for Flurbo login. A selected Mera wallet or extension
wallet signs actions; balances and eligibility belong to that selected address.
Reviewing is read-only. An allowance approval and its intended action need
separate confirmation and a fresh review. Reviews show a five-minute deadline,
maximum spend or minimum proceeds and a capped MON fee estimate. Changed fees,
wallet identity, snapshot or deployment require another review.

Before inviting users, record actual public transaction hashes for:

- Two distinct test wallets buy and sell single and combined claims; `/portfolio`
  and `/history` show the correct wallet and pool across refresh and login.
- An asserter publishes retrievable evidence, approves the exact bond, asserts,
  and receives its credit after an unchallenged result.
- A different wallet challenges; registered reviewers inspect both records and
  reach quorum. Duplicate/ineligible/late votes are rejected.
- A separate rehearsal proves no assertion and no quorum become VOID at the
  deadlines. Do not deliberately spoil a live event merely to test this path.
- Anyone delivers only after all events finalize. Winning, losing and mixed
  void claims redeem correctly; bond withdrawals and selected-wallet balances
  agree with receipts.
- Wallet rejection, network error, unknown submission outcome, refresh, locked
  Mera signing and insufficient funds cannot silently resubmit a transaction.
  Attach the hash from wallet activity if submission outcome is unknown.
- Kuru receipts fill/cancel/withdraw/unwrap/redeem against the separately
  verified pilot pair, once that route is implemented and enabled.

Two observed canonical confirmations are a UI tracking rule, not finality.
Keep pending tracking until the exact sender, target, calldata, nonce, chain and
canonical receipt match. Never clear ambiguous tracking just to make a button
clickable again.

## Operations and limits

Evidence is content-addressed JSON persisted in Redis without a TTL. Reads are
public; uploads require login. New uploads are limited to twenty per account
per hour and two hundred globally per hour. Reusing identical evidence is free.
This bounds accidental storage growth; it does not prove unique people. Back up
Redis evidence and maintain the public domain after settlement. A content hash
detects changed bytes, not a dishonest source or a missing backup.

The separate persistent pilot index uses canonical block checks, two-block lag,
compare-and-swap checkpoints and reorg rebuilding. A request scans at most 1,000
blocks in 100-block windows. Repeat refresh while explicitly incomplete; do not
treat incomplete history as proof of zero holdings. Its stored history is capped
at 750 KB and fails explicitly at capacity. This is a bounded pilot index, not
an Envio production-scale deployment. Monitor backlog, Redis and RPC usage.

## Recorded verification

- Full offline Solidity suite: 284 passing tests, including fuzzed settlement,
  bond conservation, deadlines, exact transfers and deployment binding.
- Kuru fork: four passing pilot tests at block 64729226, including a filled
  receipt's void payout. No public transaction was broadcast.
- Isolated Anvil end-to-end: deployed compiled contracts, verified runtime and
  config, bought/sold, stored evidence, asserted/disputed/voted, timed out a
  second event, delivered, redeemed and withdrew the bond.
- Hosted API and wallet tests cover authorization, own-signer policy, numeric
  nonces, immutable storage, review limits, receipt identity and reorg indexing.
- Browser fixture test covers desktop/mobile layout, login guard, review versus
  send, one submission and recovery after reload. It uses a simulated wallet;
  it does not replace public Firefox/MetaMask and Mera acceptance.
- CRE unit tests and type checking pass; the observer compiles to WASM. The
  remaining live simulation/delivery gate is explicit above.

These checks are not an independent contract audit. The pilot is testnet-only and operator-run.
Native mobile, tradable conditional claims, historical learning experiments,
external-oracle integration and remaining partner criteria are separate work.

Use [the small commit sequence](PILOT_COMMIT_STEPS.md). No commits or public
broadcasts were performed by the coding agent.
