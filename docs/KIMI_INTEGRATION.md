# Powering Combinatorial Prediction Markets with Kimi (Moonshot AI)

> Status: the server calls Kimi only when `MOONSHOT_API_KEY` is set and labels its output as a model hypothesis. It returns an error on API failure. Kimi has not been called with a real account key in this checkout. See `METROPOLIS_LOCAL_RUNBOOK.md`.

Author: Flurbo Team
Date: October 2026
Competition: Monad Metropolis Hackathon
Target Bounty: Best Builds Powered by KIMI ($3,000 in credits)

---

## 1. The Multi-Event Prediction Problem

Most prediction markets (such as Polymarket or Kalshi) trade questions as isolated binary contracts. When events are economically or causally linked (such as a central bank interest rate cut and inflation prints, or a Layer 1 blockchain mainnet launch and ecosystem milestone), isolated markets fail traders in three ways:

1. **They cannot express correlation:** A trader who believes Event B will happen *only if* Event A happens must buy both tokens independently, taking on double capital downside if either fails.
2. **Prices drift into contradiction:** Independent market makers frequently allow marginal prices to violate basic probability axioms, such as:
   $$P(A \text{ and } B) > \min(P(A), P(B))$$
3. **Traders struggle with conditional estimation:** Calculating valid joint probability distributions across multiple questions requires deep economic context and strict adherence to Fréchet bounds:
   $$\max(0, P(A) + P(B) - 1) \le P(A \text{ and } B) \le \min(P(A), P(B))$$

Flurbo solves the market-making side of this problem on Monad testnet by deploying a shared **Factored Logarithmic Market Scoring Rule (LMSR)** pool where related questions share one collateral pool and price single answers as well as combinations (AND, OR, exactly one, at least two).

To solve the human estimation side, Flurbo integrates **Kimi (Moonshot AI)** as a native AI Joint Forecaster.

---

## 2. Why Kimi?

Kimi is Moonshot AI's flagship foundation model, engineered for deep reasoning, long context comprehension, and structured agentic execution. In prediction markets, traditional LLM chatbots are typically bolted on as decorative chat interfaces that restate Wikipedia summaries.

In Flurbo, Kimi is integrated directly into the mathematical trading engine:

1. **Unstructured Source Synthesis:** Kimi ingests official source specifications (Bureau of Labor Statistics release calendars, Federal Reserve FOMC statements, GitHub release commits, or on-chain event parameters) committed to the market.
2. **Causal Regime Decomposition:** Rather than guessing a single number, Kimi analyzes the conditional dependence structure:
   - What is the baseline likelihood of the assumption event $P(A)$?
   - If Event A happens, what transmission mechanism changes the likelihood of Event B ($P(B \mid A = \text{Yes})$)?
   - If Event A fails, how does the alternative regime affect Event B ($P(B \mid A = \text{No})$)?
3. **Fréchet Bounds Enforcement:** Flurbo's verification layer ensures that Kimi's joint probabilities never violate mathematical bounds before they are presented to the trader.
4. **Natural Language Rationale:** Kimi generates a concise economic explanation clarifying *why* the dependency exists, empowering traders to validate or challenge the hypothesis.

---

## 3. Architecture and Data Flow

```
+-------------------------------------------------------------+
|                     FLURBO THESIS EXPLORER                  |
|          Trader selects Event A (Assumption) & Event B      |
+-------------------------------------------------------------+
                              |
                              | POST /api/pilot/kimi-forecast
                              v
+-------------------------------------------------------------+
|                   KIMI JOINT FORECASTER                     |
|  - Manifest Event Titles & Observation Rules                |
|  - System Prompt: 0-100% P(A), P(B|Yes), P(B|No)            |
|  - Model: moonshot-v1-8k                                    |
+-------------------------------------------------------------+
                              |
                              | Structured JSON Output
                              v
+-------------------------------------------------------------+
|                MATHEMATICAL VALIDATION LAYER                |
|  - Calculate Joint: P(A AND B) = P(A) * P(B|A)              |
|  - Calculate Marginal: P(B) = P(A)*P(B|A) + P(not A)*P(B|not A)|
|  - Check Fréchet: max(0, P(A)+P(B)-1) <= P(A AND B) <= min   |
+-------------------------------------------------------------+
                              |
                              | Validated Hypothesis
                              v
+-------------------------------------------------------------+
|               INTERACTIVE WHAT-IF & TRADE TICKET            |
|  - Populates 4-state joint outcome matrix                   |
|  - Compares belief vs pool-implied LMSR pricing             |
|  - Computes expected net value (EV) after fees and slippage |
|  - Trader executes single or combinatorial order on Monad   |
+-------------------------------------------------------------+
```

---

## 4. Live Verification and Production Readiness

The Kimi Forecaster is integrated into:
- **Web Platform:**
  - `apps/web/server/kimi-forecaster.mjs`: Server module interfacing with the Moonshot AI API. It returns an error when the API is unavailable; no local forecast is labelled as Kimi.
  - `apps/web/server/local-api.mjs`: Endpoint `/api/pilot/kimi-forecast` supporting both pilot and practice collections.
  - `apps/web/src/pages/ThesisExplorer.tsx`: One-click "Analyze with Kimi AI" button, displaying Kimi's rationale and updating the four-state outcome grid.
  - `apps/web/src/pages/WhatIf.tsx`: "Kimi Joint Forecast" action comparing Kimi's hypothesis against the pool's market-implied odds and independence baseline.
- **Automated Tests:**
  - `apps/web/tests/kimi-forecast.test.ts`: Verifies Fréchet bounds validation, input clamping, and error handling.

By transforming Moonshot AI's reasoning capabilities into executable joint probability distributions, Flurbo and Kimi bridge the gap between complex macro events and on-chain prediction liquidity on Monad.
