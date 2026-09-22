# Synthetic demo deployment and address manifest

The demo was deployed successfully to a persistent, loopback-only Anvil fork of
Monad testnet. All 16 deployment transactions succeeded. The RPC verifier checked
the resulting manifest, and the Python scanner completed a real HTTP scan against
the deployed pool, Kuru market and executor. Nothing was deployed or traded on
the public network.

The local RPC is `http://127.0.0.1:18545`. The current machine's generated files
are under ignored `target/deployments/`: `demo-unverified.json`,
`demo-verified.json`, `local-scan.json`, `local-scan-report.json`, Anvil logs and
its process ID. Addresses are local to this instance and must not be copied into
a public-network manifest. The RPC must remain running for those addresses to
work. On graceful shutdown, Anvil writes `anvil-state.json`; reload that state
when restarting rather than treating a new empty fork as the same deployment.

## What is deployed

- One eight-event factored pool, b=10 AUSD, ascending elimination order and
  synthetic event labels A–H. The deployer is the immutable trusted resolver.
- One canonical event-H YES receipt: scope 128, local mask 2, six decimals.
- A receipt/AUSD Kuru market with the reviewed six-decimal grid and 30/10 bps
  taker fee/maker rebate settings. The AMM vault remains unseeded.
- The experimental atomic executor bound to that pool, receipt, market and
  operator, holding 20 AUSD. It remains testnet/local code, not a production keeper.
- Ten purchased/wrapped receipt units, with two deposited as an ask at 0.5 AUSD;
  a separate 0.9 AUSD margin deposit backs a two-unit bid at 0.45. Both are
  synthetic demo liquidity supplied by the test operator, not customer activity.

The constructor fixes the close time and settlement rules. There is no early
resolution switch or LP withdrawal right. Initial subsidy funding cannot be
withdrawn by the sponsor. Local tests may advance Anvil time; on public testnet,
the resolver must wait until close. Choose that window before deploying.

## Funding and observed cost

The script requires at least 100 test AUSD before it starts. Actual local
allocation was 55.451775 initial subsidy, 6.201146 for the initial ten-unit buy,
20 for the executor, and 0.9 for the maker bid: **82.552921 AUSD** in total.
The pool initially held 61.652921 AUSD against 10 AUSD maximum liability.
Two receipt units, already included in the initial buy, back the ask.

The 16 local receipts used 11,080,119 gas in total, costing approximately
0.653664 native units as the local base fee evolved. These are local observations,
not a public deployment quote. Foundry's pre-broadcast estimate was higher.
Re-run the dry run to obtain the current native MON funding requirement before
any public broadcast. Do not use the local node's unlocked development account
for a public deployment.

## Reproduce locally in Git Bash

Start a fresh isolated fork in one terminal (omit startup if this instance is
already running):

```bash
cd /c/Users/anany/Flurbo
mkdir -p target/deployments
anvil --host 127.0.0.1 --port 18545 --chain-id 10143 \
  --fork-url https://testnet-rpc.monad.xyz --fork-block-number 64729226 \
  --timestamp "$(date +%s)" --silent \
  --dump-state target/deployments/anvil-state.json
```

In another terminal, confirm the endpoint reports Anvil, then use its local
unlocked account. These faucet and deployment transactions stay on loopback:

```bash
cd /c/Users/anany/Flurbo
cast rpc web3_clientVersion --rpc-url http://127.0.0.1:18545
export FLURBO_DEPLOYER=$(cast rpc eth_accounts --rpc-url http://127.0.0.1:18545 | python -c 'import json,sys; print(json.load(sys.stdin)[0])')
export FLURBO_DEMO_CLOSES_AT=$(($(date +%s) + 604800))
cast send 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C \
  'requestFunds(address)' "$FLURBO_DEPLOYER" \
  --rpc-url http://127.0.0.1:18545 --unlocked --from "$FLURBO_DEPLOYER"

FOUNDRY_PROFILE=demo forge script contracts/script/DeployDemo.s.sol:DeployDemo \
  --rpc-url http://127.0.0.1:18545 --sender "$FLURBO_DEPLOYER" \
  --unlocked --broadcast --slow

python scripts/verify_demo.py \
  --manifest target/deployments/demo-unverified.json \
  --output target/deployments/demo-verified.json --provider local
```

The deployment is a sequence of transactions, not one atomic transaction. If it
fails partway, inspect the receipts and resume/reconcile the same run; blindly
starting over creates another pool. Avoid re-running on the existing demo merely
to refresh metadata. Use the verifier for that.

## Manifest trust boundary and scanner

The script always writes `status: unverified`, even during a dry run. The separate
verifier checks code presence, immutable cluster configuration, rules, resolver,
canonical receipt identity, executor bindings, all pair parameters, Kuru margin
registration, initial executor funding, receipt escrow and collateral coverage.
It pins a block and checks for a reorg. Success adds block/hash, observed code
hashes, balances and deterministic event labels; failure replaces the requested
output with `status: blocked`, invalidating any previous success.

`verified_snapshot` means those RPC checks passed at that block. It is neither
explorer source verification nor a security review, and live dashboard reads must
still check current chain/state. The verifier labels local and public environments
separately. Only the verified manifest should feed the dashboard.

For a scanner run, copy the verified addresses/scope/mask into the scanner's local
configuration. Set fresh gas and MON/AUSD conversion inputs as described in
[the scanner guide](ARBITRAGE_SCANNER.md). Anvil mines on demand, so an idle fork's
block timestamp will become stale; explicitly mine a local block at current time
before scanning. Do not weaken the scanner's freshness rules to hide this.

The completed HTTP run evaluated six candidates. Two Kuru-to-pool candidates
passed, while the other four were rejected. For the 0.5 AUSD budget, it received
0.997 net receipts and 0.718945 AUSD from the pool. RPC gas estimation was 749,511,
with a 936,874 gas limit. The test used an explicitly synthetic 1 AUSD/MON
conversion; resulting profit-after-allowance is not a live market claim.
The scanner made no transaction and did not consume the demo book.

## Public testnet handoff and next task

Public deployment still needs the user's dedicated public wallet address,
locally controlled signing setup, test AUSD and native MON, and chosen close
time. No secret should be sent in chat. The script has no faucet/mainnet path
and reads no private-key environment variable. A public dry run can use the same
script with the selected sender and RPC, omitting `--broadcast`; signing/broadcast
commands should be finalized after that concrete dry run and funding check.

The [dashboard data layer](DASHBOARD_DATA.md) now uses this manifest for cluster
definitions, live quotes, balances/positions, collateral coverage and transaction
status, with offline tests and a real local HTTP rehearsal. The [local dashboard
screen](DASHBOARD_SCREEN.md) now supports manual read/quote testing, with a
separate loopback-only block helper to keep the fork fresh. [Local wallet
controls](DASHBOARD_TRADING.md) now have a seven-transaction rehearsal on a
disposable clone. Next verify the user's Firefox/MetaMask signing flow and perform
full manual lifecycle testing/hosting. Public wallet setup can proceed alongside
those local implementation steps. Mera/CRE/Envio and other partner flows retain
their separate completion gates.
