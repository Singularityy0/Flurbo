# Flurbo MetaMask Agent Wallet plugin

Trade Flurbo prediction-market pools on Monad testnet from the MetaMask Agent Wallet CLI (`mm`). Pools hold two to four related questions and price any one-to-three question claim ("ETH above 2575 AND BTC above 83000") as one share, so an agent can quote, buy, sell, check and redeem combined claims.

Testnet only (chain 10143), test AUSD with no monetary value.

| Command | What it does | Agent Wallet access |
|---|---|---|
| `mm flurbo markets` | Lists pools, questions, claim scopes and close times | none |
| `mm flurbo quote` | Reads the price of a claim | none |
| `mm flurbo holdings` | Reads the wallet's shares of a claim | `wallet-read`, data access `accounts` |
| `mm flurbo trade` | Buys or sells shares; one exact approval when needed | `wallet-read`, `wallet-submit`, data access `accounts` |
| `mm flurbo redeem` | Redeems shares after a pool resolves | `wallet-read`, `wallet-submit`, data access `accounts` |

Every command is limited to chain 10143. The agent-facing description is in [`skills/flurbo-trading/SKILL.md`](skills/flurbo-trading/SKILL.md).

## Install

Requires `mm` (`@metamask/agent-wallet`) 6.2.0 or newer and Node 20 or newer.

```bash
npm install -g @metamask/agent-wallet@latest
mm --version
mm chains list            # Monad Testnet (10143) must be listed

git clone https://github.com/Singularityy0/Flurbo && cd Flurbo/packages/metamask-agent-plugin
npm ci && npm run build

mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:$PWD" --accept-permissions
```

Plugins are experimental in `mm`, so the two `mm config` lines are required for an unpublished plugin.

`npm run build` bundles `dist/markets-snapshot.json` from `config/collections.json`. Rebuild after new pools are registered so `mm flurbo markets` lists them.

### Consent screen

`mm` shows what the plugin may do before it installs. For this plugin:

- `flurbo:quote` and `flurbo:markets`: nothing from the wallet.
- `flurbo:holdings`: read the wallet's account address.
- `flurbo:trade` and `flurbo:redeem`: read the account address and **submit transactions through the Agent Wallet**.
- No command asks for the mnemonic, network management or session data.

### Version range

The manifest's `minCliVersion` is `>=6.2.0`. The CLI checks it with `semver.satisfies(cliVersion, minCliVersion)`, so the template's `^6.2.0` would refuse to install on CLI 7.x. `>=6.2.0` accepts 6.2 and every later release; `test/plan.test.mjs` checks it against 6.2.0, 6.9.1 and 7.0.0.

## Use

```bash
mm flurbo markets
mm flurbo quote   --pool <pool> --scope 4 --mask 2 --quantity 1000000 --side buy
mm flurbo trade   --pool <pool> --side buy --scope 4 --mask 2 --quantity 1000000 --approve
mm flurbo holdings --pool <pool> --scope 4 --mask 2
mm flurbo redeem  --pool <pool> --scope 4 --mask 2 --quantity 1000000     # after the pool resolves
```

- `scope` is the bit set of questions (question 0 = 1, 1 = 2, 2 = 4, 3 = 8); `mask` selects the paying outcomes (`2` Yes, `1` No for one question; for two, `8` both Yes, `14` at least one Yes).
- `quantity` is in share atoms: 1 share = 1000000, at most 10 shares per call.
- `trade` takes `--slippage` (basis points, 0 to 100, default 50) and `--deadline` (60 to 600 seconds, default 300). A buy that needs the pool to spend test AUSD stops with `approval_required` until `--approve` is passed; then it sends one approval for exactly the trade's maximum cost, waits for it to be mined, quotes again and sends the buy.
- Add `--json` for machine-readable output.

## Security model

- **The plugin never signs.** There is no private key, mnemonic or keystore anywhere in `src/`, and a test fails the build if one appears. Transactions are handed to `ctx.walletExecutor`, which applies the wallet's own policy, Guard Mode outflow limits and MFA.
- Each submission carries a plain-language intent (for example "Buy 1 Flurbo shares for at most 0.52 test AUSD") that the wallet shows when asking for approval.
- Approvals are exact and explicit: never unlimited, and only with `--approve`.
- Before anything is sent, the plugin checks the chain, that the pool is funded, open and unresolved (or resolved, for redeem), that the claim is valid, balance or holdings are sufficient, and it simulates the call as the wallet's account. Slippage rounds against the trader (cost up, proceeds down).
- Reads use the wallet's own public client; `quote` and `markets` need no login.

## What is verified and what is not

- Verified by `npm test` (12 tests): claim validation, approval-only-when-needed, slippage rounding, limits, redeem checks, the request shape handed to the wallet executor, no key handling in the source, the manifest against the SDK schema, and that `SKILL.md` documents exactly the five commands.
- Verified against the installed `@metamask/agent-wallet` 7.0.0 package: the manifest schema, the version check, and the executor request shape used by the CLI's own commands.
- **A live trade through `mm` is not claimed here.** It counts only with a real transaction hash from a test-only Agent Wallet; hashes from that run belong in `docs/METAMASK_AGENT_PLUGIN.md`.

## Demo script (5 minutes or less)

1. Install as above and show the consent screen.
2. `mm flurbo markets`, pick an open pool and a question.
3. `mm flurbo quote ...` and read the price aloud.
4. `mm flurbo trade ... --approve`; show the intent text, approve in the wallet when Guard Mode asks (email or push), then show the transaction on testnet.monadscan.com.
5. `mm flurbo holdings ...` and show the same position on the Flurbo Portfolio page.

## Development

```bash
npm ci
npm run typecheck
npm run build       # tsc, bundle the market list, oclif manifest
npm test
```

`FLURBO_MONAD_RPC_URL` overrides the read-only RPC used by `quote`.
