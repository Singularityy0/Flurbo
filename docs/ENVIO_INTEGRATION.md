# Real-Time Prediction Market Indexing with Envio HyperIndex

> Status on 3 October 2026: local codegen, type checking, and chain sync passed. GraphQL returned 37 trade or redemption rows across six pools and 27 resolution event rows, and one indexed trade matched its Monad RPC log. The hosted GraphQL endpoint remains unavailable until Envio Cloud deployment. See `METROPOLIS_LOCAL_RUNBOOK.md` and `METROPOLIS_DEPLOYMENT_ENV.md`.

Author: Flurbo Team
Date: October 2026
Competition: Monad Metropolis Hackathon
Target Bounty: Best Use of Envio ($1,000 USD, All Tracks)

---

## 1. Overview and Problem Statement

Prediction markets with shared Logarithmic Market Scoring Rule (LMSR) pools and multi-event combinations generate complex state transitions. A single trade of an AND claim updates liabilities across overlapping state partitions, moves marginal prices for all participating questions, and alters the collateral coverage requirement:
$$R = \max_{x \in \Omega} L(x) \le \text{Collateral}$$

Relying solely on direct JSON-RPC `eth_getLogs` creates severe performance bottlenecks:
1. High-frequency queries trigger rate limits on public RPC nodes.
2. Calculating historical trader PnL requires replaying years of events sequentially on client devices.
3. Complex joint probability time series cannot be rendered in real time without structured indexing.

Flurbo solves this by integrating **Envio HyperIndex** on Monad testnet (Chain 10143).

---

## 2. Architecture and Data Pipeline

```
+-------------------------------------------------------------+
|                      MONAD TESTNET                          |
|  - FactoredPool (Buy, Sell, Redeem, Funding, Closes)        |
|  - PilotResolver (Assertions, Challenges, Votes, Finalizes) |
+-------------------------------------------------------------+
                              |
                              | High-speed block logs
                              v
+-------------------------------------------------------------+
|                  ENVIO HYPERSYNC & HYPERINDEX               |
|  - config.yaml: Chain ID 10143                              |
|  - schema.graphql: Derived entities                         |
|  - src/EventHandlers.ts: Event processing                   |
+-------------------------------------------------------------+
                              |
                              | Instant GraphQL Querying
                              v
+-------------------------------------------------------------+
|                      FLURBO APPLICATIONS                    |
|  - Web Application (Thesis Explorer, Portfolio PnL)         |
|  - Native Mobile App (Account Ledger & Activity)            |
|  - Autonomous Agents (Fast state & depth reads)             |
+-------------------------------------------------------------+
```

---

## 3. Schema Design and Entity Aggregation

The schema in `packages/envio-indexer/schema.graphql` captures:

1. **`Pool`**: Aggregates total volume, trade count, current collateral atoms, and tracks pool status.
2. **`TraderPosition`**: Maintains a rolling ledger of net performance per trader per pool:
   $$\text{netPnL} = \text{totalProceeds} + \text{totalRedeemed} - \text{totalCost}$$
3. **`Trade`**: Records every execution with bitwise `scope` and `mask`, quantity, notional cost, block, and timestamp.
4. **`HourlyPoolSnapshot`**: Pre-aggregates hourly trading volumes and closing collateral for historical charts.
5. **`ResolutionCase`**: Tracks the full lifecycle of optimistic assertions, bonds, disputes, and final outcomes.

---

## 4. Frontend and Client Integration

The indexer is consumed by:
- **`apps/web/src/envio.ts`**: Client helper library fetching user positions and trade histories.
- **`apps/web/src/pages/ThesisExplorer.tsx`**: Displays Envio HyperIndex verification indicators.
- **`apps/web/src/pages/WhatIf.tsx`**: Historical probability and joint state analytics.

---

## 5. Repository Structure and Deliverables

- Configuration: [`packages/envio-indexer/config.yaml`](file:///C:/Users/anany/Flurbo/packages/envio-indexer/config.yaml)
- Schema: [`packages/envio-indexer/schema.graphql`](file:///C:/Users/anany/Flurbo/packages/envio-indexer/schema.graphql)
- Event Handlers: [`packages/envio-indexer/src/EventHandlers.ts`](file:///C:/Users/anany/Flurbo/packages/envio-indexer/src/EventHandlers.ts)
- Package Manifest: [`packages/envio-indexer/package.json`](file:///C:/Users/anany/Flurbo/packages/envio-indexer/package.json)
- Client Helper: [`apps/web/src/envio.ts`](file:///C:/Users/anany/Flurbo/apps/web/src/envio.ts)
