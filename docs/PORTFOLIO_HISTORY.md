# Portfolio and history

`/portfolio` and `/history` are dedicated consumer routes using the existing
cream, green and lime workspace design. Both wait for a verified Mera session;
signed-out visits redirect to `/login`. `/account` retains trading and network
tools. The old requested-claims table is no longer the consumer portfolio.

## Wallets and markets

The portfolio remembers the last connected trading wallet in session storage,
scoped to the Mera login address. This public-address preference is not a login,
proof of wallet ownership or signing permission. Users can choose their Mera
wallet or inspect another public wallet. Switching a wallet or market discards
the previous response and cancels its requests. Original and learning positions
are read separately; the wallet's AUSD balance is shared across those pools.

The portfolio discovers all internal claims with activity in the selected pool,
not just the eight base claims or the currently composed combination. Every
discovered claim is checked against the contract's holdings at one pinned block.
Only nonzero holdings appear. Labels preserve AND, OR, NO and custom truth-table
payouts. Settlement shows pending, winning or losing, with redeemable AUSD when
resolved. Amounts remain integers until display. No mark-to-market value, cost
basis or profit is inferred from wallet cash.

The original pool separately shows wallet-held H YES receipts. Other wrapped
tokens, Kuru inventory and open order reserves are not counted as internal
positions. This is a complete internal-claim view for the selected pool, not a
general wallet asset explorer.

History shows successful pool-emitted buys, sells, wraps, unwraps and redemptions,
ordered by block, transaction index and log index. Each entry includes quantity,
cash flow where applicable and an explorer link. Approvals, pending or failed
transactions, direct wallet transfers and Kuru orders are outside this feed.
Existing transaction inspection and pending-trade tracking remain available.

## Read path and completeness

- Authenticated GET `/api/portfolio?wallet=0x...&page=0&history_page=0` reads the
  original pool. `/api/markets/learning/portfolio` reads the learning pool.
- The existing verified readers check network, runtime and deployment anchor.
  Discovery begins at the known public pool creation block, after checking code
  is absent in the preceding block and present at creation. Initial deployment
  trades are included even when they precede the verified manifest checkpoint.
- Pool logs are scanned in bounded ranges and cached across wallets inside the
  reader process. The public Monad RPC has a 100-block range limit; the reader
  batches up to ten such ranges. Other configured RPCs start at 5,000 blocks and
  reduce the range on rejection. Retry resumes without skipping a failed range.
- Each event-bearing block and the range checkpoint are checked against canonical
  block hashes. A changed saved checkpoint resets discovery. Removed, duplicate,
  malformed, wrong-contract or inconsistent events are rejected. Existing final
  snapshot checks run before committing the cache.
- An incomplete scan returns progress, not empty balances. The page continues
  reads until caught up, stops on errors and offers retry. It never sends a
  transaction. Results display their observed block and stale-snapshot warning.
- The cache is in memory and restarts after a reader restart or redeploy. The
  first public-endpoint scan can take minutes; subsequent wallets reuse it.
  Durable indexing is a future operational improvement, not a current guarantee.
- Limits: 20,000 cached pool actions, 512 discovered claims per wallet, 20 rows
  per page, eight cache entries, one concurrent scan per reader. Capacity errors
  return unavailable rather than a silently truncated or complete-looking view.

## Deployment and acceptance

No new contracts, funding or environment settings are needed. Keep both existing
deployment manifests and the configured testnet RPC unchanged. Push the API and
frontend commits together and let Render rebuild.

1. Visit `/portfolio` while signed out and verify sign-in is required. Sign in,
   revisit the route and refresh; the session should restore.
2. Select the wallet used for trading and the correct pool. Allow the first scan
   to finish. Verify an existing combined claim appears without selecting its
   events in the composer. Check another wallet and pool remain separate.
3. Visit `/history`. Verify the completed buy and sell, correct amounts and
   explorer destinations. Reload the route directly.
4. After a fresh reviewed trade, refresh both pages. A fully sold or redeemed
   position disappears while its successful activity remains in history.
5. Check narrow-screen layout and keyboard navigation. Tables scroll within
   their own container; they should not widen the page.

Tests cover discovery, current holdings, sold positions, wallet isolation,
conversion/redemption, pagination, incomplete scans, failed range resumption,
batch boundaries, reorgs, malformed logs, authentication, direct routes and
responsive browser navigation. Public read-only checks are separate from mocked
browser data and never submit trades.

Validation on 2026-09-24: 48 web tests, 47 dashboard tests, 29 existing Python
dashboard tests, 4 learning-reader tests and 10 portfolio tests passed (138 total).
TypeScript and the production build passed. Desktop and mobile browser renders
were inspected. A public learning-pool scan completed from creation through block
65,313,147; the inspected deployer wallet had no consumer actions or positions.
That is a wallet-specific observation, not evidence that other users have none.
A disposable owned EVM rehearsal independently discovered a real bought claim,
verified its balance changing from 1 to 0 after selling, and retained both
canonical buy/sell actions. No public transaction was submitted by these checks.
