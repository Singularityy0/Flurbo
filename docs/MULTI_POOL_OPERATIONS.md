# Listing and settling many pools

One committed file, `config/collections.json`, lists every collection. The site shows it, the monitor watches it and the settlement bot settles it. Any number of pools can be deployed in one run, and the bot settles all of them in the same cycle. This replaces the environment bundles (`FLURBO_PRACTICE_COLLECTIONS_JSON`, `FLURBO_RESOLUTION_MANIFEST_JSON` and the finish allowlist). Those keep working while `FLURBO_COLLECTIONS_SOURCE` is unset, which is also the rollback.

Each pool is still its own contract pair, with its own prices, collateral, trading close and payout, and 2 to 4 questions. Combinations never span pools.

## The registry file

```json
{
  "schema": "flurbo.collections.v1",
  "featured": "0x...pool shown first on the site",
  "pilotSettlement": "finish-only",
  "collections": [
    { "label": "Jobs Friday", "settlement": "auto", "status": "active", "manifest": { "...verified manifest..." } }
  ]
}
```

| Field | Values |
|---|---|
| `settlement` | `auto`: the bot reads the committed sources and asserts answers. `finish-only`: the bot only finalizes elapsed deadlines and delivers results. `off`: the bot leaves the pool alone |
| `status` | `active`: listed on the site. `retired`: not listed. A retired pool is still watched and settled unless its settlement is `off` |
| `featured` | The pool the site features; must be active |
| `pilotSettlement` | How the bot treats the release pilot (`config/pilot-testnet.json` or `FLURBO_PILOT_MANIFEST_JSON`) |

The file holds public deployment data only; secrets and switches stay in the Render environment. Changing the file means a commit, which is the review gate. Every chain read re-checks each pool's contract code, rules hash and binding against its manifest. A pool set to `auto` may not ask for a bond above 10 test AUSD.

## Listing pools, step by step

Steps marked "you" are yours. The others are scripts that only read and write local files and read the chain.

1. **Describe the pools** in a batch file, for example `config/markets/<name>.json` (schema below). Pools prepared by their own scripts, such as `prepare-wave2.ts`, can skip to step 3; their prepared files use the same format.
2. **Prepare:** `bun workflows/cre/scripts/batch.ts prepare --spec config/markets/<name>.json [--pools a,b]`. Every rule is run through the rule check. A pool is refused if a rule is invalid or already public, or fails in a way the batch file does not list as expected before the release. Writes `target/deployments/<id>-prepared.json` and `<id>-listing.json`.
3. **Check before deploying:** `bun workflows/cre/scripts/batch.ts check --ids a,b`. Checks each close against now (deploys need more than an hour), reruns the rule checks, and refuses pools already deployed or registered. It also totals the funding (b x questions x ln 2) against the deployer's test AUSD, and requires 3 MON per pool. It prints the deploy command.
4. **Deploy (you):** one run for the whole batch, one keystore prompt:
   ```bash
   FOUNDRY_PROFILE=demo FLURBO_DEPLOYER=0xf1fea08ebba92ed342acc5639db312c3694bc391 FLURBO_DEPLOY_IDS=a,b forge script contracts/script/DeployPilotBatch.s.sol:DeployPilotBatch --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender 0xf1fea08ebba92ed342acc5639db312c3694bc391 --broadcast --slow
   ```
   The script checks every pool and the batch's total funding before the first transaction. It refuses a pool that already has `<id>-unverified.json`, so a batch cannot be deployed twice. If a broadcast fails part way, `verify` shows which pools reached the chain. Move the unverified file of any pool that did not, then deploy it again. Running the same command without `--account` and `--broadcast` simulates the batch first and spends nothing.
5. **Verify:** `bun workflows/cre/scripts/batch.ts verify --ids a,b` checks each deployment against the chain and writes `<id>-testnet.json`.
6. **Register:** `bun workflows/cre/scripts/batch.ts register --ids a,b [--feature a] [--settlement auto]`. The label and settlement default to the batch file's values, or to the draft title and `auto`.
7. **Commit `config/collections.json` (you).** Render redeploys on merge. The site lists the new pools, the monitor watches them and the bot settles them, with no environment edits.

Other registry edits: `batch.ts set <pool or label> settlement=finish-only`, `status=retired`, or `featured`.

## Batch file

