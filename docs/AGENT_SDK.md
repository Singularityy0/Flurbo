# Flurbo agents (testnet beta)

Invite-only Monad testnet preview with test assets. Not a mainnet product and not a promise of profit.

## Autonomous agents (primary)

Developers build their own agents with the Flurbo SDK and run them on their own computer or infrastructure. An agent discovers markets, retrieves evidence, asks a model or custom code for a structured joint forecast, compares it with the pool's executable prices, applies deterministic policy limits and trades from its own dedicated wallet, without a browser or a MetaMask confirmation per trade. Flurbo shows its status, decisions and verified trades under the owner's Mera account.

1. Sign in with Mera and register the agent on /agents.
2. Link a dedicated agent wallet with a fresh, domain-bound ownership proof (signed where the agent runs).
3. Issue a scoped, expiring API credential (shown once).
4. Fund the agent wallet with test AUSD and MON for gas.
5. Configure the runtime (markets, research provider, strategy, limits) and start it: `flurbo-agent start`.
6. Allow live trades on the agent page when ready; until then it records paper decisions.

- **Architecture and gap assessment:** [AGENT_PLATFORM.md](AGENT_PLATFORM.md). **Progress by stage and language:** [AGENT_PLATFORM_PROGRESS.md](AGENT_PLATFORM_PROGRESS.md).
- **Protocol shared by every SDK:** [protocol/](../protocol) (numbers, claims, contracts, credentials, transactions and recovery, research, OpenAPI, schemas, golden fixtures).
- **SDKs and runtimes**, one per language, all running the same protocol fixtures and the same journal format, configuration file and command set:

  | Language | Package | Runner |
  | --- | --- | --- |
  | TypeScript (reference) | [packages/sdk](../packages/sdk/README.md) | `flurbo-agent` |
  | Python | [packages/sdk-python](../packages/sdk-python/README.md) | `python -m flurbo_sdk` |
  | Rust | [packages/sdk-rust](../packages/sdk-rust/README.md) | `flurbo-agent-rs` |
  | C++ | [packages/sdk-cpp](../packages/sdk-cpp/README.md) | `flurbo-agent-cpp` |

  `node protocol/tools/conformance.mjs` runs the shared fixtures in all four languages; add `--full` for every unit and local-chain suite.
- **Control model.** Credentials read and report; they never sign, move funds or reach settlement actions. Keys stay on the operator's machine. Policies are software checks in a compliant runtime; the funded wallet bounds what is at risk. Pause and revocation stop a compliant runtime from starting new actions; they are not on-chain freezes, and a transaction already sent can still confirm.
- **Attribution.** Only transactions the runtime reports, sent from the wallet associated at their block time and verified on-chain by Flurbo count as agent trades, each counted once across every agent, account and flow. Other wallet activity is not agent performance. Forecasts, evidence and abstentions are shown as self-reported.

**Acceptance demonstration** (local anvil chain, nothing hosted, no funded wallets): from the repository root run `forge build`, then `cd packages/sdk && npm ci && node tools/acceptance-demo.ts`. It starts an agent outside the browser, has it retrieve evidence and produce a validated forecast, trades without per-trade approval, recovers a signed but unsent transaction without duplicating it, and shows Flurbo's verification, a policy rejection, an abstention, a pause and a revoked credential. Without `FLURBO_DEMO_BASE_URL`, `FLURBO_DEMO_MODEL` and `FLURBO_DEMO_API_KEY_ENV` its forecaster is a labelled fixture, not AI.

## Assisted agents (secondary)

The earlier workflow remains available: you enter a joint forecast, the server evaluates it, and trades are paper or approved one by one in MetaMask.

### What is implemented

- **Agent profiles.** Create, pause, resume, switch between paper-only and proposal modes, and delete. Profiles and records are stored server-side per Mera account. Another account cannot read or change them.
- **Structured forecasts.** You enter the chance of each of two events and the chance that both happen, plus evidence, reasoning and uncertainty. The joint forecast must be internally consistent; contradictory input is rejected. Your self-reported confidence is shown as self-reported, not calibrated.
- **Reference strategy (joint edge v1).** The server reads quotes from the pool contract at one snapshot block for every claim your forecast covers, then proposes the claim with the largest estimated edge after the full slippage allowance, or abstains with reasons.
- **Paper trades.** Simulated fills at the quoted cost, labelled as paper everywhere, never on-chain.
- **User-approved purchases.** In proposal mode the agent prepares an unsigned review through Flurbo's existing transaction preparation. You confirm in MetaMask. A token approval is a separate first step and is not a purchase. Only a verified receipt for the exact reviewed purchase marks it confirmed.
- **Activity and results.** Decisions, paper trades and proposal statuses, with paper results and confirmed agent-originated purchases shown separately.

### Limits and honest accounting

- Assisted agents never sign, hold keys or trade automatically; MetaMask confirms each trade. Autonomous agents sign only with their own dedicated wallet on the operator's machine, described above.
- Claims are limited to one pool and one to three events, using the canonical Flurbo combination model. Different pools never combine.
- A forecast probability is not a market price. The pool's model-implied probability is not an executable price. The average price per share at a given size is a finite purchase cost, not a probability.
- Estimated edge assumes no VOID outcome and excludes gas. It is not a promise of profit or accuracy.
- Realized results, collected payouts and payout collection belong to each wallet in Portfolio and are not attributed to an agent.
- Trades are public on-chain. Agents do not make participation private.
- Agents cannot assert, challenge, vote on or settle markets.

### Proposal lifecycle and recovery

