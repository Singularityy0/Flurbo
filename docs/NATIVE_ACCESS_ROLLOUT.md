# Native access applications: implementation and rollout

Implemented locally on 27 September 2026. No provider settings, remote database, deployment, email or on-chain transaction were changed by the implementation work.

## What is built

- A native email form on `/access` with automatic Mera identity capture from the server session. The browser never chooses the application owner.
- Six-digit contact-email verification, pending status, email correction, reload recovery and withdrawal of unapproved applications.
- An operator-only review panel on the same page. Approve, decline and revoke require a confirmation. Applications are paginated in groups of 25.
- A separate Supabase database accessed only by the server. No Supabase Auth or changes to Mera sign-in.
- Durable access decisions shared by browser and headless agent gates. The agent gate awaits asynchronous decisions rather than treating a Promise as approval.
- Durable invitation notification identity and retry status. Decisions survive email failure. Operator can retry pending invitations within 23 hours; older uncertain sends require checking Resend manually to avoid duplicates after its idempotency window.
- Request limits, atomic verification limits, a global database-backed daily email allowance, and separate application email credentials.

The first-time flow is Landing > Request access > existing Mera sign-in > enter email > verify code > pending > operator approval > Explore markets. Only landing/docs remain public; submission and status require sign-in but not approval.

## Setup in Supabase

Use the separate project at `https://cgfcqufziavthjetvldk.supabase.co`.

1. Open SQL Editor and run `apps/web/server/migrations/001_access_applications.sql` in full.
2. Confirm it succeeds. It creates application, decision-audit and daily-mail-budget tables and a service-only RPC function. Row-level security is enabled; anonymous/authenticated clients cannot read the tables or execute the functions.
3. In project settings, obtain a server secret API key (`sb_secret_...`) or the legacy service-role key. Put it directly into Render. A publishable/anon key is not sufficient. Do not paste the secret into chat or commit it.

The schema is intended for this dedicated project, not the database of another application. Administrative keys can bypass row-level security, so the Flurbo server explicitly verifies account/operator access on every route.

## Setup in Resend

The sending domain shown by the user is verified. Use `invites@flurbo.singu.online` as the From address if the verified domain is `flurbo.singu.online`.

Create an API key named Flurbo applications with Sending access, restricted to that verified domain when available. Store it directly in Render. Leave settlement email configuration and its key unchanged. Sending from a verified domain does not create an inbox for replies.

## Render environment

Add these variables to the existing web service:

| Name | Value |
| --- | --- |
| `FLURBO_APPLICATIONS_ENABLED` | `true`, after migration and secrets are ready |
| `FLURBO_APPLICATIONS_SUPABASE_URL` | `https://cgfcqufziavthjetvldk.supabase.co` |
| `FLURBO_APPLICATIONS_SUPABASE_SECRET` | Server secret API key from this project |
| `FLURBO_APPLICATIONS_RESEND_KEY` | New application sending key |
| `FLURBO_APPLICATIONS_EMAIL_FROM` | `invites@flurbo.singu.online` |
| `FLURBO_APPLICATIONS_CODE_SECRET` | Random secret of at least 32 characters |
| `FLURBO_APPLICATIONS_EMAIL_DAILY_LIMIT` | `50` initially, or lower to fit the remaining Resend allowance |

Generate the code secret locally, then copy it straight into Render:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The code secret keys the stored code digests. Rotating it invalidates outstanding codes; users can request new ones. Do not rotate routinely between deployments.

Keep `FLURBO_TESTNET_APPROVED_ACCOUNTS` and the existing operator account settings. With native applications enabled, the external `FLURBO_TESTNET_APPLICATION_URL` is ignored. It can be removed after rollout.

When the native feature is disabled or unset, the previous access behavior remains. When enabled, incomplete configuration stops startup rather than exposing an unconfigured form.

## Approval and availability semantics

