# Email alerts for supervised testnet

The workflow checks the real-event pilot and the four-event practice pool directly through Monad RPC. It does not depend on Render being awake, open a wallet or submit transactions. GitHub Actions starts it approximately every five minutes, at minutes 2, 7, 12 and so on. Scheduling can be delayed or dropped; public repositories can have schedules disabled after inactivity. This is supplementary coverage for an operator, not unattended settlement. [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Configure once

1. In Resend, verify a sender domain you control, for example `alerts.singu.online`, using the DNS records Resend supplies. Create a sending API key and choose a sender such as `flurbo@alerts.singu.online`. This does not require changing the website's DNS record. The recipient may be a Gmail address; the sender must be authorized by Resend. [Domain verification](https://resend.com/docs/dashboard/domains/introduction).
2. In Healthchecks.io, create a dedicated check with a **5-minute period and 10-minute grace**, and enable its email integration to the chosen operator. Copy its secret UUID ping URL (`https://hc-ping.com/<uuid>`). Set a separate service/password recovery path where possible. Confirm its email destination independently of Resend. A job that stops completely is detected by this service, not by the stopped code. [Check configuration](https://healthchecks.io/docs/configuring_checks/).
3. In the GitHub repository, open **Settings > Secrets and variables > Actions** and add the repository secrets below. Do not put them in source, workflow text or command history. GitHub does not inherit Render secrets automatically.

| Secret | Value |
| --- | --- |
| `FLURBO_MONITOR_RESEND_KEY` | Resend sending key |
| `FLURBO_MONITOR_EMAIL_FROM` | Verified sender, plain email address |
| `FLURBO_MONITOR_EMAIL_TO` | Operator's chosen recipient address |
| `FLURBO_MONITOR_HEALTHCHECK_URL` | Dedicated Healthchecks.io UUID ping URL |
| `UPSTASH_REDIS_REST_URL` | Existing Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Existing Upstash token with GET, SET and EVAL access |
| `FLURBO_REHEARSAL_MANIFEST_JSON` | Exact contents of the deployed `target/deployments/rehearsal-testnet.json` |
| `FLURBO_ALCHEMY_TESTNET_RPC_URL` | Optional private Monad testnet RPC; public RPC is the default |

The real pilot manifest is read from checked-in `config/pilot-testnet.json`. Both pools are mandatory. The Redis namespace is `flurbo:monitor:v1:*`, separate from login/session data. Never clear the entire Redis database to reset monitoring. Preserve old pool manifests when deploying a new collection; this workflow monitors only these two configured identities.

4. After pushing the code to `main`, add repository **variable** `FLURBO_MONITOR_ENABLED` with value `true`. Leave it absent until configuration is complete. The workflow has read-only repository permissions and rejects branches other than `main`.
5. Open **Actions > Settlement monitor > Run workflow**, select `main`, enable `test_email`, and run. Expect one labelled test message per pool. Provider acceptance in job output is not inbox receipt: open both emails and confirm timestamps/pool addresses. Verify that Healthchecks shows a successful ping. Test messages do not authorize resolution.
6. Confirm at least two normal scheduled runs succeed. Normal unchanged healthy observations do not send mail. During assertion/challenge/voting windows an operator must still inspect outcomes and act within the contract deadlines.

The selected recipient is intentionally absent from tracked configuration. Service quotas and billing depend on your accounts; check their dashboards before leaving a schedule active.

## Acceptance drills

- **RPC failure:** while supervising and outside an urgent settlement window, temporarily replace the workflow RPC secret with an invalid key at the allowed Alchemy testnet host. Run manually. Expect `check_failed`, a read-failure email, a failed Actions job, and a Healthchecks failure signal. Restore the correct secret immediately, rerun and verify recovery. The previous good checkpoint must remain in Redis during the failed read.
- **Stopped runner:** after a successful watchdog ping, temporarily set `FLURBO_MONITOR_ENABLED=false`. Verify a missed-check email after the configured period plus grace, then restore `true`, run manually and verify recovery. Keep manual resolver coverage throughout the drill.
- **Mail rejection:** temporarily use a revoked test sending key, run a labelled delivery test, and verify a failed job plus pending outbox entries. Restore the working key well within 23 hours, rerun and verify pending items are acknowledged. Inspect Resend logs if an email appeared before the job failed. Never disclose API keys in logs or screenshots.

No live drill or inbox receipt is established by unit tests. Until these drills pass, alerts are not operationally accepted.

## Delivery and recovery behaviour

Each pool has a durable checkpoint, latest report and bounded outbox in one Redis state record. State is written atomically under a five-minute renewable lease before email submission. An expired worker cannot overwrite a newer worker's state. Redis failures stop sending and cause the independent watchdog to receive failure, where reachable.

Notifications describe changes in resolver cases, deadline severity, read failures and recovery. Unchanged active warnings get hourly reminders. Changing block numbers or countdowns alone does not trigger mail. The queue holds at most 20 items and drains at most three per pool per invocation. A full queue fails visibly instead of discarding observations. Pending mail or a failed chain read prevents a healthy watchdog ping. An actionable resolver warning that was successfully delivered is a successful monitoring run, not a job failure.

Every pending message has a persisted idempotency key and immutable payload. A failed send or acknowledgement write retries the same message. Resend retains idempotency keys for 24 hours, so this implementation stops automatically retrying after **23 hours**. This does not promise exactly-once inbox delivery. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

If a pending message reaches that limit, disable the workflow, export only the affected monitoring record privately, and reconcile its key against Resend logs before modifying the outbox. Check the current resolver manually. Remove an item only after recording whether it was accepted or explicitly abandoned; reset the stored signature to `null` if a fresh active-alert notification is needed, then re-enable and test. Changing sender or recipient with pending items also stops the runner until those items are reconciled. Do not erase checkpoints or authentication keys as a shortcut.

An old queued message always includes its original observation time. Recheck current chain state before acting on it. The watchdog gets only a success/failure HTTP signal, never wallet data or the report body. Watchdog email integration must be configured in that service; a ping alone does not create a notification destination.

## Local execution and validation

With the same secrets configured securely in the environment, this command sends real emails when alerts are due:

```bash
node apps/web/scripts/notify-settlement.mjs
```

`--test-email` deliberately queues two labelled messages. Exit 0 means both reads and all pending delivery work completed, including successful watchdog reporting. Exit 2 means a read, delivery, storage, configuration or watchdog problem. The local read-only `check-settlement.mjs` remains available without any mail credentials.

```bash
cd apps/web
node --experimental-strip-types --test tests/settlement-email.test.ts tests/settlement-monitor.test.ts tests/pilot.test.ts tests/pilot-index.test.ts
```

Tests use fake RPC, Redis and email transports. They cover duplicate suppression, a lost provider response, failed acknowledgement persistence, lease expiration, read failure/recovery, queue limits, recipient changes and watchdog failure signalling. Real service configuration remains an activation step.
