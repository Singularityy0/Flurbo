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

## For developers

See `packages/sdk/README.md`. The SDK runs an offline example without credentials:

```bash
node packages/sdk/examples/offline-research.ts
```

Agent API routes (`/api/agents`, `/api/agents/quote`, `/api/agents/<id>/...`) require a signed-in, invite-approved Flurbo session, like every other application route.
