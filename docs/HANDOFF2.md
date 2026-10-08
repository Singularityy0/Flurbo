# Flurbo handoff 2: architecture decisions, current state, mathematics, stretch goals

Written 2 October 2026. Companion to `docs/HANDOFF.md`, which holds the strict working rules and the code map; read that first. The visual handbook is `docs/handbook/flurbo-handbook.html`. The public technical reference is `docs/TECHNICAL_LITEPAPER.md` (version 0.3); the notation here follows it.

## 1. Current state (2 October 2026)

| Area | State |
|---|---|
| Network | Monad testnet (chain 10143), test AUSD only (`0xa9012a055bd4e0edff8ce09f960291c09d5322dc`, 6 decimals). No real money anywhere. |
| Site | `https://flurbo.singu.online`, invite-only preview, passkey accounts, one free Render web service. |
| Pool list | Registry mode: `config/collections.json` is the single list of pools for the site, monitor and settlement bot (`FLURBO_COLLECTIONS_SOURCE=registry`). |
| Live pools | Release milestones (legacy, 2 questions), Jobs Friday, Crypto weekend, Brazil election (4 questions each, `auto`). Showcase v0, pre-test-v1 and pre-test-v2 are delivered (`finish-only`). |
| Settlement | The bot inside the web service reads official sources, asserts with a 1 AUSD bond, finalizes and delivers, for every `auto` pool. One signer. |
| Deploys | Any number of pools per run: batch file, prepare, check, `DeployPilotBatch`, verify, register, commit. |
| Uncommitted | `pilotSettlement: auto` on `release-pilot-auto`; `docs/handbook/`; `docs/HANDOFF.md`; this file. |

Dates that need a person:
- **5 Oct, 01:00 to 05:30 UTC:** check the TSE result layout.
- **7 to 8 Oct:** reth v2.6.1 needs a manual No, asserted between 7 Oct 00:01 and 8 Oct 00:01 UTC.
- **25 to 29 Oct:** Brazil runoff question. If there is no runoff, assert No by hand.

## 2. Architecture decisions

Each entry gives the decision, the reason, the consequence, and its status.

**AD-1. Testnet and test assets only.**
- **Why:** prediction markets with real money raise legal and custody questions the project does not take on. This applies to elections in particular.
- **Consequence:** incentives are weak; "trust in results" and liquidity cannot be proven economically.
- **Status:** in force.

**AD-2. One shared LMSR per pool over the joint outcome space, instead of separate markets per question.**
- **Why:** related questions get coherent prices. Knowledge about how questions move together can be traded and is rewarded. Every combination comes for the same subsidy (section 3.6).
- **Consequence:** pools must stay small and related. A pool pays out after its last question.
- **Status:** in force.

**AD-3. Bounded-width factored pricing, not full enumeration.**
- **What:** liability is a sum of local factor tables over at most 3 events each. Prices come from variable elimination with induced width at most 2.
- **Why:** 2^n enumeration is infeasible on-chain beyond a few events.
- **Consequence:** each question can be linked through traded combinations to at most two others, permanently, first come. The public interface allows at most 3 legs per claim.
- **Status:** in force.

**AD-4. Claims are (scope, mask) truth tables.**
- **What:** individual YES and NO, AND, OR, exactly one and at least two are all masks over the selected events.
- **Why:** one representation for every Boolean claim, checked on-chain.
- **Status:** in force.

**AD-5. 2 to 4 questions per pool.**
- **Why:** the settlement and VOID payout code enumerates every combination of answers (2^n).
- **Consequence:** larger clusters need the Part 2 contract change (section 6.1). The engine itself accepts up to 32 events.
- **Status:** in force; change designed.

**AD-6. Fixed depth b per pool, funded by the deployer with b × n × ln 2.**
- **Why:** this is the LMSR's bounded subsidy; it is simple and proven.
- **Consequence:** the operator must guess b at deployment. There is no LP token and no withdrawal of leftover funding.
- **Status:** in force; improvements in section 5.

