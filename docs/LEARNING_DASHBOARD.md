# Local learning dashboard

This companion to the main trading dashboard runs at `http://127.0.0.1:18766/`.
It uses a separate owned Anvil chain (31339, RPC `http://127.0.0.1:18548`) with
mock collateral. It never attaches to an existing RPC. The main Monad fork on
18545 and dashboard on 18765 are unchanged. Server shutdown discards this lab.

## Run and test manually

From the repository root, with Python, Cargo and Foundry available:

```bash
python scripts/serve_learning_lab.py --execute-local
```

On this Windows workspace, if those executables are not on PATH:

```bash
"$USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" \
  scripts/serve_learning_lab.py --execute-local \
  --anvil "$USERPROFILE/.foundry/bin/anvil.exe" \
  --cast "$USERPROFILE/.foundry/bin/cast.exe" \
  --forge "$USERPROFILE/.foundry/bin/forge.exe"
```

The default compiler is `target/tools/solc-0.8.28.exe`; use `--solc` to select
another installed 0.8.28 compiler. Ports must be free. Stop the foreground server
with Ctrl+C; it terminates only its own Anvil child.

1. Open the URL in Firefox with MetaMask and choose a dedicated test account.
2. Click **Set up test account** and accept the local network request. Setup
   deploys a funded two-event pool, makes this account the immutable updater, and
   tops up to 100 mock tokens and 10 native test gas units. No private key is read.
3. **Review buy**, inspect the bounded approval and confirm it. Review again to
   obtain the separate buy transaction. Each buys one A YES AND B YES unit.
4. **Review learned price**. Inspect the before/after marginal, required funding,
   model and snapshot hashes, and quantization bound. Approve if needed, review
   again, then confirm the update. The update preserves actual holdings/payouts.
5. **Review sell** and confirm. Check refreshed balances and reserve coverage.

The lab assigns one updater account until restart. Reviews expire after 45 seconds
of snapshot age (the on-chain deadline is 120 seconds). Any trade/model revision
invalidates a pending review. No operation is automatically resent. A timeout
requires inspecting the transaction before retrying. The in-app browser has no
MetaMask extension and is a read-only preview of this flow.

## Implementation and evidence

The backend calls the existing Rust synthetic model exporter and deterministic
proposal builder. This is a fixed synthetic two-event learning demonstration,
not live signal ingestion, historical-paper reproduction, or a statistical loss
guarantee. It does not publish updates to the existing AUSD/Monad/Kuru demo.

The browser independently encodes bounded calldata, checks account/network,
checkpoint hash, snapshot hash, revision, updater and collateral, and simulates
before requesting a wallet transaction. It matches the transaction and contract
event to the reviewed action and checks two canonical blocks before success.
Only fixed local deployment/top-up operations can be sent by the setup server;
its HTTP interface has no arbitrary transaction-signing route. Setup requires an
exact localhost Origin and Host, a small JSON body and a public wallet address.

`python scripts/rehearse_learning_lab.py --execute-local` runs a disposable owned
node and HTTP server, then exercises the actual browser-wallet module through a
local RPC provider. It accepts `--node`, `--cast`, and `--anvil` overrides. Compile
fresh artifacts with the server or Foundry first. The test checks wrong origins,
wrong node checkpoints, altered calldata, expired reviews, spending limits,
reverted receipts, reorgs, confirmation depth and the five-transaction lifecycle.
It is not a real MetaMask popup/device test.

Observed lifecycle: approval, buy, funding approval, model update, sell. The
A-and-B marginal moved from 0.2692143494 to 0.2908154058; update funding was
0.794857 mock tokens. Holdings and payout stayed at one unit through the update;
after sale they were zero. Final pool cash and pricing reserve both equalled
14.636683 mock tokens. These are synthetic test observations, not promised returns.

Fast wallet-boundary regression checks run with:

```bash
node --test apps/dashboard/learning-wallet.test.mjs
```

They verify that account/network/revision changes and failed simulations prevent
sending, wallet rejection is not retried, and calldata matches the review.
