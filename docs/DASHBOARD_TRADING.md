# Local wallet trading

The dashboard now supports browser-wallet connection, bounded AUSD approvals and
factored pool buy/sell transactions. The user selected **Firefox with MetaMask**
for the manual signing test. The in-app browser has no detected wallet provider.
No user-wallet signing test has been completed yet.

## Your first manual trade

1. Open `http://127.0.0.1:18765/` in Firefox with MetaMask enabled. Keep the existing
   local Anvil and block helper running. This URL is on your development computer.
2. Use a dedicated test account. In MetaMask, configure/select the local network
   with RPC `http://127.0.0.1:18545`, chain ID `10143`, currency `MON` and a name such
   as `Flurbo local fork`. Public Monad testnet has the same chain ID. If MetaMask
   already has that network, select/add its local RPC entry rather than assuming
   a chain-ID switch chooses the right RPC. The dashboard verifies a block hash
   against its own snapshot and refuses a different fork or public testnet.
3. Select MetaMask under Browser wallet and click **Connect wallet**. Authorize
   the test account in MetaMask. The connected signer is shown separately from
   the address-inspection form. Reading another address does not change the signer.
4. Check that the signer has local AUSD and MON. If it does not, fund only that
   public address on the local node using the commands below. Never paste a seed
   phrase or private key into the dashboard, a source file or chat.
5. Select H YES, Buy, quantity 1, and request a pool quote. Choose a slippage limit
   (default 0.5%), then **Review next step**. Read the account, contract, allowance
   amount or price limit, and proposed gas budget.
6. If approval is needed, click **Confirm approval in wallet** and review/confirm
   it in MetaMask. This only approves spending; it does not buy. After two local
   confirmations, request a **new quote** and review again. An insufficient
   nonzero allowance is first reset to zero in its own confirmed transaction.
7. When the review says Buy, click **Confirm buy in wallet**. The page verifies
   the submitted transaction's exact calldata and the pool's `Traded` event, then
   refreshes balances and positions. Switch to Sell, request another quote, review
   and confirm to sell those same internal pool units.

The quote/review must still be fresh when opening MetaMask. Trade calldata fixes
the maximum cost or minimum proceeds and a deadline up to three minutes from
review, capped before market close. This gives time for the wallet prompt while
the contract continues to enforce the reviewed bounds. An expired wallet prompt
can revert on-chain; do not blindly retry it. ERC-20 approvals have no on-chain
expiry, so the page states the exact amount and spender separately.

## Local test funding, if needed

These commands use the current demo operator's unlocked **local** account and
local token balance. They do not use a private key and do not fund public testnet.
Replace the placeholder with your test account's **public** address. Use only on
the existing verified deployment; if its addresses changed, check its manifest.

```bash
cd /c/Users/anany/Flurbo
export FLURBO_TEST_WALLET=0xYOUR_PUBLIC_TEST_ACCOUNT
cast rpc web3_clientVersion --rpc-url http://127.0.0.1:18545
# Confirm the response identifies Anvil before the following local-only writes.
cast rpc anvil_setBalance "$FLURBO_TEST_WALLET" 0x8ac7230489e80000 \
  --rpc-url http://127.0.0.1:18545
cast send 0xa9012a055bd4e0edff8ce09f960291c09d5322dc \
  'transfer(address,uint256)' "$FLURBO_TEST_WALLET" 10000000 \
  --rpc-url http://127.0.0.1:18545 --unlocked \
  --from 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
```

This sets the test address's local native balance to 10 MON and transfers 10 local
AUSD from the operator. It does not create real funds. The dashboard's balance
refresh should reflect the result. Do not fund the same address repeatedly unless
you intend another transfer.

## Submission and recovery

