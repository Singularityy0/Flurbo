# Flurbo on Kuru: submission

Monad Metropolis bounties **Bring new assets and markets to Kuru** and **Build the next consumer trading app on Kuru**. Monad testnet (10143) and test AUSD only. Everything below that says "pending" is waiting for a transaction that has not been made yet; nothing pending is claimed.

## 1. Asset class and customer

**Asset.** Outcome receipts for correlated questions. A Flurbo pool holds two to four related questions (for example BTC, ETH, SOL and MON price thresholds on one date) priced together by a factored LMSR, so a single claim can cover one to three questions ("ETH above 2575 AND BTC above 83000"). Each Yes or No claim on one question can be wrapped 1:1 into an ERC-20 **receipt token**. That receipt is what trades on Kuru's spot order book against test AUSD.

**Customer.** Traders who hold a view on how several linked outcomes move together and want to enter and exit before resolution, without waiting for a pool to resolve. The pool alone prices any size with price impact; a Kuru book lets a holder sell a receipt to another trader at a quoted price, and lets a maker earn a spread.

**Why this is not only a trading screen.** The receipt has a defined issuer (the pool), a funded liability, a settlement rule committed on-chain, and a redemption path. The infrastructure around the order book is the contribution: issuance, backing, resolution evidence, redemption and liquidity.

## 2. Evidence of demand (testnet, labelled as such)

Read from the live Envio indexer on 8 Oct 2026 for the six pools listed so far:

| Measure | Value |
|---|---|
| Pools indexed | 6 |
| Trades and redemptions | 35 |
| Distinct trader addresses | 10 |
| Volume | 51.24 test AUSD |
| Redeemed | 17.00 test AUSD |

This is testnet activity with test funds. It includes the team's own testing and operator transactions and is not a measure of demand at real prices; it shows that the flow works end to end. The addresses are not separated into external and team wallets in the index.

Re-query on 12 Oct before submitting (pool summaries and positions via `POST /envio`), and add:

- the trade and redemption hashes in section 7, which are from a separate tester wallet;
- the user test in `docs/USER_TEST_2026-10-12.md` (five people, fifteen minutes each: sign in with a passkey, fund, buy a single and an AND claim, open What If, find the Kuru book and sell a receipt) with completion and confusion points recorded without names;
- one conversation with a prospective maker, recorded as a note.

## 3. Issuance and redemption

- **Issuance.** A buy from the pool mints the buyer a position in a claim `(scope, mask)`. Buying equal YES and NO on one question is a complete set that always pays 1 per share. `wrapBase(event, outcome, quantity)` turns a Yes or No position into the question's receipt token and `unwrapBase` turns it back, 1:1 ([`PilotPool.sol`](../contracts/src/PilotPool.sol) lines 114 to 133; the wrapped amount moves into the token's own position, so receipts are backed by the pool's liability).
- **Backing invariant.** `requiredCollateral()` is the pool's maximum liability while open and the remaining payout after resolution. The pool checks that its collateral balance covers it after every trade and redemption.
- **Settlement.** Each question has a committed rule: a Chainlink price feed on Monad mainnet read at the first block at or after a fixed time, compared with a fixed threshold. The rules hash is stored in the pool. A bonded resolver asserts the outcome; there is a challenge window and a reviewer vote for disputes; a missing or unresolved answer finalizes as VOID.
- **VOID.** A voided question gives Yes and No equal weight, independently per question. It is not a refund. The rule is the same for every combination ([`HANDOFF2.md`](HANDOFF2.md), AD-8).
- **Redemption.** After resolution `redeem(scope, mask, quantity)` pays 1 test AUSD per share if the claim's mask contains the resolved outcome, and 0 otherwise.
- **Second reading of the rules.** A Chainlink CRE workflow reads the same feeds and thresholds independently and reports whether it agrees with the pool's on-chain result ([`CHAINLINK_CRE_INTEGRATION.md`](CHAINLINK_CRE_INTEGRATION.md)). For the settled Crypto weekend pool it reproduces the on-chain state (`docs/cre-evidence/crypto-weekend-simulation.txt`).

A losing receipt redeems to zero. On Crypto weekend, ETH resolved No, so its Yes receipts pay 0; that is shown honestly and the redemption trail also covers a winning claim.

## 4. Legal and operational plan

