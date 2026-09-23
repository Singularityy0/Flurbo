# Run and test the local dashboard

Open **http://127.0.0.1:18765/** on this computer. The current development service
and local block helper are running in the background. The browser screen now
uses the [dashboard API](DASHBOARD_DATA.md) against the persistent local Monad
fork. No package install, frontend build, wallet connection or hosting account
is needed for this screen.

The original read-only screen now also has [local wallet transaction controls](DASHBOARD_TRADING.md)
for AUSD approvals and pool buy/sell. Kuru orders, resolution and redemption
controls remain upcoming. It does not replace the Expo/Mera mobile product or complete any
partner bounty. Tradable conditionals remain a separate accounting milestone.

## What to try

1. Check that the status says **Chain data is fresh**. Pool collateral, maximum
   outstanding liability, coverage surplus and close time come from the chain.
   Coverage surplus is not LP profit or a withdrawable balance.
2. Leave H selected, direction Buy and quantity 1. Select **Get pool quote**.
   The unchanged demo state returns 0.740737 AUSD. The result is a quantity-specific
   contract quote; it is not a marginal probability and excludes gas.
3. Select A and B as well, choose B NO, and keep AND. The claim is
   `A YES AND B NO AND H YES`, scope 131 and mask 32. At the original demo state,
   one unit costs 0.190392 AUSD. Try OR, then Custom Boolean payout. The checked
   truth-table outcomes pay 1 AUSD per unit; unchecked outcomes pay zero.
4. Try an invalid quantity such as `1.0000001`, or uncheck all custom outcomes.
   Quoting is disabled. The fourth event is disabled after three selections.
   Contract-level graph or numeric-domain rejections still appear as unavailable
   quotes; the screen never substitutes a computed or cached price.
5. Inspect the **public local development address** below with View balances.
   It is only a balance lookup and does not authenticate the account. The current
   demo has eight wrapped H YES receipts, separate from internal pool holdings.
   Positions cover base YES claims plus the current composed claim, not a complete
   portfolio. Available Kuru margin excludes resting-order reserves.
6. Paste the local deployment transaction hash below into Transaction check.
   It should report succeeded and a canonical inclusion block. This does not
   assert finality or reconcile a specific trade's events and amounts.

Local development address (public, not a key):

```text
0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
```

Local deployment transaction:

```text
0x5d207fe0f3664de10e451508414e64025a3fba1073942d5edf0e5be0c1fcf273
```

These identifiers belong to the current isolated deployment. Do not use its
unlocked account or addresses for public-network deployment. A reset fork needs
its own valid manifest and deployment, as described in [the deployment guide](DEMO_DEPLOYMENT.md).

## Restart after stopping the services

Keep the existing Anvil process at `127.0.0.1:18545` running. Do not start an empty
fork over it or rerun deployment just to restart the website. If Anvil was stopped,
restore its saved state and verify the deployment checkpoint first. Anvil's saved
state is only available after a graceful shutdown.

In Git Bash, start the web service (only if it is not already running):

```bash
cd /c/Users/anany/Flurbo
python scripts/serve_dashboard.py \
  --manifest target/deployments/demo-verified.json --provider local --port 18765 \
  --enable-local-wallet-setup
```

In a second terminal, keep local blocks fresh:

```bash
cd /c/Users/anany/Flurbo
python scripts/refresh_local_demo.py \
  --manifest target/deployments/demo-verified.json --watch
```

If `python` opens the Microsoft Store instead of Python, replace it with this
machine's bundled executable:

```bash
/c/Users/anany/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
```

Ctrl+C stops a foreground service. The background instances started during this
task record their process IDs in `target/deployments/dashboard.pid` and
`dashboard-clock.pid`, with corresponding stdout/stderr logs. Stop only the
matching Python process if using Task Manager; leave the separate Anvil process
running to preserve the deployment. Do not launch duplicate instances.

The clock helper is a separate development tool. It has a fixed loopback endpoint,
requires an Anvil client on chain 10143 and a verified local manifest, validates
the deployment before starting, and checks its checkpoint before every write.
It mines empty blocks at current wall time every ten seconds. It refuses a chain
already ahead of wall time. It does not sign transactions or accept a public RPC.
Running it naturally advances the market toward its immutable close time; it
does not reopen a closed pool. Omit `--watch` to mine once.

The server remains loopback-only. Omit `--enable-local-wallet-setup` to keep the
HTTP API read-only. With it enabled, **Set up local wallet** can request wallet
network setup, verify the fork and top up local test balances as described in
[the trading guide](DASHBOARD_TRADING.md). Approvals/trades still require wallet
confirmation. Opening
this URL on an Android phone would refer to the phone's own loopback interface;
this milestone is for a browser on the development computer. Phone-width browser
validation is not native Android/Mera validation.

## Freshness and request behavior

The page refreshes chain state every 15 seconds while visible. You can also use
Refresh data. A stopped clock helper makes the fork stale after 30 seconds;
stale data stays labelled as a last snapshot and quotes become unavailable.
An unreachable API clears live values. Inputs invalidate pending quote responses,
and editing a wallet address clears the previous wallet view. Quote expiry is
checked locally every second even without a new server response. A new snapshot
also invalidates an earlier quote. Pending wallet requests are now recorded in
same-tab session storage for recovery, as described in the trading guide; ordinary
address inspection and quotes are not persisted. Automatic state refresh pauses
while a review, wallet request or submitted transaction is active.

Static assets are explicitly allowlisted. No arbitrary files, directories or
RPC URLs are served. Same-origin/host checks, a restrictive content security
policy and no-store headers apply to the page and API. JavaScript uses BigInt
for amounts and text nodes for displayed API data. CSS and modules are local;
there are no third-party scripts, fonts or CDN calls.

Validation: 50 Python tests, four JavaScript tests (including all nonconstant
truth tables over up to three events and quantities above JS safe-integer range),
and real browser checks for base/multi-leg/custom quotes, quantity rejection,
wallet balances and canonical transaction status. Desktop and 390-pixel viewport
checks found no horizontal overflow. Stale-quote handling is also checked against
the real local fork with the block helper stopped.

```bash
python -m unittest discover -s scripts -p 'test_*.py'
node --test apps/dashboard/claims.test.mjs
node --check apps/dashboard/app.mjs
```

Next: the user's Firefox/MetaMask signing test, full manual lifecycle testing
and a hosting decision. Public deployment and the Mera/CRE/Envio/Alchemy/MetaMask
partner work retain their own completion gates in [the integration checklist](INTEGRATIONS.md).