- **One proposal per decision, across servers.** Preparing a proposal first reserves its decision under the account lock (status `preparing`, 60 seconds). A second request for the same decision gets `PROPOSAL_EXISTS` and prepares nothing. A failed preparation becomes `preparation-failed`; a reservation that lapses (for example, a server stopped mid-way) becomes `preparation-expired` and cannot turn live afterwards. Either may be retried.
- **No stale overwrites.** Every proposal has a `version`. A refresh or other change computed from an older read is refused with `PROPOSAL_CHANGED`. Writes are compare-and-set, so a server whose lock lapsed cannot overwrite newer state.
- **Transactions are bound to their review.** Registering a hash names the exact reviewed transaction that was sent. Every review a proposal ever issued is kept, so a review replaced by any number of refreshes, an expired review, or one on a dismissed proposal can still be matched: none of these proves the transaction was never sent.
- **Recording is provisional; ownership is verified.** Recording a hash only tracks it on that proposal (one tracked transaction per proposal at a time) and blocks nobody else, so a wrong or mistaken claim cannot lock out the proposal the transaction belongs to. Ownership of a transaction (one proposal per chain and hash, across all agents and accounts) is written only when the server's receipt check proves the on-chain transaction is that proposal's reviewed transaction, in the same atomic step as the purchase it counts. After that, any other proposal gets `HASH_CONFLICT`. If two proposals carried an identical reviewed transaction, the first verified owns it and the other returns to its earlier state without counting it. Unknown and pending hashes stay tracked and recoverable without owning anything.
- **Older records are reconciled.** Agent states written before verified ownership are reconciled before they are shown or changed: each verified transaction claims ownership if nobody holds it, and a purchase already owned by another proposal is taken back out of this agent's totals (status "attributed elsewhere"), keeping the transaction as evidence. This is idempotent and safe to run concurrently. Totals rebuilt from the old 100-record list are reported as incomplete (`complete: false`) when that list was full.
- **Recovery after a failed request or reload.** The browser keeps MetaMask's hash locally until the server has recorded it against the matching proposal (same account, wallet, chain, pool and transaction) and resolved it. On reload it records the hash again and verifies the receipt; it never asks MetaMask to send again. A conflicting hash is shown explicitly.
- **Records that are kept.** The activity feed keeps the newest 100 decisions and 100 paper trades. A proposal that issued a review is never dropped; older resolved ones are compacted to what recovery and accounting need. Paper totals (fills, cost, per-claim positions) and confirmed purchase totals are running totals, so results and the paper budget stay complete. Records saved before this change are converted on the next change.
- **Deleting archives.** A deleted agent stops evaluating and proposing and its activity feed is cleared, but its proposals, reviews, transactions and totals are kept. It is listed under Archived agents, where a transaction already sent can still be recorded and verified.
- **Limits.** 10 active agents and 50 including archived ones per account; 200 transaction reviews per agent. Reaching a limit is refused explicitly; nothing needed for recovery is discarded to make room.
- **Hosted storage check.** `apps/web/scripts/check-agent-redis.mjs` exercises the locks, Lua scripts, MGET, expiring keys and GETDEL against a real Redis-compatible test database: agent state and transaction ownership, agent wallet claims (including concurrent claims across accounts and release on archive), single-use expiring wallet challenges, and credential revocation and rotation under concurrent use (`FLURBO_AGENT_REDIS_CHECK=1` plus the Upstash REST URL and token of that test database). It writes only throwaway keys under `flurbo:agents:v1:` and removes them. On 2026-09-27 its 17-check version passed on a local Redis 7.4.11 and on an Upstash test database, removing every key it wrote. The current version adds an 18th check (an agent wallet claim is refused atomically while the wallet is linked for manual trading); on 2026-09-27 it passed all 18 checks on a local Redis 7.4.11 and on the Upstash test database, removing every key it wrote. The agent test suites also run against a local, isolated Redis: `FLURBO_TEST_REDIS_URL=redis://127.0.0.1:<port>/0 npm test` (each test uses its own random key namespace).

## Migration notes

- **SDK 0.1 to 0.2 (TypeScript).** Additive: every 0.1 export is unchanged. New are the protocol modules (ABI, policy, recovery, effects, research validation, transactions), the Node runtime at `@flurbo/sdk/node`, the `flurbo-agent` command and a dependency on `viem` (run `npm ci` in `packages/sdk`). `npm run example` now runs the offline autonomous pipeline; `examples/offline-research.ts` still exists.
- **Existing agents** keep working as assisted agents with the same records. An autonomous agent is registered separately on /agents as an agent that runs on your own infrastructure; assisted agents are not converted.
- **Hosted rollout.** The runtime API adds keys under the existing `flurbo:agents:v1:` namespace (credentials stored as digests, wallet associations and challenges, runtime heartbeats and decisions, execution ownership shared with browser proposals). Before enabling it on a hosted deployment, run `apps/web/scripts/check-agent-redis.mjs` against a Redis-compatible test namespace, and set `FLURBO_AGENT_RESERVED_WALLETS` to every operator wallet that is not already in a deployment manifest (deployer, settlement worker, eligibility signer) so none of them can be associated with an agent. No contract, pricing or settlement change is involved.

## For developers

See `packages/sdk/README.md`. Offline examples need no credentials:

```bash
node packages/sdk/examples/offline-autonomous-pipeline.ts
node packages/sdk/examples/offline-research.ts
```

Account routes (`/api/agents`, `/api/agents/<id>/...`) require a signed-in, invite-approved Flurbo session, like every other application route. The headless runtime API (`/api/agent-runtime/v1`) accepts only agent credentials in the Authorization header, re-checks the owner's testnet approval on every request, and refuses browsers.
