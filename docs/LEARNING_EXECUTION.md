# Learner proposals and disposable execution rehearsal

Completed: deterministic unsigned proposal generation and a full Rust-learner to
funded-contract execution on a fresh local chain. The persistent dashboard is
unchanged. The rehearsal uses **mintable mock collateral**, not partner AUSD or
historical events. It makes no statistical loss or profitability claim.

## Conversion and checks

`scripts/build_learning_proposal.py` consumes a serialized Ising model and a
single-block pool snapshot. Parameter order is fields first, then lexicographic
pairs, matching the Rust learner. It computes integer coefficients from
`liquidityAtoms * parameter` with exact rational arithmetic and nearest-integer,
ties-to-even rounding, including negative coefficients. It subtracts actual
payout factor tables and shifts each resulting bias table to minimum zero.
Global shifts do not change prices; customer payouts are never rewritten.

The builder checks parameter/energy domains, collateral precision, snapshot
identity, revision and deadline fields, factor shape/count, combined numeric
domain, fixed elimination width and the contract's movement bound. Nonzero model
edges remain declared even if their coefficients round to zero. A dense model
that exceeds width 2 rejects; no pruning or clipping is used to make it fit.

Within the 1–8 event comparison-model domain, an independent 80-digit Decimal
enumeration compares learned and implied joint probabilities. The default
maximum total-variation discrepancy is 0.000001. Acceptance uses an exact rational
conservative bound: if the energy-error span is E<1, total variation is at most
min(1, E/(1-E)); for E>=1 the bound is 1. This can reject a proposal whose observed
error is smaller. Decimal enumeration is diagnostic only, so extremely tiny
tolerances cannot pass merely because Decimal rounds away the discrepancy.
Neither calculation authorizes funding. Parameter strings fix the builder's input;
cross-platform bitwise equality of upstream floating-point learning is not claimed.

The output contains canonical bias tables, chain/pool/revision/deadline/funding
fields, snapshot block identity and SHA-256 digests of its inputs. Digests provide
provenance, not authentication. The contract still authenticates the updater.
The caller must verify the snapshot block hash and current revision and simulate
the exact proposal on-chain for funding, cooldown, epoch limits and transfer
checks before submitting it. The proposal builder performs no RPC or signing.

## Run

Export the explicitly synthetic fixture from the actual Rust learner:

```bash
cargo run --offline -p flurbo-core --example parlay_model > target/learning-model.json
```

Build a proposal from an already captured snapshot:

```bash
python scripts/build_learning_proposal.py \
  --model target/learning-model.json --snapshot path/to/snapshot.json \
  --max-funding 1000000 --deadline FUTURE_CHAIN_TIMESTAMP
```

All on-chain integer fields in the JSON use decimal strings; `events`, `decimals`
and the elimination-order array use JSON integers. The funded snapshot fields
are `schema`, `chainId`, `pool`, `blockNumber`, `blockHash`, `timestamp`, `closesAt`,
`revision`, `liquidity`, `maxBiasMovement`, `events`, `decimals`, `order`, `factors`
and `biasFactors`. Its schema is `flurbo.funded-snapshot.v1`. Factor rows contain
`scope` and `values`. Model schema is `flurbo.ising-model.v1`, with `events` and
decimal-string `parameters`. The rehearsal captures a complete concrete example.

Run the entire isolated rehearsal, with Foundry and Cargo on PATH:

```bash
python scripts/rehearse_learning_update.py --execute-local
```

The optional `--anvil`, `--cast`, `--forge` and `--solc` arguments select local
executables. The default compiler path is `target/tools/solc-0.8.28.exe`.
The runner refuses an occupied port, starts its own hidden Anvil at
127.0.0.1:18547 on chain 31338, checks its unique genesis timestamp and stops only
that process in `finally`. It has no RPC override and never contacts the persistent
demo. The synthetic clock is intentionally unrelated to wall-clock dates.
No private keys are read or exported; transactions use ephemeral unlocked Anvil
accounts. Contract artifacts are rebuilt before deployment.

It deploys, mints mock collateral, funds the pool, buys A AND B, captures a pinned
snapshot, generates/simulates/submits the learned update, verifies the exact event
proposal hash and funding/payout/bias state, rejects stale replay, and sells the
claim. Results and input/source/artifact hashes are saved under a unique ignored
`target/learning-rehearsal/<run>/` directory as model, snapshot, proposal and report
JSON. The chain is stopped; those transaction hashes are local evidence, not public
explorer links or a persistent manual-testing environment.

## Observed synthetic result

Two events, b=10, uniform learner, one observed A AND B target of 0.8 with
field/pair learning rates 0.2; one pre-existing A AND B unit:

| Measurement | Result |
|---|---:|
| Quantization total variation | about 9.056e-9 |
| Extra funding | 0.794857 mock collateral units |
| Next 1-unit buy quote before / after update | 0.279202 / 0.301270 |
| Existing maximum payout before / after update | 1 / 1 |
| Trader buy–update–sell profit | 0.021118 |
| Final cash / conservative reserve | 14.636683 / 14.636683 |
| Update transaction gas in this fixture | 638,782 |

The profitable round trip is a funding cost, not evidence of manipulation
resistance. Tests: **70 Python tests passed**, including eight new proposal tests;
Rust Clippy/all-target checks and formatting passed; the full disposable EVM flow
passed with exact funding and cash reconciliation. Solidity sources were unchanged
in this phase; the runner rebuilds and checks deployment-size limits.

## What remains

For manual browser testing of learned updates, the next phase is a dedicated
funded-pool dashboard deployment and operator review/approval UI. It must show
proposal provenance, price changes, quantization error, required funding and
limits, and reconcile the resulting transaction. The existing dashboard still
tests ordinary pool trading. Automatic live signal ingestion and ordering policy
remain separate from the explicit synthetic model export used here.

The wider project still has substantial milestones: tradable conditional claims;
complete Android/Mera passkey, session and recovery flows with Agora/AUSD;
official-source CRE settlement and live indexing; public Kuru liquidity/keeper
operation and remaining partner evidence, including the MetaMask Agent Wallet
plugin. Missing sponsor criteria, domain configuration and access credentials
require human input when those tasks are reached. Exact historical-paper
reproduction still requires the source dataset and experiment details. These are
not counted as finished by this rehearsal.
