---
name: flurbo-trading
description: Autonomous prediction market trading and joint-risk hedging on Monad testnet using Flurbo factored LMSR pools. Use when the user asks to inspect prediction markets, query combinatorial quotes (AND, OR, single events), evaluate Thesis or What-If scenarios, or execute trades under MetaMask Agent Wallet risk policies.
---

# Flurbo Prediction Market Trading Skill

Use this skill to enable autonomous agents to trade prediction markets on Monad testnet (Chain ID 10143) via the Flurbo factored Logarithmic Market Scoring Rule (LMSR) protocol.

## When to Use

Trigger this skill when:
- The user asks for odds or probability distributions on real-world events (economic releases, crypto milestones, elections).
- The user wants to trade combinations of events (e.g. "Buy 10 shares of Event A AND Event B").
- The user wants to analyze a What-If or Thesis scenario comparing their subjective beliefs against pool prices.
- The user wants to check holdings, hedge positions, or redeem winning shares.

## Security and Policy Invariants

1. **All transactions MUST route through MetaMask Agent Wallet**:
   Never ask for or handle private keys, passphrases, or mnemonic seeds. The plugin only prepares calldata and requests the Agent Wallet to sign and broadcast.
2. **Spending Caps and MFA**:
   All orders are subject to Agent Wallet outflow caps and multi-factor authentication (MFA). If an order exceeds spending limits, report the policy rejection to the user.
3. **Slippage Protection**:
   Always calculate `maxCost` (for buys) or `minProceeds` (for sells) using on-chain contract quotes with a maximum slippage tolerance of 50 to 100 basis points.

## Command Reference

### 1. Query Quotes
```bash
mm flurbo quote --pool <poolAddress> --scope <scopeInt> --mask <maskInt> --quantity <atoms> --side buy|sell
```

### 2. Check Holdings
```bash
mm flurbo holdings --pool <poolAddress> --scope <scopeInt> --mask <maskInt>
```

### 3. Execute Trade
```bash
mm flurbo trade --pool <poolAddress> --side buy --scope <scopeInt> --mask <maskInt> --quantity <atoms> --slippage 50
```

### 4. Mathematical Thesis Analysis
```bash
mm flurbo thesis --pool <poolAddress> --a <indexA> --b <indexB> --pA <0-100> --pBgivenA <0-100> --pBgivenNotA <0-100>
```
