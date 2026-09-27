# flurbo-sdk for Rust (0.2.0-beta.0, private)

Purchase safety: the updated runtime requires the backend outcome-compatibility endpoint before approving or signing a new buy. Known collisions stop the purchase; unknown combinations abstain. Paper fills use the same check. Sell, redemption and already-signed recovery remain available. Review [configuration and rollout requirements](../../protocol/specs/semantics.md) before upgrading a live agent.


Rust SDK and runtime for Flurbo agents on Monad testnet (chain 10143, test assets only), built against the shared protocol in [protocol/](../../protocol) and checked against the same golden fixtures as the TypeScript reference. Not published to crates.io. Not a mainnet product and not a promise of profit.

## Setup

A Rust toolchain (tested with 1.97.1). From a checkout of the repository:

```bash
cd packages/sdk-rust
cargo build --release
./target/release/flurbo-agent-rs init --config flurbo-agent.json
```

Dependencies: `k256` (secp256k1 with RFC 6979 signing), `sha3` (keccak), `serde` and `serde_json`, `getrandom`, and `ureq` with rustls for HTTP. All are MIT or Apache-2.0, except rustls's own dependencies (ISC, BSD-3-Clause) and the bundled web root certificates (CDLA-Permissive-2.0). The protocol core (`claims`, `abi`, `amounts`, `policy`, `recovery`, `effects`, `research`, `strategy`, `transaction`, `protocol`) does no I/O.

The configuration file is the same `flurbo.agent-config.v1` format the TypeScript and Python runtimes use. Secrets come only from environment variables named in it: `FLURBO_AGENT_TOKEN`, `FLURBO_AGENT_PRIVATE_KEY` for live mode, and your model provider's key variable.

| Command | Effect |
| --- | --- |
| `flurbo-agent-rs start [--once]` | Run the loop in the foreground |
| `flurbo-agent-rs stop` | Ask a running agent to stop after its current step |
| `flurbo-agent-rs status` | Mode, transactions in progress, what the last run recorded |
| `flurbo-agent-rs recover` | Reconcile and report existing transactions only |
| `flurbo-agent-rs address` | The agent wallet address |
| `flurbo-agent-rs sign-message --file F` | Sign a Flurbo wallet association message (refuses anything else) |

Add `--config flurbo-agent.json` to each. Ctrl+C ends the process at once; the journal is crash-safe, so the next start reconciles any transaction that was in flight. Use `stop` to finish the current step first.

## What it implements

- Headless API client (credential only in the Authorization header), chain reads with deployment verification, calldata encoding and validation before signing, and a local key signer behind the `Signer` trait for remote signers.
- Deterministic policy with Flurbo's published policy as a tightening layer. Live permission requires local live mode, live trades allowed on Flurbo, not paused and a fresh policy.
- A journal in the same format and with the same lock file as the other runtimes, keeping fields it does not know. Crash recovery resends only identical signed bytes; replaced and expired transactions are released; receipts are verified one block deep before success is reported; reporting is idempotent.
- Research: allowlisted retrieval, OpenAI-compatible and Anthropic adapters with timeouts, bounded retries and request budgets; validated model output; abstention with reasons; fixtures labelled as fixtures.
- The reference strategy `joint-edge` v1, identical to the other SDKs on `protocol/fixtures/strategy.json`, and any custom `Strategy` or `Forecaster` implementation.

Control, custody and attribution are as described in [packages/sdk/README.md](../sdk/README.md). Credentials only read and report. Keys stay local. Policies are software checks, and pause and revocation are instructions to a compliant runtime, not on-chain freezes.

## Examples

- `cargo run --example offline_pipeline`: offline pipeline with a fixture forecaster (not AI).
- `cargo run --example ai_agent -- flurbo-agent.json`: a real model provider from the configuration.
- `cargo run --example custom_strategy -- flurbo-agent.json`: your own strategy and research plugged into the runner.

## Tests

```bash
cargo test
```

`tests/conformance.rs` runs every shared fixture: claims, calldata, signed transactions and messages byte for byte, amounts, policy, recovery, research and strategy. `tests/runtime_units.rs` covers retrieval, providers, budgets, the headless client, the journal lock across processes and the command line. `tests/local_chain.rs` trades on a local anvil chain against the real Flurbo API through `packages/sdk/tools/serve-local-stack.ts`. It needs Node 24, anvil and `forge build`, and it skips with a message when they are missing.
