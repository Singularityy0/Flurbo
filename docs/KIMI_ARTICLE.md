<!--
DRAFT for the Kimi bounty article (about 900 words once the pending parts are filled).
Do not publish until every PENDING block below holds real Kimi output from a real run.
Publish on dev.to or Medium and submit the URL in the bounty form.
-->

# Asking Kimi how two prediction markets move together

Most prediction markets trade each question alone. "Will ETH close above 2575?" and "Will BTC close above 83000?" are priced as if they had nothing to do with each other, yet anyone who has watched a crypto Sunday knows they do. Flurbo prices related questions in one shared pool, so a single share can pay on "ETH above 2575 **and** BTC above 83000". That fixes the market side. It leaves a human problem: what is the chance of the combination?

## Why three numbers instead of one

The honest answer to "how likely is A and B?" depends on how the two connect, and people are bad at stating a joint probability directly. It is easier to ask three questions:

1. How likely is A?
2. If A happens, how likely is B?
3. If A does not happen, how likely is B?

Those three numbers always describe one coherent world. The chance of both is P(A) × P(B | A), the chance of B alone is P(A) × P(B | A) + (1 − P(A)) × P(B | not A), and the Fréchet bounds, which say a joint probability can never exceed either marginal or fall below their sum minus one, hold automatically. The Thesis page asks you for exactly these three numbers and then shows what each possible outcome would pay compared with the pool.

## Where Kimi fits

The "Analyze with Kimi AI" button on Thesis, and "Kimi Joint Forecast" on What If, send the two question texts to a Kimi model through the OpenAI-compatible Moonshot API and ask for the three numbers and a short rationale as JSON. The server then:

- refuses to run without a key, so a missing key shows an error rather than made-up numbers;
- requires valid JSON with all three values between 0 and 100;
- recomputes the joint and the Fréchet bounds itself and returns them next to the model's output;
- labels the result "Kimi model hypothesis" and puts it in a separate card from the pool's own estimates.

PENDING: one real example here. Paste the two questions, the rationale card Kimi returned, the three numbers it filled in, and a screenshot of the Thesis page with the card. State the model id and the date.

## An agent that reads before it trades

The second use is an autonomous agent. Flurbo's SDK runs a loop: read the pool, gather evidence from an allow-listed set of sources, ask a model for a joint forecast of the whole pool, compare it with what the pool charges, and trade only when the edge clears the strategy's minimum. Pointing it at Kimi is configuration, not code: the provider is `openai-compatible` with the Moonshot base URL, and the key comes from an environment variable.

```json
"provider": { "kind": "openai-compatible", "baseUrl": "https://api.moonshot.ai/v1",
              "model": "<model id>", "apiKeyEnv": "MOONSHOT_API_KEY" }
```

The agent runs in paper mode first. Every decision is written to a journal with the source of the forecast, the model name, the evidence it was given and why it did or did not trade.

PENDING: paste a short excerpt of the real paper-mode journal from one cycle: the validated forecast (source `provider`, name `api.moonshot.ai/<model id>`) and the paper decision. If a live cycle was run with a funded agent wallet, add its transaction hash.

## Where Kimi has no say

Kimi never decides anything that moves money by itself, and it never decides a result.

- **Settlement.** Each question in a Flurbo pool settles from a rule committed on-chain before trading opens: a named public source, a time, a threshold. For the crypto pools that source is a Chainlink price feed on Monad. A bonded resolver reports the outcome and a separate Chainlink CRE workflow re-reads the same feed and says whether it agrees. A model's opinion is not an input to either.
- **Trading.** The agent's policy caps size, cost, slippage and total spend regardless of what any model says, and the web app only fills in estimate boxes; you still review and sign every trade in your own wallet.
- **Evidence.** The model is told not to claim sources it was not given, and the card says it is a hypothesis.

## What I would watch for

A language model's three numbers are an informed guess, not a measurement. They are most useful as a prompt to look again: when Kimi and the pool disagree sharply, that is a reason to read the sources, not to trade. The cards put the model's numbers beside the pool's, so the disagreement is visible instead of hidden.

## Try it

Flurbo runs on Monad testnet with test funds only: https://flurbo.singu.online. Open any market, choose Thesis, pick two questions and press "Analyze with Kimi AI". The code is in the repository: `apps/web/server/kimi-forecaster.mjs` (the route), `packages/sdk` (the agent) and `packages/sdk/examples/kimi-agent.json` (the Kimi configuration).
