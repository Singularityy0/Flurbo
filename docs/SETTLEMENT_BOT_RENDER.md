# Settlement bot on the free Render web service

The settlement monitor and resolution worker normally run as scheduled GitHub Actions. Scheduled Actions can start late or be skipped, and a private repository has a limited free minute allowance. Setting `FLURBO_SETTLEMENT_BOT=true` on the Render web service runs the same two scripts inside the web server instead: one monitor pass, then the worker with the same bounded drain as `run-resolution.mjs --drain`, every 2 minutes. Cycles never overlap. State, leases and the signer journal stay in Redis, so a restart only skips a cycle.

Trade-offs: the settlement signer key lives in the web service environment, and a free Render instance can be restarted at any time. The key controls test funds only.

## Render environment

Copy these from the GitHub repository variables and secrets into the Render service environment. Values already present for the website (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `FLURBO_PRACTICE_COLLECTIONS_JSON`, and `FLURBO_ALCHEMY_TESTNET_RPC_URL` if set) are shared and must not be duplicated.

| Variable | Value |
|---|---|
| `FLURBO_SETTLEMENT_BOT` | `true` |
| `FLURBO_MONITOR_ENABLED` | `true` |
| `FLURBO_MONITOR_RESEND_KEY`, `FLURBO_MONITOR_EMAIL_FROM`, `FLURBO_MONITOR_EMAIL_TO` | Same as the GitHub secrets |
| `FLURBO_MONITOR_HEALTHCHECK_URL` | Same Healthchecks.io ping URL |
| `FLURBO_RESOLUTION_ENABLED` | `true` |
| `FLURBO_RESOLUTION_EXECUTE` | `false` until the first cycles look right |
| `FLURBO_RESOLUTION_PROPOSALS` | As in GitHub |
| `FLURBO_RESOLUTION_POOL`, `FLURBO_RESOLUTION_RULES_HASH`, `FLURBO_RESOLUTION_SIGNER_ADDRESS` | As in GitHub |
| `FLURBO_RESOLUTION_MANIFEST_JSON` | The primary pool's verified manifest |
| `FLURBO_RESOLUTION_PRIVATE_KEY` | The dedicated settlement signer key |
| `FLURBO_RESOLUTION_FINISH_ALLOWLIST` and `FLURBO_RESOLUTION_COLLECTIONS_JSON` | Both or neither, matching exactly |
| `FLURBO_EVIDENCE_GEMINI_KEY`, `FLURBO_EVIDENCE_MODEL`, `FLURBO_EVIDENCE_FREE_TIER_CONFIRMED` | Needed for legacy release-milestone YES proposals. They also enable the operator evidence tool, which shares the same daily cap. |

Leave `FLURBO_RESOLUTION_SOURCE_MODE` and `FLURBO_RESOLUTION_EVIDENCE_ORIGIN` unset unless the primary pool is a `deterministic-source-v1` collection.

Each cycle also updates the operator member metrics after the settlement work; see [USER_METRICS.md](USER_METRICS.md) for its optional variables and daily email.

## Keep the service awake

Free Render web services stop after 15 minutes without inbound traffic, and the bot's own outbound requests do not count. Create a free external job, for example on cron-job.org, that sends `GET https://flurbo.singu.online/healthz` every 10 minutes. One always-on service uses about 720 to 744 of the 750 free instance hours a month, so it must be the only free service in the Render workspace.

## Verify, then switch GitHub off

1. After the deploy, open `https://flurbo.singu.online/healthz`. Within about 3 minutes `settlement_bot.cycles` should be at least 1, `monitor` should be `ok` (or `attention` with an explanation in the logs) and `worker` should show a worker status such as `wait`.
2. Render logs show one `[settlement-monitor]` line per pool and one or more `[settlement-worker]` lines per cycle.
3. Set the GitHub repository variables `FLURBO_MONITOR_ENABLED` and `FLURBO_RESOLUTION_ENABLED` to `false`. The workflows remain available for manual runs.
4. In Healthchecks.io, set the check period to 5 minutes with a 10 minute grace, so a stopped bot raises an alert.
5. Set `FLURBO_RESOLUTION_EXECUTE=true` on Render only when the worker reports the expected pool and no blocker.

To roll back, set `FLURBO_SETTLEMENT_BOT=false` on Render and the two GitHub variables back to `true`.
