# flurbo-sdk for Python (0.2.0b0, private)

Python SDK and runtime for Flurbo agents on Monad testnet (chain 10143, test assets only), built against the shared protocol in [protocol/](../../protocol) and checked against the same golden fixtures as the TypeScript reference. Not published to PyPI. Not a mainnet product and not a promise of profit.

## Setup

Python 3.11 or later. From a checkout of the repository:

```bash
cd packages/sdk-python
python -m venv .venv
.venv/bin/pip install -e .          # Windows: .venv\Scripts\pip install -e .
python -m flurbo_sdk init --config flurbo-agent.json
```

Runtime dependency: `eth-account` (MIT, Ethereum Foundation) for secp256k1 signing, EIP-1559 serialization and keccak. The protocol core (`claims`, `abi`, `amounts`, `policy`, `recovery`, `effects`, `research`, `strategy`, `transaction`, `protocol`) uses only the standard library.

The configuration file is the same `flurbo.agent-config.v1` format the TypeScript runtime uses. Secrets come only from environment variables named in it (`FLURBO_AGENT_TOKEN`, `FLURBO_AGENT_PRIVATE_KEY` for live mode, and your model provider's key variable).

| Command | Effect |
| --- | --- |
| `python -m flurbo_sdk start [--once]` | Run the loop in the foreground |
| `python -m flurbo_sdk stop` | Ask a running agent to stop after its current step |
| `python -m flurbo_sdk status` | Mode, transactions in progress, what the last run recorded |
| `python -m flurbo_sdk recover` | Reconcile and report existing transactions only |
| `python -m flurbo_sdk address` | The agent wallet address |
| `python -m flurbo_sdk sign-message --file F` | Sign a Flurbo wallet association message (refuses anything else) |

Add `--config flurbo-agent.json` to each.

## What it implements

- Headless API client (credential only in the Authorization header), chain reads with deployment verification, calldata encoding and validation before signing, a local key signer behind a `Signer` interface for remote signers.
- Deterministic policy with Flurbo's published policy as a tightening layer; live permission requires local live mode, live trades allowed on Flurbo, not paused and a fresh policy.
- A journal in the same format and with the same lock file as the TypeScript runtime; crash recovery that resends only identical signed bytes; replaced and expired transactions released; verification of receipts one block deep before reporting success; idempotent reporting.
- Research: allowlisted retrieval, OpenAI-compatible and Anthropic adapters with timeouts, bounded retries and request budgets; validated model output; abstention with reasons; fixtures labelled as fixtures.
- The reference strategy `joint-edge` v1, identical to the TypeScript reference on `protocol/fixtures/strategy.json`, and any custom strategy object with `id`, `version` and `decide(ctx)`.

Control, custody and attribution are as described in [packages/sdk/README.md](../sdk/README.md): credentials read and report only, keys stay local, policies are software checks, pause and revocation are instructions to a compliant runtime, not on-chain freezes.

## Examples

- `examples/offline_pipeline.py`: offline pipeline with a fixture forecaster (not AI).
- `examples/ai_agent.py`: a real model provider from the configuration.
- `examples/custom_strategy.py`: your own strategy and research plugged into the runner.

## Tests

```bash
.venv/Scripts/python -m unittest discover -s tests -v
```

`tests/test_conformance.py` runs every shared fixture (claims, calldata, signed transactions and messages byte for byte, amounts, policy, recovery, research, strategy). `tests/test_local_chain.py` trades on a local anvil chain against the real Flurbo API through `packages/sdk/tools/serve-local-stack.ts` (needs Node 24, anvil and `forge build`).
