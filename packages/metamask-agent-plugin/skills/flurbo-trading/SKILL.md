---
name: flurbo-trading
description: Trade Flurbo prediction-market pools on Monad testnet through the MetaMask Agent Wallet (mm flurbo). Use when the user asks to list Flurbo markets, quote a single-question or combined (AND / OR) claim, buy or sell shares, check holdings, or redeem winnings after a pool resolves. Testnet and test AUSD only.
---

# Flurbo prediction market trading

Flurbo pools are shared LMSR markets on Monad testnet (chain 10143). One pool holds two to four related questions, and a claim can cover one to three of them, so "ETH above 2575 AND BTC above 83000" is a single priced share. Everything here uses **test AUSD with no monetary value**.

This skill drives five `mm flurbo` commands. There are no others.

## Commands

| Command | Use it to | Wallet access |
|---|---|---|
| `mm flurbo markets` | List pools, their questions, claim scopes, close times and whether trading is open | none |
| `mm flurbo quote` | Read the current price of a claim before trading | none |
| `mm flurbo holdings` | Read the wallet's shares of one claim | read the account address |
| `mm flurbo trade` | Buy or sell shares; may first approve test AUSD for the pool | submits through the Agent Wallet |
| `mm flurbo redeem` | Collect the payout for shares after the pool has resolved | submits through the Agent Wallet |

### Claims: scope and mask

A claim is two integers.

- `scope` is a bit set of the questions the claim covers. Question 0 is 1, question 1 is 2, question 2 is 4, question 3 is 8. `mm flurbo markets` prints each question's scope.
- `mask` selects which outcomes of those questions pay. For one question: `2` pays on Yes, `1` pays on No. For two questions (scope is the sum of both bits): `8` pays only if both are Yes (AND), `14` pays if at least one is Yes (OR), `1` pays only if both are No. For three questions: `128` is all Yes, `254` is at least one Yes.

A mask can never be empty or cover every outcome. The commands reject those before anything is sent.

### Quote

```bash
mm flurbo quote --pool <pool> --scope 4 --mask 2 --quantity 1000000 --side buy
```

`--quantity` is in share atoms: 1 share is 1000000. The most any call accepts is 10 shares (10000000). The result is `amountAtoms` and `amountAusd`, the cost of a buy or the proceeds of a sale at the current pool state.

### Holdings

```bash
mm flurbo holdings --pool <pool> --scope 4 --mask 2
```

### Trade

```bash
mm flurbo trade --pool <pool> --side buy --scope 4 --mask 2 --quantity 1000000 --slippage 50 --deadline 300 --approve
```

- `--slippage` is in basis points, 0 to 100, default 50. A buy limits its maximum cost, a sale its minimum proceeds.
- `--deadline` is seconds, 60 to 600, default 300.
- A buy needs the pool to be allowed to spend test AUSD. Without `--approve` the command stops and returns `approval_required` with the exact amount. With `--approve` it sends one approval for exactly that amount, waits for it to be mined, quotes again, then sends the buy. Sales never need an approval.
- The result has `hash`, `approvalHash` when one was needed, `status`, an `explorerUrl`, and the quote and limit used.

### Redeem

```bash
mm flurbo redeem --pool <pool> --scope 4 --mask 2 --quantity 1000000
```

Only after the pool has resolved. A winning share pays 1 test AUSD; a losing share pays 0. If a question was voided, payouts follow the pool's published void rule, shown in the Flurbo app.

## Invariants

1. **Every transaction goes through the MetaMask Agent Wallet.** The plugin builds calldata and asks the wallet to submit it. It never sees a private key, mnemonic or password, and you must never ask the user for one or type one anywhere.
2. **Approvals are exact and explicit.** Only run `trade` with `--approve` when the user agrees to approve test AUSD for that pool. The approval equals the trade's maximum cost, never "unlimited".
3. **At most 10 shares per call.** Split larger orders into separate, separately quoted trades.
4. **Quote first, every time.** Prices move with each trade. Run `mm flurbo quote` immediately before `trade`, show the user the price, and do not reuse an older quote.
5. **Never trade a closed pool.** Check `tradingOpen` from `mm flurbo markets`. The commands also refuse a closed, unfunded or resolved pool.
6. **Respect wallet policy.** If Guard Mode, an outflow limit or MFA blocks a transaction, report that to the user and stop. Do not retry with a different amount, a different wallet or any workaround.
7. **Testnet only.** Chain 10143. If `mm` reports another chain, stop.

## Worked flow

```bash
# 1. Find an open pool and the question to trade (scope 4 is the third question).
mm flurbo markets
# 2. Price one share of Yes on that question.
mm flurbo quote --pool 0xPOOL --scope 4 --mask 2 --quantity 1000000 --side buy
# 3. Buy it. The wallet shows the intent and applies its policy; approve in the wallet if asked.
mm flurbo trade --pool 0xPOOL --side buy --scope 4 --mask 2 --quantity 1000000 --approve
# 4. Confirm the position.
mm flurbo holdings --pool 0xPOOL --scope 4 --mask 2
# 5. After the pool resolves, collect.
mm flurbo redeem --pool 0xPOOL --scope 4 --mask 2 --quantity 1000000
```

Combined claim: to buy "question 2 AND question 3 both Yes", use `--scope 12 --mask 8`.

## Reading the results

- `status: approval_required` means nothing was sent. Ask the user, then rerun with `--approve`.
- `status: AWAITING_MFA` with a `pollingId` means the wallet is waiting for the person to approve; tell them where to approve and wait.
- A `hash` with an `explorerUrl` on testnet.monadscan.com is the proof the transaction was sent. Report it exactly.