- The existing configured operator remains authorized independently of the application database.
- Existing environment-approved accounts remain approved when they have no recorded decision. A recorded decline/revocation overrides that environment allowance.
- Decisions are read on every protected request, with no approval cache. This provides immediate next-request enforcement across server instances but adds database latency and capacity requirements.
- A database outage fails closed for ordinary accounts, including legacy-approved accounts. It does not delete applications or approve unknown accounts. The operator can still sign in but cannot review a database that is unavailable.
- Supabase free projects can pause for low activity. Check project health before announcing the launch. This implementation does not promise always-on availability or bypass provider pausing.
- Revocation gates new API requests. It cannot cancel already signed transactions, stop independently running code from calling the blockchain, or undo a transaction. Existing journal/evidence data is retained; no signing logic or settlement process is changed here.
- Legacy accounts without applications are not listed in the application review panel. Manage those explicit allowlist entries in Render until they have application records. The panel does not enumerate environment variables.

## Limits and privacy

- General account/service limits still apply.
- Application routes: 20 requests/account/minute and 120/service/minute.
- Email-triggering actions: 3/account/minute and 10/service/minute, plus a one-minute code resend interval and five code sends/account/UTC day in Postgres.
- Codes expire after ten minutes, are account-bound, permit five attempts and are single-use. Only HMAC digests are stored; codes are never returned in API responses or logs.
- All outbound application email attempts, including retry attempts, share the configured daily database limit. The default is 50 per UTC day. Failed sends consume allowance conservatively. Different API keys still share provider account quotas; check Resend usage and reserve sufficient quota for settlement alerts.
- There is no automatic resend loop. Users can request fresh verification codes; operators can retry pending invitation emails. A persisted decision remains valid even if its email is not delivered.
- Unapproved applicants can remove contact email by withdrawing. Account identifiers and decisions remain to prevent withdrawal from bypassing revocation. Contact information otherwise remains until withdrawal or operator deletion; no automatic retention job is configured in this version. Provider email logs have their own retention.
- No automatic account merges by email. No marketing subscription. Email verification is not authentication or recovery.

## Checks performed locally

The focused server tests cover authenticated identity binding, cross-account isolation, operator authorization, legacy approval precedence, database failure, notification retries and provider-secret handling. Existing invite/runtime/request-capacity checks are also run.

A disposable Postgres 16 container validates the actual SQL, parallel submissions, code replay/expiry/attempts, concurrent decisions, daily-budget atomicity, withdrawal and database grants. Browser tests exercise the built app at desktop/mobile widths, submit/verify/reload/withdraw and operator approval. All external email and database calls in browser tests are fixtures.

The existing agent credential test was corrected to extract the full base64url secret. Splitting on underscores could extract an empty or tiny fragment and falsely report it as stored. Production credential storage is unchanged.

## Hosted acceptance after user deployment

1. Open landing/docs signed out. Confirm Request access leads through sign-in and protected APIs remain inaccessible.
2. With an unapproved test account, submit an email you control, receive a code and verify it. Reload to confirm pending status.
3. Confirm the application is stored under that account in the separate Supabase project, without a plaintext verification code.
4. On the operator account, open Your account > Review access applications. Approve the test application and check the invitation email.
5. On the applicant account, Check application status. Confirm markets and portfolio become available.
6. Use a second account to confirm it cannot read or approve the first application. Revoke the test application and confirm both browser and runtime requests are denied.
7. Restore the intended test account decision. Verify an older approved account and existing settlement monitoring still operate.

Hosted Supabase REST compatibility, actual email delivery and the deployed Chrome flow still need this run. Local tests do not establish them.

## Rollback

Before disabling the feature, reconcile approved and revoked decisions with the legacy allowlist. Otherwise newly approved applicants lose access and a previously allowlisted but revoked account could regain it when database decisions are disabled. Do not delete the separate database as a rollback step. Preserve application and audit data for review.

## References

- Supabase secret API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Free-project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Resend idempotency window: https://resend.com/changelog/idempotency-keys
