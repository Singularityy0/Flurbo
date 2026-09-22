# Read-only arbitrage candidate scanner

`scripts/scan_arbitrage.py` performs one bounded scan and prints JSON for a future
dashboard or operator. It does not sign, approve, deposit, broadcast or schedule
trades. RPC methods are limited to chain/block/code reads, `eth_call`,
`eth_estimateGas` and `eth_gasPrice`; the existing readiness probes retain their
narrower allowlist. Credentials are read through the existing public/Alchemy
configuration and omitted from errors and output.

## Inputs and deployment gate

Copy `config/arbitrage-scan.example.json` to an ignored local file such as
`target/arbitrage-scan.json`. Configure the executor, pool, market, receipt, AUSD
and operator addresses; singleton scope/local mask; finite candidate amounts;
and risk/freshness settings. Address and market-price fields are deliberately
empty in the example. There is no public Flurbo deployment to populate them yet.

The current executor is the local experiment in
`contracts/fork/helpers/FactoredArbitrage.sol`. It must already exist and hold
enough AUSD at the selected RPC snapshot. Getter, code, canonical receipt and
pair checks must all pass. A generic Kuru reference market cannot stand in for
the receipt market. Deployment and public execution remain separate work.

Gas policy requires a maximum wei-per-gas price, maximum gas, headroom, positive
minimum AUSD profit, and an operator-supplied MON/AUSD conversion with a recent
Unix timestamp. The conversion is not independently verified by the scanner.
No sample token price is represented as current market data. Precision is one
million AUSD atoms per token and 10^18 wei per MON.

```sh
python scripts/scan_arbitrage.py --config target/arbitrage-scan.json --provider public
# Or use the existing locally configured Alchemy endpoint:
python scripts/scan_arbitrage.py --config target/arbitrage-scan.json --provider alchemy
```

Missing addresses/prices produce a `blocked` report before network requests.
The CLI exits 1 on global configuration/RPC/freshness failure and 0 for a complete
scan, even if every candidate was rejected.

## Candidate evaluation

All state reads, estimates and simulations use the same block number. The scanner
checks its hash again afterward, rejects excessive head advance and discards all
results if block, conversion or deadline freshness expires. RPC providers must
support historical `eth_estimateGas`; it does not silently estimate at latest.

For each configured pool-buy quantity, obtain the pool's conservative executable
cost and simulate Kuru's market sell for net AUSD output. For each Kuru-buy budget,
simulate its market buy for net receipt quantity and obtain that exact quantity's
pool sell proceeds. This queries Kuru's actual matching logic, including depth,
rounding and fees, rather than reconstructing a book from midpoint prices.

Kuru simulations use its pinned zero-sender quote path through `eth_call`.
That path alone does not enforce normal funding, minimum-output or fill-or-kill
semantics. It is only candidate discovery. Every accepted candidate must also
pass the actual executor from its configured operator, with funded balances,
normal Kuru calls and fill-or-kill behavior.

1. Reject insufficient gross spread after venue fees.
2. Estimate the entire executor call with a provisional positive allowance.
3. Add configured gas headroom, check the gas cap and calculate
   `ceil(gasLimit * maxFeePerGasWei * monAusdPriceE6 / 10^18)` AUSD atoms.
4. Reject candidates below minimum profit after that allowance.
5. Encode final calldata, estimate it again within the reserved gas limit, and
   perform a full `eth_call`. Decode and reconcile spend, proceeds, gross profit
   and profit after allowance against the candidate.

Successful rows are ranked by net AUSD gain for the supplied candidates. This is
not an optimal-size search. Rows include exact unsigned calldata, gas limit,
allowance and deadline. Rejections contain a reason and no transaction. The
global report identifies chain/block/hash and the unverified conversion source.
Results are evidence for that snapshot; re-scan before any execution. Transaction
reverts still cost gas, and no MEV protection is provided.

## Validation and limits

The Python suite covers both directions, exact static-tuple calldata, gas rounding,
fee caps, funding/simulation rejection, stale/reorganized blocks, expired prices,
identity mismatches and prohibition of signing/broadcast RPCs. Two additional
fork tests validate the exact scanner selectors against Kuru's zero-sender path,
discard quote-side writes, then compare normal atomic execution and calldata.

The full fork suite now passes 29 tests. These tests and offline scanner tests
are separate evidence: the Python scanner has not yet completed an HTTP scan
against a persistently deployed Flurbo executor. That end-to-end check belongs
to the deployment step, alongside estimating real transaction costs.

Run:

```sh
python -m unittest discover -s scripts -p 'test_*.py'
FOUNDRY_PROFILE=kuru_fork forge test --fork-url https://testnet-rpc.monad.xyz -vv
```

## Next delivery target: manual test dashboard

Prioritize a usable manual testnet surface over more scanner features. The next
five implementation slices are:

1. Reproducible demo deployment and address manifest, with a documented funding
   requirement and synthetic event rules; verify scanner HTTP operation there.
2. Dashboard data layer: cluster definitions, executable quotes, pool coverage,
   receipt positions, Kuru state and transaction status.
3. Interactive screen: event/leg selection, amount, quote and position display,
   with clear pending, rejected and confirmed states.
4. User-authorized testnet transactions for buy, sell, wrap/unwrap and redemption,
   plus test-only resolver controls for the synthetic cluster.
5. End-to-end manual checks and hosted access, with an explicit feature checklist.

This first dashboard tests contract flows. The required Expo/Mera/AUSD consumer
experience, passkey recovery, CRE settlement, Envio history and other partner
flows remain additional gates. Public deployment needs the user's dedicated
account/funding setup; Mera requires the domain and pending bounty requirements.
An estimated 4–6 focused tasks / 2–4 working days to the first usable dashboard
is a planning range, dependent on access and integration issues, not a delivery
guarantee or a claim that every integration will be complete then.
