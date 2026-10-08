# Chainlink Runtime Environment (CRE) Settlement Orchestration

> Status: proposal and local evidence preparation. The current pilot has no verified CRE deployment or authenticated delivery to the live resolver. The CRE badge was removed from Thesis. Use `METROPOLIS_PARTNER_DESIGN.md` and `METROPOLIS_LOCAL_RUNBOOK.md` for the tested implementation state.

Author: Flurbo Team
Date: October 2026
Competition: Monad Metropolis Hackathon
Target Bounty: Best Workflow with CRE ($3,000 USD)

---

## 1. Overview and Problem Statement

Prediction markets depend fundamentally on trustworthy real-world event resolution. Traditional approaches suffer from critical flaws:
1. **Centralized Admin Keys:** An operator wallet unilaterally signs the winning outcome, introducing rug-pull and censorship risks.
2. **Slow Escalation Queues:** Optimistic assertion systems require days or weeks of dispute windows, locking user capital.
3. **Ad-Hoc Oracles:** Unstandardized off-chain scrapers break during site redesigns or IP rate-limiting, causing disputes and voided markets.

Flurbo solves this by using the **Chainlink Runtime Environment (CRE)** as an automated, consensus-driven orchestration layer. CRE coordinates off-chain official API capture, identical multi-node aggregation, cryptographic rule commitment verification, and on-chain assertion delivery to the `PilotResolver` contract on Monad testnet (chain 10143).

---

## 2. Architecture and Orchestration Flow

```
                      +------------------------------------------+
                      |         MARKET CLOSING TRIGGER           |
                      |   Scheduled Cron or Trigger at closesAt  |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |           CHAINLINK CRE RUNNER           |
                      |          workflows/cre/src/pilot-main.ts |
                      +------------------------------------------+
                                           |
                    +----------------------+----------------------+
                    |                      |                      |
                    v                      v                      v
            [Node 1 HTTP Fetch]    [Node 2 HTTP Fetch]    [Node 3 HTTP Fetch]
            Official Source:       Official Source:       Official Source:
            GitHub / BLS / Fed     GitHub / BLS / Fed     GitHub / BLS / Fed
                    |                      |                      |
                    +----------------------+----------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |     CONSENSUS IDENTICAL AGGREGATION      |
                      |    cre.capabilities.HTTPClient consensus |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |     DETERMINISTIC OBSERVER & PARSER      |
                      |        src/pilot-observer.ts             |
                      |  - Canonical state bit evaluation        |
                      |  - Keccak-256 evidenceHash generation    |
                      |  - Verify matching rules commitment      |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |           224-BYTE ABI PAYLOAD           |
                      |  Terminal State, Evidence Hash, Timestamp|
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |        PILOT RESOLVER (Monad Testnet)    |
                      |        Contract: Optimistic Assertion    |
                      +------------------------------------------+
```

---

## 3. Implementation Details

1. **Workflow Definition (`workflows/cre/workflow.yaml`)**:
   Declares the CRE user workflow targets (`pilot` and `synthetic`), entry points, and environment configurations:
   ```yaml
   pilot:
     user-workflow:
       workflow-name: flurbo-pilot-official-evidence
     workflow-artifacts:
       workflow-path: ./src/pilot-main.ts
       config-path: ../../target/deployments/pilot-cre.json
       secrets-path: ""
   ```

2. **Consensus HTTP Client (`workflows/cre/src/pilot-main.ts`)**:
   Uses `@chainlink/cre-sdk` with `cre.capabilities.HTTPClient` and `consensusIdenticalAggregation<string>()` to ensure multiple decentralized execution nodes independently retrieve and agree upon raw source responses before parsing.

3. **Deterministic Observer (`workflows/cre/src/pilot-observer.ts`)**:
   - Maps raw source payloads to Boolean outcomes.
   - Enforces observation windows strictly after `closesAt`.
   - Computes canonical ABI-encoded evidence commitments:
     $$\text{evidenceHash} = \text{keccak256}(\text{abi.encode}(\text{domain}, \text{rulesHash}, \text{observedAt}, \text{observations}))$$
   - Fails closed on any ambiguity: missing fields, format changes, or unreachable sources are rejected rather than assumed to be No.

4. **Integration with Flurbo Thesis and What-If**:
   The web application displays the CRE settlement badge for every pool, giving traders transparency into the exact source URLs, observation rules, and consensus verification path.

---

## 4. Verification and Reproduction

The CRE workflow package is covered by 62 unit tests across 15 test suites validating all edge cases, terminal states, and commitment bindings.

### Test Execution Commands
```bash
cd workflows/cre
bun install --frozen-lockfile
bun test
bun run typecheck
```

### Verified Test Results
```text
bun test v1.4.2 (744846f84)
 62 pass
 0 fail
 446 expect() calls
Ran 62 tests across 15 files. [5.85s]
tsc --noEmit: Completed with 0 errors.
```
