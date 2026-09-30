# Member metrics (operator only)

Flurbo tracks how many people move from signing in to betting, and how they bet. Only the operator passkey account (`DEFAULT_TESTING_OPERATOR`) can see it: the `/metrics` page and the `/api/admin/metrics` routes check the signed-in passkey on the server, and any other account gets the not-found page or `403`. Members never receive these numbers.

## Where it appears

- **Your account (`/access`)**: a Metrics panel above the access-review queue, with the funnel and the last 24 hours.
- **`/metrics`**: headline numbers, the funnel, how members bet (single answers or combinations, and which payout rules), bets per day for 14 days, a table of every member, per-market totals, agents, and unlinked wallets.
- **Daily email** (optional): one summary per UTC day, sent to the settlement monitor's address.

## What each step counts

Team and test accounts are excluded: the operator account, anything in `FLURBO_METRICS_EXCLUDE`, and the deployment's pool, resolver, creator and reviewer wallets.

| Step | Source |
|---|---|
| Signed in | First passkey sign-in, recorded in Redis from the day this shipped. Earlier members appear once they request access, link a wallet or bet. |
| Access requested | Supabase applications (migration 002), excluding withdrawn requests. Email verification is shown alongside. |
| Access granted | Supabase approvals, plus `FLURBO_TESTNET_APPROVED_ACCOUNTS` for accounts without a decision. |
| Wallet linked | Links recorded from the day this shipped. Older links are added, without a date, the next time the member opens a page that loads their wallets, or when found through starter MON records or a trade. |
| Got starter MON | The starter MON records. |
| Made at least one bet | At least one confirmed buy, in any listed market, from a wallet linked to the account. |
| Bet in the last 7 days | Same, within the last 7 days. |

Bets come from each listed pool's on-chain `Traded` events, so trades made before this shipped are included. A buy is a *single answer* when its claim covers one question and a *combination* otherwise; the payout rule (all must happen, at least one, exactly one, at least two) is read from the claim.

## Unlinked wallets

The website only prepares a buy or sell for a MetaMask wallet linked to the signed-in account (`WALLET_NOT_LINKED` otherwise). Redeeming is never blocked. The pools themselves still accept any caller, so a wallet listed under **Unlinked wallets** means someone called the contracts directly. The daily email reports the count.

## Setup

1. **Supabase**: run `apps/web/server/migrations/002_application_stats.sql` once in the applications project's SQL editor. It adds a read-only `flurbo_application_stats()` function that returns account, state and dates only, never email addresses. Without it, the application steps show as unavailable and everything else still works.
2. **Render** (optional variables):

| Variable | Value |
|---|---|
| `FLURBO_METRICS_EXCLUDE` | Comma-separated team and test Mera accounts or wallets to leave out of every count |
| `FLURBO_METRICS_DIGEST` | `true` to send the daily email. Uses `FLURBO_MONITOR_RESEND_KEY`, `FLURBO_MONITOR_EMAIL_FROM` and `FLURBO_MONITOR_EMAIL_TO`. |
| `FLURBO_METRICS_DIGEST_UTC` | Send time in UTC, default `03:30` (9:00 in India) |
| `FLURBO_METRICS_SCAN_STEPS` | Trade-scan steps per bot cycle, default `3` (see below) |

## Keeping trade data current

The settlement bot (`FLURBO_SETTLEMENT_BOT=true`) advances every pool's trade index at the end of each 2 minute cycle, after settlement work. Each step reads 1,000 blocks and costs about 115 units of the web server's 1,200-per-minute RPC budget, which members' requests share, so each cycle takes at most `FLURBO_METRICS_SCAN_STEPS` steps (default 3, at most 20). The public RPC returns logs for at most 100 blocks per request, so a pool deployed weeks ago can take a day or more to catch up the first time. `/metrics` shows the progress per market, and **Scan more trades** takes 6 more steps on demand. To catch up faster, raise `FLURBO_METRICS_SCAN_STEPS` to about 6 while the site is quiet, then set it back. Once caught up, each cycle only reads the few hundred new blocks. The same index also serves members' trade history, so catching up helps that page too. A metrics failure never stops settlement; its state appears as `settlement_bot.metrics` in `/healthz`.
