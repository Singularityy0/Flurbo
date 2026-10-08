# MetaMask Agent Wallet Plugin for Flurbo Prediction Markets

> Status: `mm flurbo quote` is a built read-only plugin command. No Agent Wallet trade command or live wallet submission has been verified. See `METROPOLIS_PARTNER_DESIGN.md`.

Author: Flurbo Team
Date: October 2026
Competition: Monad Metropolis Hackathon
Target Bounty: Best Agent Wallet Plugin ($2,500 USD)

---

## 1. Overview and Problem Statement

AI agents participating in decentralized finance face a difficult tradeoff:
1. **Full Custody (Unsafe):** Agents hold raw private keys in memory or configuration files, leaving funds vulnerable to prompt injection, memory scraping, or code exploits.
2. **Read-Only Bots (Inert):** Agents analyze market data but cannot act without human intervention for every individual transaction.

The **MetaMask Agent Wallet** solves this by separating agent intelligence from transaction authorization through programmable signing policies, spending limits, and multi-factor authentication (MFA).

Flurbo provides the first **Combinatorial Prediction Market Plugin** for the MetaMask Agent Wallet, enabling agents to autonomously evaluate and trade multi-event outcome markets on Monad testnet while routing 100% of transactions through Agent Wallet security policies.

---

## 2. Architecture and Security Invariants

```
+-------------------------------------------------------------+
|                  AUTONOMOUS AGENT RUNTIME                   |
|  - Market Intelligence / Signal Ingestion                   |
|  - Kimi AI Forecaster / Joint Thesis Evaluation             |
+-------------------------------------------------------------+
                              |
                              | CLI / Tool Call: mm flurbo trade
                              v
+-------------------------------------------------------------+
|                METAMASK AGENT WALLET CORE                   |
|  - Policy Check: Outflow caps & daily spending limits       |
|  - MFA Trigger: High-value confirmation                     |
|  - Key Isolation: Private keys never exposed to plugin      |
+-------------------------------------------------------------+
                              |
                              | Sign and Broadcast
                              v
+-------------------------------------------------------------+
|                   MONAD TESTNET (10143)                     |
|  - PilotPool.buy(scope, mask, quantity, maxCost, deadline)  |
|  - Factored LMSR State Liability Update                     |
+-------------------------------------------------------------+
```

### Security Invariants
- **Zero Key Handling**: The plugin code in [`packages/metamask-agent-plugin/src/index.ts`](file:///C:/Users/anany/Flurbo/packages/metamask-agent-plugin/src/index.ts) contains zero signing logic and no access to private keys or seeds.
- **Strict Outflow Caps**: Transactions are capped by the Agent Wallet's configured limits.
- **Contract-Level Slippage**: Every order computes `maxCost` (for buys) or `minProceeds` (for sells) on-chain, preventing front-running or excessive price impact.

---

## 3. Deliverables Summary

- **Installable Plugin**: [`packages/metamask-agent-plugin`](file:///C:/Users/anany/Flurbo/packages/metamask-agent-plugin)
- **Agent Skill Reference**: [`skills/flurbo-trading/SKILL.md`](file:///C:/Users/anany/Flurbo/skills/flurbo-trading/SKILL.md)
- **Plugin README & Quickstart**: [`packages/metamask-agent-plugin/README.md`](file:///C:/Users/anany/Flurbo/packages/metamask-agent-plugin/README.md)
