# Powering Combinatorial Prediction Markets with Kimi (Moonshot AI)

> Status (8 Oct 2026): the web route and the paper-trading agent configuration are built and tested with mocked responses. **Kimi has not been called with a real account key yet**, so no real Kimi output is claimed anywhere. The server calls Kimi only when `MOONSHOT_API_KEY` is set, labels its output as a model hypothesis, and shows an error (and no numbers) when the key is missing or the call fails. See `METROPOLIS_LOCAL_RUNBOOK.md`.

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

In Flurbo, Kimi supplies one thing: a labelled hypothesis about how two questions of a pool move together.

1. **A conditional parameterisation.** People are poor at stating a joint probability directly, so the model is asked for three numbers: P(A), P(B given A is Yes) and P(B given A is No). Those always describe one coherent world, so the Fréchet bounds hold by construction.
2. **A short rationale.** The model also returns a few sentences on why the dependence exists, shown beside the numbers so a person can challenge it.
3. **No sources are fed in.** The prompt contains only the two question texts and tells the model to give a hypothetical forecast, not a fact or advice, and not to claim sources it was not given. The settlement rules, sources and thresholds that decide the questions are separate and fixed on-chain.

Kimi never decides settlement, never sets a price and never places a trade.

---

## 3. What the server does

`POST /api/pilot/kimi-forecast` (`apps/web/server/kimi-forecaster.mjs`, routed from `local-api.mjs` for the pilot and every practice collection):

- refuses without `MOONSHOT_API_KEY` (or `KIMI_API_KEY`), refuses a base URL other than `https://api.moonshot.ai/v1` or `https://api.moonshot.cn/v1`, and times out after 12 seconds;
- sends the two question texts to `chat/completions` with the model in `MOONSHOT_MODEL` (the code default is `kimi-k3`; set the model id the account actually offers, and confirm it with the account's model list before relying on it);
- requires parseable JSON with all three numbers between 0 and 100, rounds them to one decimal, and rejects anything else with an error and no numbers;
- recomputes the joint P(A) x P(B | A), the marginal P(B) and the Fréchet bounds, and returns them next to the model's output with `source: "moonshot-api"`. A local heuristic is never labelled as Kimi.

## 4. Where it appears

- **Thesis Explorer:** the "Analyze with Kimi AI" button fills the three estimate boxes (labelled "Kimi model hypothesis"), shows the rationale card, and the existing comparison against the pool then runs on those numbers.
- **What If:** the "Kimi Joint Forecast" button shows a "Kimi model hypothesis" card beside the pool's own joint and the independence baseline. It computes no trade value.
- **Agent:** the SDK runner drives any OpenAI-compatible provider, so a Kimi-driven paper-trading agent is configuration: `packages/sdk/examples/kimi-agent.json` (fill in the market and a model id). Its journal records the forecast source and model name next to each paper decision.

## 5. Checked

- `apps/web/tests/kimi-forecast.test.ts`: valid output, range checks, invalid JSON, the unconfigured case and that a heuristic is not labelled as Kimi.
- `apps/web/tests/partners-e2e-browser.test.ts`: the buttons, the error without a key, the filled estimates and the labelled cards, against a mocked route.
- `packages/sdk/test/kimi-agent-config.test.ts`: the agent configuration parses.

Not checked: a real Kimi response, a real model id, the live site with a key set, and a paper-trading cycle against a real Kimi model. Those need an API key with balance; until then the Kimi bounty rests on this code and tests only.
