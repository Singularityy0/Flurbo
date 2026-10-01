# Stretch goal: one shared pool containing many market clusters

Status: design note, not scheduled. Recorded 1 October 2026 after the invite-launch market planning (`docs/research/markets-2026-10/WAVE2.md`).

## The idea

Today every pool is a separate contract: its own prices, collateral, trading close and settlement. Combinations work only inside one pool, and a trade in one pool never moves another, so related pools (BTC this weekend and BTC this week, or the jobs report and the 2-year yield) can contradict each other.

The stretch goal is one large shared pool that holds many clusters of questions. Clusters behave exactly like today's separate pools until someone trades a combination across two of them; from then on, their prices move together and can never contradict each other.

## Why it is the same market maker, not a new one

The pool's cost function is `C(q) = b log Z` with `Z = sum over states of exp(q(x) / b)`, and in the factored engine the liability `q(x)` is a sum of small factor tables (`docs/TECHNICAL_LITEPAPER.md`, Section 4).

If the questions split into clusters with no factor spanning two clusters, `Z` is the product of each cluster's own `Z_k`, so

```text
C(q) = sum over clusters of b log Z_k = sum over clusters of C_k(q_k)
```

A large pool with unlinked clusters therefore quotes every trade exactly as separate pools with the same `b` would. The initial subsidy is the same too: `b n log 2` in total, the sum of each cluster's share.

A combination across clusters adds one factor whose scope covers questions from both. Variable elimination then joins those clusters, and only those. Prices stay exact; the cost of computation grows with the links people trade, not with the number of questions.

## What already exists

- `FactoredPool` (`docs/FACTORED_POOL.md`): 1 to 32 binary questions, factor scopes of up to 3 questions, induced width at most 2 under a supplied elimination order, conservative quotes, exact maximum liability, partial or full redemption. Tested locally; not publicly deployed.
- `PilotPool`: the deployed contract, restricted to 2 to 4 questions with one close time and settlement after every question resolves.

## What would have to change

| Change | Why | Today |
|---|---|---|
| A close time per question or per cluster | Fast and slow markets in one pool (a Friday jobs report next to a week-long crypto market). A combination closes at the earliest close among its questions | One `closesAt` per pool |
| Settlement per question | A claim pays once its own questions are resolved; coverage is checked over the unresolved questions only (variable elimination with the resolved bits fixed) | `resolve` sets every outcome at once; redemption waits for all of them |
| Adding questions after deployment | New markets join the pool instead of deploying a contract. A new question starts at an even prior and brings its own funding of `b log 2` | Event count fixed in the constructor |
| Elimination order chosen by the contract or a verified helper | A large pool needs a good order; a poor supplied order rejects trades that a better order would accept | Caller supplies a complete order; it is validated, not optimized |
| A wider, or smarter, link limit | Each question can be combined with at most two others. Two-round elections (winner linked to every possible runoff opponent) hit this first | Width at most 2 |
| Liquidity per cluster | Busy and quiet markets should not share one `b`. Needs a reviewed design (for example per-cluster scaling of factor tables) and new pricing proofs | One `b` per pool |
| Resolver per question | A stuck or disputed question must not block other clusters | One resolver binding per pool |

## Trade-offs

- **Concentrated risk.** One contract holds every cluster's collateral. A bug, a bad settlement rule or a stuck resolver could affect all markets rather than one pool. An independent audit is required before any real-value use.
- **Gas and complexity** scale with the links traded. The link limit keeps pricing exact and is a deliberate refusal condition, not an approximation.
- **Operational coupling.** Upgrades, monitoring and incident response cover every market at once.
- **Benefit.** Linked markets are coherent by construction, liquidity is shared, and new markets need no new contract. This is the strongest form of the "one shared distribution" proposition, and it answers the runoff-election use case raised by Clément Lesaege (28 September 2026).

## A smaller step in between

**One shared collateral vault behind many pools.** Each pool keeps its own prices; capital sits in one vault, so funding is managed once and goes further. No cross-pool prices, but much less risk and effort, and useful even if the shared pool comes later.

## Suggested order

1. Per-question close times and per-question settlement in the current pool design. This removes most of today's scheduling constraints (one close per pool, payouts waiting for the slowest question).
2. Adding questions to an existing pool, with their own funding.
3. Deploy the general factored pool as one shared pool with clusters; add elimination-order selection and revisit the width bound and per-cluster liquidity with new numerical proofs.

Each step needs its own contract tests, gas measurements and review; steps 2 and 3 change pricing invariants and need the same high-precision fixtures as the current factored engine.

## Related

- `docs/TECHNICAL_LITEPAPER.md`, Sections 4 and 12 (sparse-graph restriction, automatic elimination-order selection, larger sparse clusters as future work).
- `docs/FACTORED_POOL.md`, `docs/FACTORED_PRICING.md`.
- `docs/research/markets-2026-10/WAVE2.md` (why pools are grouped by close time today; France 2027 design).
