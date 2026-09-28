# Native testnet access applications

Status: design proposal. No provider has been provisioned and no application code is changed by this document.

## Scope

Replace the external application destination with a native request-access experience. Keep the existing Mera passkey sign-in unchanged. Store applications in a separate database. Landing and documentation remain public; application submission and status require sign-in; market data, portfolio and agent access require approval.

Interpret the automatically captured account as the signed-in Mera address. This is the existing invitation identity. A MetaMask address is a separate trading identity and must not replace it. Capturing an optional trading wallet requires explicit connection; ownership requires a verified signature. Do not require this during application.

## Visitor flow

1. Landing-page Request access opens the existing sign-in flow when necessary, then returns to the native application view.
2. Show one card: Request your invitation; Monad testnet preview. Test assets only.
3. Show a labelled Email address input and a read-only, shortened Mera account identifier. Derive the identifier from the authenticated server session, never a submitted form field.
4. Submit with Request access. Explain: We use your email for application and access updates.
5. Verify the contact email with a short-lived code. This is email verification only, not login, recovery or approval.
6. Show Check your email, Request received, Access approved, or Not selected for this round as appropriate. Approval exposes Explore markets. Support resending, editing an unverified email, and withdrawing an application.
7. Reloading or returning on the same account restores status rather than creating another application.

Use Flurbo's existing fonts, ivory background, forest-green primary button, rounded cards and restrained lime accents. Keep a single column, visible labels, keyboard focus, accessible errors and status announcements. If presented in a modal, provide an accessible close action, focus management and a full-page fallback. Never lose typed email on a transient failure.

## Separate database

Recommended option for evaluation: a dedicated Supabase Postgres project, used strictly as application storage. Do not introduce Supabase Auth or replace Mera. Airtable is an alternative for a small operator-managed intake, but should not be synchronously queried for every protected page request.

The provider decision remains a deployment prerequisite. Supabase's free tier may pause after a low-activity period, so it is not an always-on guarantee. A separate database also introduces independent credentials, capacity limits and failure handling.

All database access goes through Flurbo's server. Never expose an administrative database key to the browser. Deny public table access. Server authorization is necessary even with row-level security because privileged server keys can bypass it.

Suggested tables:

- applications: id, unique canonical Mera account, email, email verification time, status, created/updated timestamps, revision, notice version acknowledged.
- email_verifications: application id, keyed digest of code, expiration, attempts, resend timestamp. Never store plaintext codes or log them.
- access_decisions: Mera account, approval/revocation, operator identity, timestamp, revision. Retain decision provenance separately from contact information.
- notification_outbox: unique event id, template, delivery state, retry metadata. Keep email sending separate from the decision transaction.

One account has one active application. A repeated submission is idempotent. Email matches must never merge accounts or transfer approval. Email edits invalidate verification and outstanding codes; approval requires a verified contact. Updating an email after approval needs its own verification and does not change account ownership.

## Access and operator flow

Add account-scoped submit, status, verify, resend and withdraw routes before the existing approval gate but after authentication. Every mutation retains same-origin protection, bounded bodies and request limits.

An operator-only review page lists applications, verification state and dates, with approve, decline and revoke actions. Enforce the operator identity on the server, not only in navigation. Record decisions transactionally and queue notifications after the decision is durable. Notification failure must not undo an approval or send duplicate invitations indefinitely.

Introduce a shared asynchronous approval resolver for browser routes and agent routes. Preserve existing environment-approved accounts during an explicit migration; record their provenance. Define revocation precedence before allowing operator revocation of migrated accounts. Do not let a legacy allowlist silently override a recorded revocation.

Use a bounded cache for access decisions with a documented maximum revocation delay. Never grant access on a failed or unknown lookup. Existing operator access and explicitly preserved legacy approvals should remain available independently of application intake. On a provider outage, show a temporary-service error, not an empty application list or a rejected application. Revocation must stop new authorized work without discarding transaction-recovery evidence.

## Abuse controls and data handling

Use dedicated account and service budgets for submissions, code attempts, resends and email delivery. Rate-limit before sending email. Expire verification records and enforce maximum attempts atomically. Existing general request limits do not guarantee safety against registration or email abuse.

Applicants can read only their own application. Do not disclose whether an email belongs to another account. Keep addresses and emails out of public analytics and logs. Publish a retention policy and withdrawal/deletion process before intake opens. Marketing consent, if ever added, must be separate from access notifications.

Use application-specific email configuration and a separate sending budget so a registration spike cannot consume settlement-alert capacity. Existing Resend integration is a reference, not authorization to reuse the settlement secret or mail queue.

## Implementation and release order

1. Confirm the separate database provider and email sender; provision them separately from this design task.
2. Add schema migrations and a storage adapter with tests for duplicates, concurrency, authorization and outage behavior.
3. Add submission, verification, operator decisions and the common approval resolver. Test existing allowlist migration and revocation explicitly.
4. Build the native form/status and operator view. Update landing and docs copy together.
5. Test with an unapproved account, approved account, operator and unrelated account. Confirm protected APIs remain gated, including agents and legacy routes.
6. Verify email failure/retry, stale codes, concurrent submissions, wrong-account reads, refresh, accessibility and mobile layout.
7. Provide commit commands for the user; no assistant commit, push or deployment. After user deployment, perform a small Chrome acceptance run, not a load test.

No passkey recovery, social login, wallet guardians, contracts, trading behavior or settlement changes belong to this feature.

## Provider references

- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase free-project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Airtable API limits: https://support.airtable.com/articles/7735693959-managing-api-call-limits-in-airtable