- Testnet and test AUSD only. No real-money launch before professional legal review of how event contracts are classified in each target jurisdiction, and of access restrictions and disclosures.
- The resolver is operator-run with a single-operator reviewer panel; independent reviewers are not confirmed. This is disclosed in the app and in the pool's publication. Replacing it with independent reviewers is a precondition for anything beyond a pilot.
- Settlement rules, sources and thresholds are fixed and hashed on-chain before trading opens. Sources are public on-chain price feeds, so settlement does not depend on a private data vendor.
- The pool, not the order book, is the issuer. Kuru lists a receipt/AUSD pair; it does not custody or settle the underlying prediction.
- Operational dependencies are stated: Monad RPC, Chainlink feeds on Monad mainnet, the resolver operator and the Kuru market contracts.

## 5. Liquidity strategy

- **Initial market formation.** Few, funded books rather than many empty listings: one receipt book per new pool on one question (ETH/USD Yes). The operator buys a complete set (equal Yes and No), wraps the Yes, deposits receipts and test AUSD, and posts two levels each side: bids at 0.46 and 0.48, asks at 0.52 and 0.54 test AUSD, 5 receipts per level. The complete set keeps the pool price near 0.5, so these quotes are not an arbitrage against the pool.
- **Backstop.** The pool prices any size at any time, with the LMSR's price impact. A thin Kuru book cannot strand a holder.
- **Costs and subsidy.** About 21.99 and 18.01 test AUSD for the two legs of a 40-share set at depth b = 100; gas is paid in test MON.
- **Expiry.** The pool rejects trades at its close time. Kuru markets cannot be paused by Flurbo, so the operator cancels its resting orders at close and the book documents withdrawal, unwrap and redemption for anyone else holding receipts or quotes.
- **Maker outreach.** Approach one external maker to quote the book in the pilot; measure fills, spreads and uptime.

## 6. Continuation: 30-day pilot

1. One cluster of related questions, one maker and a group of traders.
2. Weekly pools on the same recipe; the CRE check and indexed fills are public for each.
3. Metrics, with team and external activity reported separately: external traders, repeat traders, fills per book, quoted spread, time to redeem.
4. Replace the single-operator reviewer panel with independent reviewers.
5. Legal review before any real-money market.
6. Publish the integration kit: the batch listing tool, `DeployPilotKuru`, the listing verifier and the plugin.

## 7. Evidence (testnet transactions)

Filled in from real runs, with a separate tester wallet and not the deployer. Until a row has a hash it is not claimed.

| Step | Pool | Transaction |
|---|---|---|
| Kuru book live: Crypto weekend ETH Yes (earlier single-level seeding) | Crypto weekend | market `0xe92649cdD20425239695221191515E1E51631d2A`, receipt `0x0792929003a193c3129462116cFe9c70c73Db15B` |
| New book live (two levels each side) | Crypto Saturday | pending |
| New book live (two levels each side) | Crypto judging week | pending |
| Buy 5 Yes from the pool | Crypto Saturday | pending |
| Wrap 5 | Crypto Saturday | pending |
| Deposit into the Kuru margin account | Crypto Saturday | pending |
| Market sell of 2 into the 0.48 bid | Crypto Saturday | pending |
| Place a limit ask | Crypto Saturday | pending |
| Cancel it | Crypto Saturday | pending |
| Pool resolves (about 11 Oct, 01:30 UTC) | Crypto Saturday | pending |
| Withdraw receipts, `unwrapBase`, `redeem` | Crypto Saturday | pending |
| Same fills as indexed by Envio | Crypto Saturday | pending |

## 8. Consumer app answers (form fields)

- **Target users.** Retail and crypto-native traders who think in related outcomes (a market day, a data release, a vote), and makers who want a spread on a product the pool already prices.
- **Evidence of demand.** Section 2, plus the user test and the tester-wallet trail above. Testnet; team activity not excluded from the index totals.
- **Retention plan.** Weekly pools on a fixed calendar so there is always a new question to trade; an indexed portfolio and cash-movement view so people see results; the CRE check and Envio history as proof that outcomes are fair; maker rebates from the subsidy in the pilot. The first measure of retention is the share of first-week traders who trade a second pool.

## 9. Code map

| Part | Where |
|---|---|
| Pool, wrap and redeem | `contracts/src/PilotPool.sol`, `FactoredPool.sol` |
| Book deployment and seeding | `contracts/script/DeployPilotKuru.s.sol` |
| Listing verification | `apps/web/scripts/verify-kuru-listing.mjs`, `apps/web/scripts/combine-kuru-listings.mjs` |
| Verified book on the site | `apps/web/server/kuru-collection.mjs`, `apps/web/src/pages/CollectionKuru.tsx`, `Kuru.tsx` |
| Indexed fills | `packages/envio-indexer`, `apps/web/src/components/KuruFills.tsx` |
| Second reading of the rules | `workflows/cre/src/price-feed.ts` |