Every write goes through the selected wallet's `eth_sendTransaction`. The Python
HTTP API still has no send/sign/estimate/write RPC methods. Connection follows
[EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), with
[EIP-6963 provider discovery](https://eips.ethereum.org/EIPS/eip-6963) and an
injected-provider fallback. No key material is read by the page.

Review checks the connected account, fresh local snapshot, balances, exact claim
holding, allowance and successful contract simulation. Gas is estimated, padded
20%, and paired with twice the observed gas price as a proposed legacy fee budget.
The wallet can edit that proposal, so review its prompt. Confirmation repeats the
account/network/simulation checks and sends the same reviewed bounds and calldata.
Account, network, claim, quantity or slippage changes invalidate the review.

An approval is bounded to the reviewed maximum buy cost, never unlimited. Sell
needs the precise internal pool claim; wrapped H YES ERC-20 receipts are separate
and are not automatically unwrapped. Buy and sell do not route through Kuru.

Before opening a send request, the page records a pending action in same-tab
`sessionStorage`, including public account, calldata, limits and eventual hash.
This survives reloads in that tab and contains no secrets. It is not cross-tab
coordination, permanent history or Envio indexing. Use one tab for submissions.
Do not close it while a request is unresolved.

Explicit rejection releases the request. An uncertain response, missing hash,
RPC failure, unknown transaction or replaced transaction stays locked rather than
being resubmitted. If needed, paste the transaction or identical replacement hash
from MetaMask and select **Check submitted transaction**. A different cancellation
transaction will not be represented as a successful trade. **Clear tracking**
requires an explicit acknowledgment after checking the wallet; it does not cancel
a transaction or wallet popup. Changing the page cannot cancel a request already
open in MetaMask.

Success requires matching sender, target, calldata, zero native value, exactly one
matching `Approval` or `Traded` event, and at least two canonical confirmations.
Approval events must match the amount/spender; trade events must match the claim,
quantity, direction and price limit. A successful but different receipt remains
unverified. Two confirmations are a local UX threshold, not a finality guarantee.
Balances are re-read after confirmation; event reconciliation does not pretend
concurrent balance changes are all attributable to one transaction.

## Verification and limits

51 Python tests and 19 JavaScript tests pass, including asynchronous duplicate
submission prevention, account changes while a wallet prompt is open, rejection
versus uncertain errors, restored pending locks and receipt-event matching.

The actual wallet module and Python data model also passed seven transactions on
a disposable Anvil clone at port 18546: approve/buy/sell for `A AND B`, then reset
allowance/approve/buy/sell for H YES. All seven receipts matched. Trade balance and
position deltas were exact; collateral coverage and receipt backing remained true.
That test adapter uses unlocked local accounts and is **not a MetaMask popup test**.
The clone was stopped afterward; the existing demo at 18545 was unchanged.
Evidence is in ignored `target/deployments/dashboard-wallet-rehearsal.json`.

```bash
python -m unittest discover -s scripts -p 'test_*.py'
node --test apps/dashboard/claims.test.mjs apps/dashboard/wallet.test.mjs apps/dashboard/trading-ui.test.mjs
```

To reproduce the integration rehearsal, first start a disposable clone in a
separate terminal while the existing local demo is running:

```bash
anvil --host 127.0.0.1 --port 18546 --chain-id 10143 \
  --fork-url http://127.0.0.1:18545 --silent
```

Then run from the repository root and stop that clone afterward:

```bash
FLURBO_LOCAL_WALLET_REHEARSAL=1 node scripts/rehearse_dashboard_wallet.mjs
```

The script requires Python (`FLURBO_PYTHON` can select its executable), the verified
manifest, an Anvil client and the matching checkpoint. Both its wallet transport
and Python bridge are fixed to the disposable loopback port. Do not point another
service at that port or run a second rehearsal against a clone you want to preserve.

User confirmation in Firefox/MetaMask remains the next manual gate. Settlement,
redemption, wrapping, Kuru order controls, Mera/Agora mobile, CRE, Envio, Alchemy
and the MetaMask Agent Wallet plugin retain their separate milestones. Browser
extension support does not establish the Agent Wallet bounty integration.
