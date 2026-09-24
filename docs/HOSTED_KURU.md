# Hosted Kuru operations

Implemented for the original public Monad testnet H YES receipt / AUSD pair.
The authenticated `/kuru` page uses the existing deployment manifest and the
same cream, green and lime workspace styling. No new contract deployment,
environment variable, server key or keeper is required. The learning pool has
no Kuru pair and cannot be substituted into these routes.

## What is available

- Mera login with either unlocked Mera signing or an explicitly selected browser
  wallet. Balances always belong to that trading wallet.
- Exact token approvals, own-account margin deposits and margin withdrawals for
  AUSD and the canonical H YES receipt. A deposit with insufficient allowance
  presents an approval review first. Approval and deposit are separate actions.
- Post-only limit buys and sells; single-order cancellation; fill-or-kill market
  buys and sells from available margin with a user-reviewed minimum received.
- Current wallet and available margin balances, indicative bid/ask, paginated
  regular open orders, and recent order/fill/cancel events with explorer links.
- Read-only comparison using the existing atomic arbitrage scanner. It checks
  executor inventory, fees, gas and full-route simulation for one receipt in the
  pool-first direction and 0.5 AUSD in the book-first direction. A hypothetical,
  explicitly entered MON/AUSD conversion is not an independently verified price.
  Nothing in this page sends an arbitrage transaction or runs a keeper.

## Limits and transaction handling

The UI caps each action at 100 units. Limit price is at most 1 AUSD, in 0.0001
steps; limit size is 0.01 to 100 receipts, in 0.01 steps. Flip orders, native-asset
pairs, fee collection, vault provisioning and batch liquidity management are not
exposed. These are separate product choices, not implicit authority granted to
the hosted service.

Before confirmation, the client checks the signed-in session, selected wallet,
chain, canonical snapshot, deployment identity, pool readiness for new trades,
exact transaction simulation, gas budget and pending nonce. Review lasts five
minutes. There is no on-chain time deadline in Kuru's order entry functions;
price, post-only and minimum-output protections remain encoded in the call even
if the wallet prompt stays open. A posted limit order persists until filled or
cancelled. Network fees can still be spent by a reverted transaction.

Public tracking is saved before opening the wallet prompt. Reloads restore it.
Only explicit wallet rejection clears a failed submission automatically;
ambiguous outcomes require checking wallet activity or attaching a hash. The
same nonce, sender, target, calldata, value, canonical receipt and matching
contract event must match before confirmation. Two observed canonical blocks
are required; this is not a claim of finality. Replacement hashes are accepted
only when they match the same saved action. Manual clearing never cancels a
transaction. A cross-tab Web Lock prevents concurrent Kuru submissions.

The Mera adapter and server share a canonical calldata policy. Deposits can only
credit the signing account, approvals target the configured margin account,
withdrawals can only select the two configured assets, and market orders must
use margin, fill-or-kill and a positive minimum received. Unlimited approvals
and trailing calldata are rejected.

## Data scope

Open orders use 20-ID pages and exclude other owners and flip orders. A retained
storage record is not necessarily active: the reader also checks Kuru's current
price-point head, following the pinned [order book implementation](https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/2060bb2736080c175d80d568bfdb6226bb5abd04/contracts/OrderBook.sol).
Available margin excludes reserved orders. Cancellation refunds the unfilled
remainder subject to contract rounding. Fill event sizes are gross receipts;
they are not net wallet proceeds. Fees and rebates follow the contract, not a
floating-point UI estimate.

Recent activity covers at most 100 blocks and is explicitly labelled incomplete.
`/history` remains the pool-action history; the Kuru page is not a durable full
venue index. Use the transaction explorer for older fills. A wider historical
index, independent customer usage, live arbitrage execution and mainnet readiness
are not established by these controls.

Reader snapshots preserve the existing manifest/runtime and canonical-block
checks. Those checks do not independently establish source equivalence of every
upgradeable implementation. The scanner's execution freshness rules remain
strict in CLI mode. Hosted comparison may display an expired historical result,
clearly labelled, with all unsigned execution payloads removed. Reorged results
are rejected even in comparison mode.

## Validation and deployment

Checks cover canonical payload restrictions, own-account custody, Mera relay
authorization, separate approval/deposit reviews, account/nonce/gas changes,
ambiguous submissions, reload recovery, exact event verification and responsive
authenticated browser routes. The existing 14 Kuru lifecycle tests also passed
on the pinned local Monad fork, including partial/full fills, fee and rounding
accounting, cancellation, withdrawal and slippage rollback. No public transaction
was submitted by development checks.

The public read-only check at block 65,319,806 found order 1, bid 0.45 for two
receipts, and order 2, ask 0.50 for two receipts. This is point-in-time evidence,
not a promise that this depth is still available.

The hosted comparison was also checked against public block 65,322,050. With a
hypothetical conversion of 1 AUSD per MON and a 300 gwei cap, both directions
were rejected after spread/gas checks. The report was correctly marked expired
because the public head advanced during reads. No profitable execution or signed
payload was reported.

Push the code and wait for Render's container build to succeed. Keep the original
`FLURBO_MANIFEST_JSON`, RPC and Mera configuration unchanged. Then open `/kuru`.

### Public acceptance requiring your wallet

1. Sign in with Mera and connect a funded test trading wallet. Check the displayed
   full trading address before every action. Mera and MetaMask funds are separate.
2. Review a 1 AUSD deposit. Confirm the exact approval if requested, check its
   confirmation, then review and confirm the deposit. Available margin should
   increase by 1 AUSD while wallet AUSD decreases by 1.
3. If the spread still permits it, post a 0.01 receipt bid at 0.40 AUSD. Confirm
   the resulting order ID, side and remaining size. Cancel that order through a
   new review and check the remaining reserve returns to available margin.
4. Withdraw the available AUSD and confirm it returns to the same trading wallet.
5. To check a real fill, use a different funded test account from the maker. Read
   current depth before choosing a small market buy. If the ask is still 0.50,
   a 0.5 AUSD input previously yielded 0.997 receipts after the 0.30% taker fee.
   Enter your own minimum received, review the simulation, confirm, and record
   the transaction hash and both accounts' resulting margin balances. A self-fill
   or two test accounts does not establish independent customer demand.
6. Withdraw received receipts to the wallet, then separately test receipt
   approval/deposit, post-only ask and cancellation. Receipt sizes off the limit
   order step can remain available as dust and can still be withdrawn.
7. Reload during a pending transaction and verify tracking resumes without a
   second send. Confirm the original pool, learning pool and portfolio still work.

Public fill/cancel/withdraw acceptance and the Render build remain release gates
until the user completes them. Do not describe the local fork test as a public fill.