```json
{
  "schema": "flurbo.market-batch.v1",
  "defaults": { "assertionPeriod": 43200, "challengePeriod": 3600, "votingPeriod": 3600, "bond": "1", "settlement": "auto" },
  "pools": [
    {
      "id": "jobs-friday", "title": "Jobs Friday", "label": "Jobs Friday", "closesAt": "2026-10-02T12:00:00Z", "b": "100",
      "rules": [
        {
          "eventId": "us-unemployment-sep", "question": "Will ...?",
          "source": { "id": "...", "publisher": "...", "urls": ["https://..."], "adapter": "json-api.v1", "reader": { } },
          "observation": { "series": "...", "period": "2026-09", "unit": "percent" },
          "decision": { "type": "number", "operator": "gte", "value": "4.2" },
          "window": { "opens": "2026-10-02T12:35:00Z", "closes": "2026-10-02T16:30:00Z" },
          "expectPending": ["EXTRACTION_AMBIGUOUS_OR_MISSING"]
        }
      ]
    }
  ]
}
```

- `id` names the files (`target/deployments/<id>-*.json`), so use lowercase letters, digits and hyphens.
- `b` and `bond` are in test AUSD.
- Times may be ISO strings in UTC. This applies to `closesAt`, the window, and the reader's `at` and `until`.
- `window` is the capture window. The answer becomes final at `closes` plus the challenge period.
- The vintage defaults to `first-observed-snapshot`.
- `expectPending` lists the rule check reasons that are normal before a release: `SOURCE_FETCH_FAILED` for a 404, `SOURCE_EMPTY`, `EXTRACTION_AMBIGUOUS_OR_MISSING` for a missing row, and `OBSERVATION_IDENTITY_MISMATCH` for an anchor that is not on the page yet.

## Render cutover (one time)

1. Merge the code and `config/collections.json`. The file was started from the production bundle with `batch.ts import`: Showcase v0, pre-test-v1 and pre-test-v2, all `finish-only`, with pre-test-v2 featured. Its rules hashes match production's `/healthz`.
2. On Render, add `FLURBO_COLLECTIONS_SOURCE=registry`. Keep these as they are:
   - `FLURBO_RESOLUTION_SIGNER_ADDRESS` and `FLURBO_RESOLUTION_PRIVATE_KEY`
   - `FLURBO_RESOLUTION_EXECUTE` and `FLURBO_RESOLUTION_PROPOSALS`
   - `FLURBO_RESOLUTION_EVIDENCE_ORIGIN`, which is required while any deterministic pool is registered
3. After the redeploy, check `/healthz`. `practice_collections` should match the file, and the Render logs should show `[settlement-worker]` lines with `"mode":"registry"`.
4. Leave the old variables in place for a day as the rollback, then delete them: `FLURBO_PRACTICE_COLLECTIONS_JSON`, `FLURBO_PRACTICE_ACTIVE_POOL`, `FLURBO_RESOLUTION_POOL`, `FLURBO_RESOLUTION_RULES_HASH`, `FLURBO_RESOLUTION_MANIFEST_JSON`, `FLURBO_RESOLUTION_FINISH_ALLOWLIST`, `FLURBO_RESOLUTION_COLLECTIONS_JSON` and `FLURBO_RESOLUTION_SOURCE_MODE`. Registry mode ignores them.

Rollback: remove `FLURBO_COLLECTIONS_SOURCE`. Everything reads the environment bundles again.

## How the bot handles many pools

- **One cycle covers every pool.** Each `auto` pool reads its sources while one of its capture windows is open, and only then. All due actions across pools go into one queue, earliest deadline first.
- **One signer, one pending transaction.** The settlement signer keeps one journal and one pending transaction at a time. A cycle can submit up to 12 transactions in a row, so a burst of assertions takes two or three cycles.
- **Isolation.** A pool whose source or chain read fails is skipped and reported; the others carry on.
- **Hold (kill switch).** `FLURBO_RESOLUTION_HOLD=0xpool,0xpool` on Render stops the bot asserting for those pools. They keep collecting evidence, and elapsed deadlines are still finalized. Use it when a source looks wrong, for example a changed result file layout. Then assert by hand or let the question go VOID.
- **Cost on free tiers.**
  - The monitor re-reads a pool far from its next action about every 8 minutes, instead of every 2.
  - It reads a delivered pool once per restart, and a delivered pool no longer raises a gap alarm after a restart.
  - The worker skips chain reads for pools with nothing due.
  - Pool reads stay one batched Multicall call.
  - Once a rule's capture is retained, its stored capture history is not re-read every cycle.
