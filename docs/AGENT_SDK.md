# Flurbo agents (testnet beta)

Agents help a signed-in, approved Flurbo account turn a view about how two events relate into a structured forecast, a comparison with the pool's executable prices, and at most one proposed purchase. This is an invite-only testnet preview with test assets.

## What is implemented

- **Agent profiles.** Create, pause, resume, switch between paper-only and proposal modes, and delete. Profiles and records are stored server-side per Mera account. Another account cannot read or change them.
- **Structured forecasts.** You enter the chance of each of two events and the chance that both happen, plus evidence, reasoning and uncertainty. The joint forecast must be internally consistent; contradictory input is rejected. Your self-reported confidence is shown as self-reported, not calibrated.
- **Reference strategy (joint edge v1).** The server reads quotes from the pool contract at one snapshot block for every claim your forecast covers, then proposes the claim with the largest estimated edge after the full slippage allowance, or abstains with reasons.
- **Paper trades.** Simulated fills at the quoted cost, labelled as paper everywhere, never on-chain.
- **User-approved purchases.** In proposal mode the agent prepares an unsigned review through Flurbo's existing transaction preparation. You confirm in MetaMask. A token approval is a separate first step and is not a purchase. Only a verified receipt for the exact reviewed purchase marks it confirmed.
- **Activity and results.** Decisions, paper trades and proposal statuses, with paper results and confirmed agent-originated purchases shown separately.

## Limits and honest accounting

- Agents never sign, hold keys or trade automatically. MetaMask is the only trading signer; Mera identifies the account.
- Claims are limited to one pool and one to three events, using the canonical Flurbo combination model. Different pools never combine.
- A forecast probability is not a market price. The pool's model-implied probability is not an executable price. The average price per share at a given size is a finite purchase cost, not a probability.
- Estimated edge assumes no VOID outcome and excludes gas. It is not a promise of profit or accuracy.
- Realized results, collected payouts and payout collection belong to each wallet in Portfolio and are not attributed to an agent.
- Trades are public on-chain. Agents do not make participation private.
- Agents cannot assert, challenge, vote on or settle markets.

## Proposal lifecycle and recovery

- **One proposal per decision, across servers.** Preparing a proposal first reserves its decision under the account lock (status `preparing`, 60 seconds). A second request for the same decision gets `PROPOSAL_EXISTS` and prepares nothing. A failed preparation becomes `preparation-failed`; a reservation that lapses (for example, a server stopped mid-way) becomes `preparation-expired` and cannot turn live afterwards. Either may be retried.
- **No stale overwrites.** Every proposal has a `version`. A refresh or other change computed from an older read is refused with `PROPOSAL_CHANGED`. Writes are compare-and-set, so a server whose lock lapsed cannot overwrite newer state.
- **Transactions are bound to their review.** Registering a hash names the exact reviewed transaction that was sent. Every review a proposal ever issued is kept, so a review replaced by any number of refreshes, an expired review, or one on a dismissed proposal can still be matched: none of these proves the transaction was never sent.
- **One transaction, one proposal.** A transaction hash (per chain) is attributed to exactly one proposal across all agents and accounts, written in the same atomic step as the proposal. Registering it again for the same proposal is accepted without change; any other proposal gets `HASH_CONFLICT` and never counts it. A hash that turns out not to be the reviewed transaction releases its attribution.
- **Recovery after a failed request or reload.** The browser keeps MetaMask's hash locally until the server has recorded it against the matching proposal (same account, wallet, chain, pool and transaction) and resolved it. On reload it records the hash again and verifies the receipt; it never asks MetaMask to send again. A conflicting hash is shown explicitly.
- **Records that are kept.** The activity feed keeps the newest 100 decisions and 100 paper trades. A proposal that issued a review is never dropped; older resolved ones are compacted to what recovery and accounting need. Paper totals (fills, cost, per-claim positions) and confirmed purchase totals are running totals, so results and the paper budget stay complete. Records saved before this change are converted on the next change.
- **Deleting archives.** A deleted agent stops evaluating and proposing and its activity feed is cleared, but its proposals, reviews, transactions and totals are kept. It is listed under Archived agents, where a transaction already sent can still be recorded and verified.
- **Limits.** 10 active agents and 50 including archived ones per account; 200 transaction reviews per agent. Reaching a limit is refused explicitly; nothing needed for recovery is discarded to make room.
- **Hosted storage check.** `apps/web/scripts/check-agent-redis.mjs` exercises the locks, Lua scripts and MGET against a real Redis-compatible test database (`FLURBO_AGENT_REDIS_CHECK=1` plus the Upstash REST URL and token of that test database). It writes only throwaway keys under `flurbo:agents:v1:` and removes them.

## For developers

See `packages/sdk/README.md`. The SDK runs an offline example without credentials:

```bash
node packages/sdk/examples/offline-research.ts
```

Agent API routes (`/api/agents`, `/api/agents/quote`, `/api/agents/<id>/...`) require a signed-in, invite-approved Flurbo session, like every other application route.