**AD-7. One trading close per pool, enforced on-chain; separate pools for separate timelines; no combinations across pools.**
- **Why:** a trade after any observation would be trading on known information. Different answer times therefore need different pools.
- **Consequence:** related pools can drift apart (Crypto weekend and Crypto week).
- **Status:** in force; shared-pool stretch goal.

**AD-8. Uniform VOID.**
- **What:** an unanswerable question is VOID, and YES and NO each get half weight, independently per question. VOID is not a refund.
- **Why:** it is predictable, and it composes with combinations.
- **Status:** in force.

**AD-9. Optimistic resolution through `PilotResolver`.**
- **How it works:**
  - An asserter posts a 1 AUSD bond with public evidence.
  - Anyone except the reviewers and the asserter can dispute.
  - Three operator-controlled reviewers decide a dispute with 2 matching votes.
  - A missing assertion or a vote without quorum finalizes as VOID.
  - Bonds become credits, collected with `withdrawBond()`.
- **Why:** it is simple and fast on testnet, and the trust model is disclosed.
- **Consequence:** there is no economic security; the operator decides disputes.
- **Status:** in force; independent resolution is a stretch goal.

**AD-10. Deterministic settlement rules committed on-chain.**
- **What:**
  - Each question carries a `flurbo.settlement-rule.v1` rule (source URLs, reader settings, timing, decision), hashed into the resolver.
  - Four general readers: `json-api.v1`, `stat-table.v1`, `html-text.v1`, `evm-rpc.v1`.
  - Policies: the first valid capture inside the window decides (`first-observed-snapshot`). Missing data is never No. Interval data waits 3 hours. Trading closes before every capture window. Rules are designed to fail closed.
- **Why:** answers anyone can recompute, with no model in the decision.
- **Status:** in force.

**AD-11. The settlement bot runs inside the free Render web service, not in scheduled GitHub Actions.**
- **Why:** Actions cron was late or skipped, and the free minutes are limited.
- **Consequence:**
  - The signer key lives in the web service environment.
  - A restart skips one cycle.
  - cron-job.org pings `/healthz` every 10 minutes to keep the service awake.
  - Healthchecks.io is the watchdog.
- **Status:** in force.

**AD-12. A committed registry is the source of truth for pools.**
- **What:** `config/collections.json` replaced the environment bundles.
- **Why:**
  - The environment variables hit a size limit (a single variable cannot exceed 128 KiB).
  - Adding a pool needed several Render edits.
  - Only one pool could propose.
- **Safety:**
  - A git review gates each change.
  - Every chain read re-verifies a pool's code, rules hash and binding.
  - `auto` pools may not ask for a bond above 10 AUSD.
  - `FLURBO_RESOLUTION_HOLD` stops assertions for chosen pools.
