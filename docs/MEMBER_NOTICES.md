# Member email notices

Flurbo emails approved members about their own positions:

| Notice | Who gets it | When | Default |
|---|---|---|---|
| Payout ready to collect | Holders with winning shares | Once when results reach the pool, and one reminder 3 days later if still uncollected | On |
| Answer proposed | Holders of shares in that question | Once when an answer is proposed, with the answer and the challenge deadline | On |
| Trading closes soon | Holders of shares in that market | About 2 hours before trading closes | Off (opt-in) |

Members choose these on Your account, and every email has a one-click link that stops all notices without signing in.

**Privacy.** Each email is sent to exactly one member, with only that member's address in To and no CC or BCC. Everything due for one member at the same time is combined into a single email. Addresses come from the verified email a member gave when requesting access, and only for approved accounts. Notices are never used for marketing.

**How it works.** The settlement bot checks every listed market each cycle. Holders come from the market's trade index, confirmed by current on-chain balances, and are matched to accounts through their linked wallets. A market is skipped until its trade index has caught up, so nobody is missed. Every sent item is recorded, so a notice is never sent twice. Agent wallets are not notified in this version.

## Setup

1. **Supabase:** run `apps/web/server/migrations/003_member_contacts.sql` once in the applications project's SQL editor. It adds a read-only function that returns emails only for approved accounts with a verified email.
2. **Render:**

| Variable | Value |
|---|---|
| `FLURBO_NOTIFY_ENABLED` | `true` to start sending. Members can set their choices before this. |
| `FLURBO_NOTIFY_DAILY_LIMIT` | Optional, default `40` notice emails per day. Resend's free plan allows 100 a day, shared with application and alert emails. Anything over the limit goes out the next day. |

Notices use the application email settings (`FLURBO_APPLICATIONS_RESEND_KEY`, `FLURBO_APPLICATIONS_EMAIL_FROM`) and sign unsubscribe links with `FLURBO_APPLICATIONS_CODE_SECRET`. The bot's state shows as `settlement_bot.notices` in `/healthz`: `disabled`, `not_configured`, `idle`, `sent N`, or `failed`.
