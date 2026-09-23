# H YES receipt conversion

The dashboard now supports wallet-reviewed wrapping and unwrapping for the
canonical H YES receipt used by the current Kuru pair. It converts existing
positions; it does not buy claims, place Kuru orders or pay out AUSD. This is a
step toward the idea's required base-event order-book tier, not completion of
the Kuru integration.

## Manual test

Use Firefox/MetaMask connected to the current verified local fork. If your
internal H YES balance is zero, first buy H YES through the existing trade flow.

1. Under Wallet & Execution, find **H YES receipts**.
2. Set **H YES units to convert** to an amount you hold, for example `1`.
   This input is separate from the composed claim's trading quantity.
3. Click **Review wrap**, inspect the pool, receipt address, amount and gas, then
   **Confirm wrap in wallet**. Confirm in MetaMask.
4. After confirmation, internal H YES falls by that quantity and wallet receipt
   balance rises by the same quantity. AUSD does not change; MON pays gas.
5. Click **Review unwrap**, then **Confirm unwrap in wallet**. After confirmation,
   wallet receipts fall and the same internal H YES units return.

Both actions use the pool's canonical registry and its existing conversion
functions. Neither requires token spending approval. A AND B and other composed
claims cannot be wrapped into H YES. Receipts deposited in Kuru margin are not
in the wallet and must be withdrawn before unwrapping; margin controls are a
subsequent dashboard step. Unwrapped units can be sold while open or redeemed
after resolution.

Conversion remains available after close/resolution, including during a
collateral shortfall, because it does not withdraw collateral. The dashboard
still requires fresh data and equality between canonical receipt supply and
escrow. Redemption has its own stricter collateral-coverage gate.

## Review and verification

Review validates wallet ownership, exact H YES holdings or wallet receipt
balance, the verified local deployment, a matching wallet block hash, simulation
and MON gas budget. The review expires within 30 seconds. Conversion has no
on-chain deadline. Input/account changes invalidate the review, and all actions
share the existing pending lock and same-tab recovery. Success requires matching
calldata and exactly one canonical pool `BaseWrapped`/`BaseUnwrapped` event with
the correct owner, claim, quantity and direction, plus two confirmations.

60 Python and 28 JavaScript tests pass. They include invalid/stale backing,
non-H claims, insufficient wallet receipts despite Kuru margin, changed receipt
identity, wrong/duplicate events, input changes and duplicate submission locks.

The real-EVM rehearsal on a disposable clone at port 18546 buys two H YES units,
wraps one unit, then unwraps `0.4` and `0.6`. All three conversion receipts match.
Internal holdings, wallet receipts, supply and escrow change by exact amounts;
AUSD, pool collateral, required collateral and a one-unit buy quote do not change.
The persistent source pool remains unchanged. The clone is stopped afterward.
Evidence: ignored `target/deployments/dashboard-conversion-rehearsal.json`.
This tests the wallet code against real contracts using an unlocked disposable
account; the actual Firefox/MetaMask conversion popup still needs a manual check.

Start a fresh clone in another terminal while the source demo and dashboard run:

```bash
cd /c/Users/anany/Flurbo
anvil --host 127.0.0.1 --port 18546 --chain-id 10143 \
  --fork-url http://127.0.0.1:18545 --silent
```

Run the opt-in test, then stop only that clone:

```bash
FLURBO_LOCAL_CONVERSION_REHEARSAL=1 node scripts/rehearse_dashboard_conversion.mjs
```

Set `FLURBO_PYTHON` if the default Python command is unavailable. All mutation
requests are fixed to the disposable port, and Anvil/chain/checkpoint checks run
first. Do not reuse a clone whose clock was advanced for the redemption test.
