# Manual dashboard data layer

`scripts/dashboard_data.py` supplies live, read-only data from the verified demo
manifest. `scripts/serve_dashboard.py` exposes it as a loopback HTTP API. This is
the data-layer milestone; the [interactive screen](DASHBOARD_SCREEN.md) now runs
on the same service. User-signed transactions are next. The API does not sign, approve, trade, resolve, mine blocks or
publish a site.

## Start and inspect

The existing persistent local demo must be running, and the manifest must have
passed [deployment verification](DEMO_DEPLOYMENT.md). From Git Bash:

```bash
cd /c/Users/anany/Flurbo
python scripts/serve_dashboard.py \
  --manifest target/deployments/demo-verified.json --provider local --port 18765
```

The current machine has this service running in the background; do not start a
second instance on the same port. Its PID and logs are under ignored
`target/deployments/dashboard.*`. The server binds only to `127.0.0.1`; public or
Alchemy provider choices change the upstream RPC, not the server's exposure.
The manifest environment must match the selected provider. Public deployment
and hosting remain pending.

| Endpoint | Returns |
|---|---|
| `/api/health` | Process liveness and read-only status; deliberately does not claim chain health |
| `/api/state` | Synthetic event definitions, contract addresses, pool lifecycle, backing/coverage, executor balance and indicative Kuru bid/ask |
| `/api/state?wallet=0x...&claims=128:2,3:8` | The same snapshot plus that wallet's AUSD/native/receipt balances, pool allowance, available Kuru margin, and requested internal claim holdings |
| `/api/quote?side=buy&scope=128&mask=2&quantity=1000000` | Current pool buy cost for one event-H YES unit; `side=sell` reads pool sale proceeds |
| `/api/transaction?hash=0x...` | Unknown, pending, awaiting receipt, succeeded or reverted state; canonical inclusion block, confirmation count and gas used when available |

POST is rejected. The API does not forward arbitrary RPC methods or accept an
RPC URL in a request. Browser access is same-origin with host/origin checks and
no CORS allowance. Every response disables caching; errors omit remote bodies,
credentials and stack traces. A new RPC client is used per HTTP request.

## Data semantics

All monetary values, quantities, allowances, gas amounts and WAD prices are
decimal strings. The browser must use integer/BigInt arithmetic, not floating
point for token amounts. AUSD/receipts have six decimals; native balances are
wei; Kuru top-of-book prices use 10^18 precision. Empty-book sentinels become
`null`, not a fake zero or an enormous price.

Without a wallet query, `wallet` is `null`. Selecting an address reads its public
state; it does not connect or authenticate a wallet. Claim balances cover only
the requested list (up to 16 valid local Boolean claims). The default list is
YES/NO for each of the eight events. This is not complete portfolio discovery;
composed claims must be explicitly requested until indexing exists. Available
Kuru margin excludes funds reserved by resting orders, and the API does not yet
enumerate those orders. Wrapped ERC-20 units are shown separately from internal
pool claims to avoid double counting.

Pool collateral and required collateral are distinct. Their difference is
coverage surplus, not LP profit or withdrawable balance. Receipt total supply
must equal the pool's escrow holding. Shortfall or escrow mismatch is visible
and disables `trading_available`. Closed and resolved pools remain readable;
remaining collateral after resolution uses the pool's actual payout obligation.
The data layer does not impose the deployment verifier's initial 20-AUSD executor
balance requirement on subsequent reads.

Pool quotes come from `quoteBuy`/`quoteSell` for the exact claim and quantity.
They do not prove wallet ownership, allowance or execution success. Execution
must recheck price/deadline and supply slippage bounds. Unsupported/rejected or
unavailable quotes return `quote: null` with a reason, with no cached-price
fallback. Kuru bid/ask is explicitly indicative top-of-book information, not an
executable quantity quote or an RFQ.

Transaction inclusion is checked against its canonical block. Confirmation count
does not assert finality. `targets_demo` distinguishes configured contract targets
from unrelated transactions; this field is not proof that a particular user
action or amount succeeded. Event-specific reconciliation comes with transaction
controls.

## Consistency and validation

Each read validates chain/environment, the deployment checkpoint, observed code
hashes, pool immutable configuration, the canonical receipt and Kuru parameters.
Mutable chain reads use one block number, then recheck its hash. A changed code
or deployment checkpoint requires manifest re-verification. Proxy implementation
security is not established by a proxy runtime hash alone.

Snapshots older than 30 seconds, future timestamps, or head advance beyond two
blocks are marked stale. Trading is disabled and quotes are removed. The quote
window also stops before market close. An idle Anvil fork does not automatically
mine fresh blocks; refresh its local clock/block explicitly during development.
The read API never performs that write. The browser must show stale/unavailable
state instead of treating the last response as live.

Offline tests cover exact strings, unconnected wallets, scoped positions,
closed/resolved markets, shortfalls, stale data, rejected quotes, manifest/code
mismatches, reorgs, receipt states and the RPC write prohibition. The complete
Python suite passes 46 tests. A real HTTP rehearsal at local block 64,729,245
verified stale-quote suppression, fresh state/positions, a 0.740737-AUSD buy quote
for one event-H YES unit, an included deployment transaction, and method/origin
rejection. Evidence is saved locally as `target/deployments/dashboard-http-check.json`.

```sh
python -m unittest discover -s scripts -p 'test_*.py'
```

The [visible screen and local clock helper](DASHBOARD_SCREEN.md) are now available.
Next add user-authorized transaction controls and perform manual testing/hosting. Expo/Mera accounts, CRE settlement,
Envio history and other required partner flows keep their own completion gates.
