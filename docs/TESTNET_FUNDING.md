# Testnet onboarding and operator access

The consumer funding page is `/fund`. Mera authenticates the account; MetaMask
receives the test tokens and signs the faucet request. The user needs test MON
from https://faucet.monad.xyz for gas. No server wallet signs or pays for requests.

On 2026-09-25 the Agora faucet listed for Monad testnet had only one AUSD atom
(0.000001 AUSD); read-only requests reverted with `InsufficientFunds()`.
Official deployment reference: https://docs.agora.finance/developer/contract-deployments.
The official faucet remains the fallback when no Flurbo dispenser is configured.

## Separate Flurbo dispenser

`DeployTestFaucet` deploys `TestAusdFaucet` on chain 10143, then transfers exactly
1,000 test AUSD from the existing deployer into it. It never accesses pool cash,
changes market pricing, or changes settlement. Run the script without `--broadcast`
first to simulate, then with `--broadcast --slow` using the `flurbo-testnet` account.
Inspect both receipts before configuring the app; do not redeploy blindly if the
funding transfer is pending or fails.

Set hosting variable `FLURBO_TEST_AUSD_FAUCET` to the returned faucet address and
redeploy the web service. No new private key or approval is needed by the server.
Before enabling, read `TOKEN()`, `owner()`, `CLAIM_AMOUNT()`, `COOLDOWN()` and the
token's `balanceOf(faucet)`: they must be the existing test AUSD, the deployer,
50,000,000 atoms, 86,400 seconds, and the actual remaining dispenser balance.

Each request transfers 50 test AUSD to the caller; cooldown is 24 hours per address.
The initial budget covers 20 claims. This is a finite test budget, not Sybil
resistance: one person can create multiple addresses. Refill by transferring test
AUSD directly to the dispenser. Only the immutable deployer owner can withdraw
unused inventory through `withdraw(uint256)`. An empty dispenser rejects claims
without consuming the caller's cooldown. Do not fund it with real assets.

Browser acceptance: connect MetaMask on Monad testnet, request once, verify the
receipt and balance increase, reload while pending, and verify the daily cooldown.
Contract and mocked browser tests do not replace this live wallet check.

## Testing tools

Only the server-verified Mera account
`0x2ff9ca4cb64fa82915144e8d9cf6a6ceddaa35e3` receives testing access by default.
`FLURBO_TESTING_OPERATOR_ACCOUNT` optionally changes this single operator identity.
It is a Mera account address, not the deployer, a linked MetaMask wallet, or a
client-supplied address. Existing evidence/learning permissions remain additional
requirements for those operations.

Protected pages: `/account`, `/kuru`, `/events`, `/rehearsal`, `/evidence`, and all
`/privacy-lab` pages/assets. The app hides links and guards client navigation;
the server independently checks sessions on direct requests and tools APIs.
Owner session restoration issues a root-scoped HttpOnly `flurbo_tools` cookie;
it references the same revocable server session, while normal auth cookies keep
their existing `/api` scope. Refresh `/markets` after sign-in before opening a
previously bookmarked tools URL. Logout revokes both usages of the session.

Public rules and content-addressed evidence stay readable. Consumer quotes,
positions, buys, sells and redemption remain available to signed-in users.
These app restrictions do not change permissionless on-chain resolver functions.
Automation calls contracts directly and is unaffected by the app's tools gate.
