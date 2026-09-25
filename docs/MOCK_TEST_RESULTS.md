# Manual mock results

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
