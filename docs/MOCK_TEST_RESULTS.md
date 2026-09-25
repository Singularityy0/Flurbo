# Manual mock results

## October read-only checkpoint, September 25, 2026

User reported completing deployment, configuration and monitoring checks.
Independent public reads at **09:33 UTC** inspected October pool
`0x085b951ed24bbae44add2f9ff2b8198cd7517a07` and resolver
`0xee75d046e083ac707ae05f483d86f2654b5e11a2`.

- Block **65538111**: deployment anchor/code/rules binding verified; trading open;
  27.725888 test AUSD collateral and zero required liability. One-share read quotes:
  A Yes 0.512495, A No 0.512495, A Yes AND B Yes 0.259531, A Yes OR B Yes 0.759218 test AUSD.
- Block **65538144**: live A/B analytics passed local Rust cross-check. Marginals
  50.0% each, joint and independence baseline 25.0%, both conditionals 50.0%.
  Both one-share sensitivity scenarios were available. These are separate
  snapshots; quote costs are not marginal probabilities.
- Six unauthenticated API checks returned 401. Five public SPA routes returned
  the expected security headers. These do not prove authenticated browser UX.
- Overall report: **attention_required**, four of five checks passed. The live
  application did not yet expose the newly added featured-collection health
  metadata. Rerun after deploying that application update; no new pool is required.

Evidence: local `target/mock-testing/october-demo-readiness.json`. No transaction
or email was sent. Wallet, settlement and redemption rows below remain **Not run**
unless their specific observed results are recorded.

## Manual acceptance record

Tester: __________  Date: __________  Render commit: __________

Real pilot pool: `0x28d5ee02b1eda6959ac3ee5a4f834237c84dee02`

Rehearsal pool: __________  Rehearsal resolver: __________

Mera wallet: __________  MetaMask wallet: __________

Record public addresses/hashes only. Never record seeds, keys or passkey secrets.
Every item below is **not run** until a human records its observed result.

| Check | Result | Public tx hash / observation |
| --- | --- | --- |
| Login guard, Mera signup/login and refresh | Not run | |
| Sign out, restore same passkey/address | Not run | |
| Fund selected Mera and MetaMask wallets | Not run | |
| Approval is separate from the purchase | Not run | |
| Single claim buy and sell | Not run | |
| AND / OR buy and sell | Not run | |
| Correct wallet/market in Portfolio and History | Not run | |
| Rejected prompt and pending reload recovery | Not run | |
| Locked signing / changed network / insufficient funds | Not run | |
| Original Kuru deposit/order/cancel/withdraw | Not run | |
| Original Kuru fill between different wallets | Not run | |
| Rehearsal A unchallenged YES | Not run | |
| Rehearsal B challenge and two NO votes | Not run | |
| Rehearsal C timeout to VOID | Not run | |
| All-final settlement delivery | Not run | |
| Combined 0.5 AUSD payout and no double redemption | Not run | |
| Both eligible bond withdrawals | Not run | |

Issue: __________

Steps to reproduce: __________

Expected / observed result: __________

Browser, selected wallet, pool, UTC time and public tx hash: __________

## Read-only checkpoint, 25 September 2026

Verified against public Monad testnet at block **65527809**
(`0xd2fc5fa3459aa5c6754253092f9f9e7ff648fcd4664f2eb245ee15f4fdb2a768`).
Practice pool `0xf632cbf09aaa8c22821e38c930695463781c5284`, resolver
`0x3cf04748eecc9a55adada6b700752541fbbf9489`.
Trading was open; all four cases were Pending with no assertion or result.
Pool collateral was 41.634446 test AUSD against 22 test AUSD required collateral.
This is an observation, not a passed transaction or settlement test.

| Stage | UTC | India time |
| --- | --- | --- |
| Trading closes | Sep 25, 18:50:49 | Sep 26, 00:20:49 |
| Assertions open | Sep 25, 18:52:49 | Sep 26, 00:22:49 |
| Last time to assert | Sep 25, 19:52:49 | Sep 26, 01:22:49 |

Recheck chain state before acting. Challenge deadlines are one hour after each
assertion; voting deadlines are one hour after a challenge. Use `/rehearsal` and
the sequence in `MOCK_TESTING.md`, including A/D YES, deliberately challenged B,
and C with no assertion. If an assertion window is missed, the contract's VOID
path applies; do not report the originally intended YES/NO exercise as passed.

The local checker reported a gap since its previous local checkpoint. This does
not establish a GitHub Actions outage or continuous hosted monitoring. No
transaction or email was sent by this read-only check.


## October readiness and consumer regression checkpoint, 25 September 2026

The saved read-only report at `target/mock-testing/october-demo-readiness.json`
records all five checks passing at **2026-09-25T09:45:56Z**, with status
`ready_for_manual_trading_checks`. Pool:
`0x085b951ed24bbae44add2f9ff2b8198cd7517a07`. Hosted collection binding,
login guards, page/security headers, live quotes/collateral and live What-if
calculations passed. This supersedes the earlier missing hosted diagnostic.
It is a point-in-time observation, not continuous availability.

Consumer QA passed the production build/typecheck and **10 targeted tests**:
`checkout`, `pilot-access`, `pilot-browser`, `markets-browser` and
`what-if-browser`. Browser coverage uses mocked providers and API responses,
not real wallet confirmations. Both practice namespace variants exercise:

- Rejected approval leaves no pending intent or submitted transaction.
- Failed reconnect and account changes remove the previous signer and review.
- Approval confirmation survives reload and does not buy shares by itself.
- One confirmed buy completes the purchase and remembers its claim for Portfolio.
- Expired prices stop offering confirmation; refreshing never sends a transaction.
- A lost submission response keeps its intent after reload and blocks another buy.
- Desktop/mobile layout, login guards and read-only What-if behavior.

Copy now separates payout from profit, purchase quotes from What-if probabilities,
and unresolved (VOID) outcomes from cancellation. The landing page and README
reflect the hosted practice demo. No collateral, pricing or settlement rules
changed. These changes still require a commit and hosting rollout.

The manual wallet and public settlement rows above remain unverified by this
checkpoint. After rollout, check one rejected prompt and one single-share buy
with the intended wallet on the hosted October collection; confirm the same
wallet and collection in Portfolio. Complete public settlement/redemption at
the committed deadlines. Do not buy a second time to make a pending trade appear.