- **Status:** in force since 1 October 2026 (PRs #30 and #31).

**AD-13. One signer, one pending transaction, journal before broadcast.**
- **Why:** no nonce conflicts, and a restart can resend the exact signed bytes without ever signing a replacement.
- **Consequence:** up to 12 transactions per cycle; bursts take 2 to 3 cycles.
- **Status:** in force.

**AD-14. Batch deployment.**
- **What:** prepared files feed one `forge` run (`DeployPilotBatch`). Before the first transaction it checks every pool, the total funding and the deadlines, and it refuses pools that already have a deployment manifest.
- **Why:** one keystore prompt for many pools, and no double deploys.
- **Status:** in force.

**AD-15. Free tiers only.**
- **Where data lives:** Upstash Redis holds sessions, agents, settlement state and evidence. Supabase holds rebuildable data: prices, indexes and metrics.
- **Cost controls:**
  - The monitor re-reads pools far from due about every 8 minutes, and settled pools once.
  - The worker skips idle pools.
  - Pool reads are one Multicall.
- **Why:** there is no payment card.
- **Status:** in force.

**AD-16. Accounts and access.**
- **What:** passkey (Mera) accounts and invite-only access. Members link MetaMask wallets, and the site refuses trades from unlinked wallets.
- **Consequence:** pools are permissionless on-chain. A contract-level trader registry was deferred.
- **Status:** in force.

**AD-17. Agents run on members' machines.**
- **What:** SDKs in TypeScript, Python, Rust and C++, holding the member's own key and an agent token. The server never signs for an agent.
- **Evidence:** evidence v2 enforces complete documents and separate publisher and HTTP times.
- **Gap:** the runner still researches questions pair by pair, not as one pool.
- **Status:** in force.

**AD-18. Source and topic policy.**
- **What:** official first-line sources only, never aggregators or news sites. No sports, pop culture or awards. Elections are allowed from official results.
- **Status:** in force.

**AD-19. Semantic purchase guard off.**
- **Why:** it is only useful with reviewed rules. Impossible combinations price near zero instead of being refused.
- **Status:** in force.

## 3. Mathematics

### 3.1 Outcome space and claims

- **Outcome space:** a pool has n binary questions E_0 to E_(n-1). An outcome is an n-bit vector x in Omega = {0,1}^n.
- **Claims:** a claim is (S, M). S is a scope bitmap selecting k events. M is a mask over the 2^k local assignments of those events, neither empty nor full. One unit pays 1 AUSD in each local state that M selects.

For two events A and B (state bits: A is bit 0, B is bit 1):

| Claim | Mask (binary over states BA = 11, 10, 01, 00) | Pays when |
|---|---|---|
| A | 1010 | A |
| B | 1100 | B |
| A AND B | 1000 | both |
| A OR B | 1110 | at least one |
| exactly one | 0110 | one but not the other |

### 3.2 Cost function, prices and trades (LMSR)

```
q_x  = total payout owed in outcome x
C(q) = b ln( sum over x of exp(q_x / b) )
p_x  = exp(q_x / b) / sum over y of exp(q_y / b)        (prices sum to 1)
P(W) = sum over x in W of p_x                            (price of a claim with winning set W)
cost of buying d units of W = C(q + d 1_W) - C(q) = b ln( 1 + P(W) (exp(d / b) - 1) )
```

The last line shows that buying any claim in the pool costs exactly what it would in a standalone two-outcome market with the same b and the same current price. Pooling costs single-question traders no depth.

**Price impact:** after buying d units at price p, the new price is p e^(d/b) / (p e^(d/b) + 1 - p), approximately p + p(1 - p) d / b for small d.

### 3.3 Funding, worst-case loss and solvency

```
initial funding = C(0) = b ln(2^n) = b n ln 2
worst-case operator loss = b n ln 2
required collateral before resolution R = max over x of L(x)    (L = payout owed)
```

Contracts round quotes outward and check the collateral balance directly after every trade.

### 3.4 Conditional preservation

Buying a single question A multiplies the weight of every outcome where A is true by the same factor. Therefore P(B given A) and P(B given not A) are unchanged; only P(A) and, through it, P(B) move. Buying A AND B changes the weights inside the A subset, so P(B given A) moves.

The only way the pool learns a relationship is through combination trades. The property is tested in `contracts/test/FactoredConditionalProperties.t.sol`.

### 3.5 Factored representation

```
q(x) = sum over factors f of q_f(x restricted to scope(f))       (each scope: at most 3 events)
Z    = sum over x of exp(q(x) / b),  C = b ln Z
```

Z and the maximum liability are evaluated by variable elimination along a supplied order with induced width at most 2. Intermediate tables have at most 8 entries, and no 2^n array is ever built.

The engine accepts 1 to 32 events and at most 64 factors. The pilot pool restricts a deployment to 2 to 4 events. Width at most 2 means each question links to at most two others through traded combinations.

### 3.6 Proof that a joint pool beats separate markets for related questions

The example is Jobs Friday at b = 100, with exact LMSR numbers. The script is in the session scratchpad as `combo-proof.mjs`, and its numbers are reproduced here.

- A = unemployment at least 4.2%, market price 0.35.
- B = U-6 at least 7.8%, market price 0.45.
- The market treats them as independent, so P(A AND B) = 0.1575.
- A trader agrees on both singles but knows U-6 contains the unemployed: P(A AND B) = 0.33, P(B given A) = 0.94.

1. **Separate markets pay nothing for knowledge of a relationship.**
   - Any portfolio of A and B shares pays a sum of single payoffs. Its expected value is linear in P(A) and P(B), which the trader agrees with, so expected profit is zero before costs.
   - Buying 100 of each costs 104.37 for an expected payout of 80, so the expected result is -24.37.
2. **The joint pool pays for it.**
   - Buying 100 "A AND B" costs 23.95 against an expected payout of 33.00.
   - That is an expected profit of +9.05, a 37.8% return.
3. **The knowledge spreads to every price.** After that one trade:
   - P(B given A) rises from 0.45 to 0.69.
   - P(B given not A) stays at 0.45.
   - P(A) rises from 0.35 to 0.49, and P(B) from 0.45 to 0.57.

   A trader who later learns that A happened finds B priced near 0.69, not a stale 0.45.
4. **One subsidy covers every combination.** At b = 100, the worst-case loss is:

   | Setup | Worst-case loss |
   |---|---|
   | 2-question pool | 138.63 |
   | Separate A, B and A AND B markets | 207.94 |
   | 4-question pool | 277.26 |
   | Separate 4 singles, 6 pair ANDs, 6 pair ORs and 4 triple ANDs | 1,386.29 |

5. **Prices cannot contradict each other.**
   - In one pool, P(A AND B) is at most P(A) and at most P(B), and P(A OR B) = P(A) + P(B) - P(A AND B), always.
   - Separate venues can show a parlay above its own leg, which is free arbitrage.
   - Parlays priced as products assume independence; here that gives 0.1575 against the true 0.33.

Trade-offs of pooling:
- The payout waits for the slowest question (Brazil runoff: about 28 October instead of 7 October for round one).
- The width-2 combination limit, permanent and first come.
- 2 to 4 questions per pool today.
- No combinations across pools.
- A combination trade moves several prices: P(A) rose with an AND buy.
- One VOID question changes every combination that contains it.
- Higher variance per combination.
- A harder product to explain.

For unrelated questions, pooling adds the costs without the benefit, so they belong in separate pools.

### 3.7 VOID payouts

When some questions resolve VOID, each VOID bit takes YES and NO with equal weight, independently. For a claim (S, M) with k selected events, of which v are VOID:

```
payout per unit = (number of local states that agree with the known answers and are in M) / 2^v
```

Payouts are rounded down to the atom on redemption. Examples:

| Claim | Results | Payout per share |
|---|---|---|
| Single YES | VOID | 0.5 |
| AND of two | one Yes, one VOID | 0.5 |
| AND of two | both VOID | 0.25 |
| AND of two | any known No | 0 |

### 3.8 Choosing the depth b

| b | 10 shares at a 50% price moves it by | Funding for 4 questions |
|---|---|---|
| 25 | 9.9 points | 69 AUSD |
| 100 | 2.5 points | 277 AUSD |
| 250 | 1.0 point | 693 AUSD |
| 1,000 | 0.25 points | 2,773 AUSD |

Rules of thumb:
- From a budget B and n questions: b = B / (n ln 2).
- From a target move m (in probability) for a trade of d shares at a price near 0.5: b is about 0.25 d / m.

## 4. Live parameters

| Pool | b | Questions | Funding | Assertion / challenge / vote |
|---|---|---|---|---|
| Release milestones | 10 | 2 | about 13.9 | 24 h / 24 h / 24 h |
| Jobs Friday | 100 | 4 | 277.26 | 12 h / 12 h / 12 h |
| Crypto weekend | 100 | 4 | 277.26 | 12 h / 12 h / 12 h |
| Brazil election | 250 | 4 | 693.15 | 48 h / 12 h / 12 h |

Bond: 1 AUSD everywhere. The registry refuses `auto` pools with a bond above 10 AUSD.

## 5. Why b has to be chosen at every deployment, and how to remove that

**The problem:**
- The pool is its own market maker. b sets both price sensitivity and the subsidy.
- b is fixed at deployment. Too small and early trades push prices to extremes; too large and the subsidy is wasted while prices barely react.
- Leftover funding is not returned after payouts, which is a known deferred gap.

**Options, easiest first:**

1. **Ask for what matters, not b.** Tooling only.
   - The batch file accepts a `budget` or a `targetMove` (for example, 10 shares move a 50% price by at most 2 points), and the tool computes b with the formulas in section 3.8.
   - About half a day of work.
2. **Deepen after deployment.** Small contract change.
   - A function that accepts more AUSD, raises b from b1 to b2, and scales the internal liabilities by b2 / b1 so that prices do not change.
   - The extra collateral is (b2 - b1) n ln 2.
   - Pools would launch small (for example b = 25) and be deepened where trading appears.
3. **Depth that grows with trading.** Contract change plus research.
   - A liquidity-sensitive LMSR (Othman and others, 2010) raises b with volume.
   - Prices then sum to slightly more than 1, which acts as a built-in fee, and pricing depends on history.
   - It needs factored-engine work and gas benchmarks.
4. **Others pay for depth.**
   - Trading fees offset the subsidy.
   - Order books on the canonical YES tokens (already minted for future Kuru pairs) let market makers quote, while the LMSR backs the long tail of combinations.
   - A shared pool of clusters spreads one subsidy across topics.

**Recommendation:** option 1 now. Option 2 with the Part 2 contract work, together with returning leftover funding. Fees and order books once volume justifies them.

## 6. Stretch goals

### 6.1 Any number of questions per pool (Part 2)

New contract versions; existing pools keep theirs.
- Compute each claim's payout over its own scope only: 2^k for k at most 3, instead of 2^n.
- Compute the reserve at settlement per factor by linearity, since every factor covers at most 3 events.
- Raise the guard after Foundry gas benchmarks at 8, 16 and 32 questions; 16 is the likely cap.
- Remove the 2 to 4 limits in `preparePilot`, the batch schema, the deploy script and the market route.
- Audit the ticket, What-if panel, portfolio and the four SDKs.

Funding grows linearly: b = 250 costs 1,386 AUSD for 8 questions and 2,773 AUSD for 16.

### 6.2 Early redemption

A claim can be redeemed once every question in its own scope is final. This removes the slowest-question payout delay.

### 6.3 Liquidity

Options 2 to 4 in section 5, plus a return of leftover funding to the deployer after all redemptions.

### 6.4 Combination width

A wider bound than two links per question, or smarter elimination orders, so elections with several plausible runoff pairs fit in one pool.

### 6.5 One shared pool of clusters

Combinations across topics with one subsidy; see `docs/STRETCH_SHARED_POOL.md`.

### 6.6 France 2027 flagship

Runoff composition and winner priced together, so the conditional "RN wins if facing X" is tradable. It needs 6.4 and operator-asserted results until official feeds are known.

### 6.7 Independent dispute resolution

Kleros, Reality.eth or Seer in place of operator-controlled reviewers, with bonds that carry economic weight.

### 6.8 Agents

- One joint forecast per pool in all four SDKs, replacing the pair-by-pair loop.
- Re-quote before every signature.

### 6.9 Settlement automation

- The bot finalizes any unchallenged assertion, not only its own.
- The bot withdraws its bond credits.
- The rule check recognizes source quota refusals.
- Release questions use counting rules so No settles automatically.

### 6.10 Product

- A per-holding exit view with a live sell quote.
- Participant telemetry, only with an approved privacy notice.
- A contract-level trader registry.

## 7. Where to look next

- **Gaps with status:** `docs/handbook/gaps-and-limitations.html`.
- **Operations:**
  - `docs/MULTI_POOL_OPERATIONS.md`: listing and the registry.
  - `docs/SETTLEMENT_READERS.md`: rules.
  - `docs/SETTLEMENT_BOT_RENDER.md`: the bot.
- **Market plans:** `docs/research/markets-2026-10/WAVE2_PLAN.md`. Six wave 2 pools are not deployed yet; Planet's deploy deadline is 5 Oct 23:00 UTC.
- **Venue comparison:** `docs/handbook/market-landscape.html`.
