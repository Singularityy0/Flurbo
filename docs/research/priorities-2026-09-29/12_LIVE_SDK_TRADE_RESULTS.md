# Four-SDK public testnet transaction rehearsal

Date: 29 September 2026. Status: all four SDK purchases confirmed and independently verified at 00:09:24 UTC. The separate settlement lifecycle and human holder redemption subsequently completed; SDK-wallet redemption was not part of this test. No commit, push or production change.

## Scope

The operator requested a real trade through each SDK while the separate settlement rehearsal awaits its source windows. This exercises the actual TypeScript, Python, Rust and C++ SDK transaction components against the fresh public Monad testnet pool. It is not an authenticated headless-agent, autonomous research, strategy, semantic validation or economic-performance test.

The isolated SDK trader is `0x4ca298cef6f7ed988197fa9e50272af9d2371fa7`. It is separate from the settlement bot, creator, reviewers and the human's MetaMask trading wallet. Its key was generated locally and stored using Windows DPAPI encryption. The key is supplied to one child process at a time and is never placed in command arguments, logs or this report. Keep wallet files and signed-transaction journals private.

The human funded this wallet through MetaMask. Before execution, read-only chain queries verified 5 test MON and 20 test AUSD, zero holdings in the first selected claim, and no pending transactions. Test trade caps remain one share and at most one test AUSD per SDK, with a maximum gas reservation of 0.1 test MON per transaction. Additional funding is not permission to increase these caps.

## Deployment

- Network: public Monad testnet, chain 10143.
- Pool: `0xab8370662403b730a481973f4824c7c7d37d0163`.
- Rules: `0x7a9bdf6889f14e19bba2a8b3ccbdaa37c9af9baaaabf7758a31ed7387ea5879d`.
- Trading close: 29 September 2026, 00:36 UTC.
- Inputs: the verified deterministic-test manifest and the current checkout's SDK source.

## Results

| SDK | Position | Purchase hash | Cost in test AUSD | Result |
|---|---|---|---|---|
| TypeScript | A YES, one share | `0xdd4d833d6b49cffae1af08b169db004ff3fb2fc8540267b624ae3d3f05ad8ccc` | 0.512495 | Confirmed, SDK receipt effect and holdings verified |
| Python | A NO, one share | `0xf761ec2f39d8bc0578e4f3dbcd433a0e160333a64039bd0fda97c27b2fbc442e` | 0.487506 | Confirmed, SDK receipt effect, holdings and cash delta verified |
| Rust | B YES, one share | `0xc32a0f49e75b8b92eacfb8bfa85a96e1340aac9af989e01a42ece2441d118955` | 0.512495 | Confirmed, SDK receipt effect and holdings verified |
| C++ | B NO, one share | `0xa7a4fa36c4066f905b8422a489233d74b27cf819d6fe7a9941a92b89203a9b0c` | 0.487506 | Confirmed, SDK receipt effect and holdings verified |

TypeScript approval: `0xf48b97163468433bd905497b8056cee380660c47d91eed9e14fcbcd19e2f8e0c`, followed by its buy at block 66542208. Python approval: `0x43c2d8d57362c10352123d974daec9fac55c3fc0f39d884d0227923c6d946385`, followed by its buy at block 66542417. These are separate allowance and purchase transactions; an allowance alone is never counted as a trade.

Rust approval: `0xd7f2875f0686b102f6a57692c4631807898fc6030b1a5124eb2252e70bb62bce`, followed by its buy at block 66543971. C++ approval: `0x2cb9491815d3488790974a2cb2cfa64935d011ed16e0e1397b3e7dcd279f4acd`, followed by its buy at block 66544178. All eight transactions completed sequentially. The final confirmed and pending nonces were both 8.

Each runner verifies the selected deployment and uses its SDK's native quote reader, transaction builder and validator, signer, and receipt-effect verifier. Test helpers live under the ignored `target/sdk-live-rehearsal` directory. Signed hashes are retained before broadcast, and helpers prevent accidental duplicate purchases on rerun. Transactions are sequential because the four SDKs share this dedicated test wallet.

Public result artifacts under `target/sdk-live-rehearsal` are `typescript.proof.json`, `python-proof.json`, `rust/proof.json`, `cpp/proof.json` and `verified-all.json`. The separate read-only verifier checked all four canonical successful receipts at least two blocks deep, the expected trader and pool, exactly one matching purchase event per receipt, the one-share quantities and current one-share holdings for all four distinct claims. No purchase was substituted with an approval.

Total collateral spent was 2.000002 test AUSD, excluding test MON gas. Remaining collateral was 17.999998 test AUSD, matching deduction from the 20 test AUSD preflight balance. That starting balance was recorded externally before execution; the independent verifier does not re-derive it at a historical block. Quote, approval, native signing and gas-cap checks belong to the reviewed SDK runners. The independent verifier establishes on-chain purchase effects, current holdings and aggregate cash reconciliation; it does not independently establish every runner implementation detail.

## Limits

These deliberate test positions do not establish user demand, strategy profitability, liquidity quality, all SDK feature coverage or production readiness. Settlement, challenges and redemption remain separate acceptance steps. The runtime API's account association, credential lifecycle, execution reporting, policy gate and semantic gate are not exercised by this lower-level SDK test. No substitute responses are injected to claim those gates passed.

The local settlement process interruption and supervised recovery are recorded separately in `11_LIVE_REHEARSAL_RESULTS.md`. SDK trades do not erase that reliability limitation. No settlement-bot key is used for trading and no manual settlement transaction is submitted as part of this test.
