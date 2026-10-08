# MetaMask Agent Wallet plugin for Flurbo

> Status (8 Oct 2026): five `mm flurbo` commands are built and unit-tested. A live trade through `mm` has **not** been run yet. Trading counts as working only after the transaction hashes in section 5 are filled in from a real run.

Target bounty: MetaMask Agent Wallet plugin. Scope: Monad testnet (10143), test AUSD only.

## 1. What it does

An AI agent can use Flurbo's combined-claim markets without ever holding a key. The plugin reads pools directly from Monad, builds exact calldata, and asks the Agent Wallet to submit it. The Agent Wallet applies its own policy: Guard Mode outflow limits and MFA.

| Command | Purpose | Wallet access |
|---|---|---|
| `mm flurbo markets` | Pools, questions, claim scopes, close times, trading open or closed | none |
| `mm flurbo quote` | Price of a claim, read from the pool | none |
| `mm flurbo holdings` | The wallet's shares of a claim | `wallet-read`, `accounts` |
| `mm flurbo trade` | Buy or sell; one exact approval when needed | `wallet-read`, `wallet-submit`, `accounts` |
| `mm flurbo redeem` | Redeem after the pool resolves | `wallet-read`, `wallet-submit`, `accounts` |

Code: [`packages/metamask-agent-plugin`](../packages/metamask-agent-plugin). Agent skill: [`skills/flurbo-trading/SKILL.md`](../skills/flurbo-trading/SKILL.md). Install and usage: the package README.

## 2. How a trade flows

```
agent -> mm flurbo trade --pool .. --scope .. --mask .. --quantity .. --approve
  plugin: validate claim, read pool + allowance + balance, quote, apply slippage (cost up, proceeds down)
  plugin: if allowance is short and --approve is given -> approval for exactly the maximum cost
  plugin: simulate the call as the wallet's account
  Agent Wallet executor: shows the intent, applies Guard Mode / MFA policy, signs, broadcasts
  plugin: wait for the approval receipt, re-quote, submit the trade, return the hash
```

## 3. Security invariants

- No key, mnemonic or signing code in the plugin. A test scans `src/` for them.
- Every transaction is handed to `ctx.walletExecutor` with a plain-language intent.
- Approvals are exact, explicit (`--approve`) and never unlimited.
- At most 10 shares per call, slippage 0 to 100 basis points, deadline 60 to 600 seconds.
- Closed, unfunded and resolved pools are refused for trading; unresolved pools are refused for redemption.
- Chain 10143 only, enforced in the manifest (`targetChains`) and in the code.

## 4. What was checked against the real SDK

From the installed `@metamask/agent-wallet` 7.0.0 package, not from documentation alone:

- Manifest: `PluginManifestSchema` accepts the plugin's `package.json#mm`.
- Version gate: the CLI uses `semver.satisfies(cliVersion, minCliVersion)`. The template's `^6.2.0` would refuse CLI 7.x, so the plugin declares `>=6.2.0`.
- Executor request: the CLI's own transfer command submits `{ kind: 'transaction', chainId, transaction: { to, data }, intent: { action, summary } }` to `ctx.walletExecutor(io, commandId)`. The plugin sends the same shape with `action: 'custom'`.
- Account lookup: `ctx.walletStateManager.read()` lists `byokWallets` and `remoteWallets`.

## 5. Live run (to be completed by the wallet owner)

Use a test-only Agent Wallet with Guard Mode and a small outflow limit, funded with 1 test MON and about 50 test AUSD.

| Step | Command | Result |
|---|---|---|
| Install | `mm plugins install "file:<path>" --accept-permissions` | _pending_ |
| Markets | `mm flurbo markets` | _pending_ |
| Quote | `mm flurbo quote ...` | _pending_ |
| Approve + buy | `mm flurbo trade ... --approve` | approval hash _pending_, buy hash _pending_ |
| Holdings | `mm flurbo holdings ...` | _pending_ |
| Policy approval | Guard Mode MFA prompt answered | _pending_ |

If `mm chains list` does not list Monad Testnet (10143) or the executor refuses the chain, report it to MetaMask and do not describe trading as working.
