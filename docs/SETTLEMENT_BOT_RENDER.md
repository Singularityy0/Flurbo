# Settlement bot on the free Render web service

The settlement monitor and resolution worker normally run as scheduled GitHub Actions. Scheduled Actions can start late or be skipped, and a private repository has a limited free minute allowance. Setting `FLURBO_SETTLEMENT_BOT=true` on the Render web service runs the same two scripts inside the web server instead: one monitor pass, then the worker with the same bounded drain as `run-resolution.mjs --drain`. Cycles never overlap. The bot runs every 2 minutes from 15 minutes before anything is due (an observation window ending, an open assertion window, a challenge or vote deadline, delivery) until it is done, and whenever the monitor or worker reports trouble. Otherwise it runs every 10 minutes, which keeps the monitor's record inside the worker's 15-minute freshness limit and saves most of the Redis commands. `/healthz` shows `cadence` (`normal` or `idle`) and the next due time. State, leases and the signer journal stay in Redis, so a restart only skips a cycle.

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
| `FLURBO_EVIDENCE_GEMINI_KEY`, `FLURBO_EVIDENCE_MODEL`, `FLURBO_EVIDENCE_FREE_TIER_CONFIRMED` | Optional. Release-milestone YES assertions come from the deterministic GitHub release check; these only add a written explanation when available, and enable the operator evidence tool. |

`FLURBO_ALCHEMY_TESTNET_RPC_URL` is the Monad testnet RPC the whole server reads through (site, bot, agents, starter funds), despite its name. It may be the public endpoint, an Alchemy URL, or a QuickNode Monad testnet endpoint (`https://<name>.monad-testnet.quiknode.pro/<token>/`). Provider URLs carry a token, so set it only as a Render secret; the server never sends it to browsers or agents and never includes it in errors or logs.

Leave `FLURBO_RESOLUTION_SOURCE_MODE` and `FLURBO_RESOLUTION_EVIDENCE_ORIGIN` unset unless the primary pool is a `deterministic-source-v1` collection.

Each cycle also updates the operator member metrics after the settlement work; see [USER_METRICS.md](USER_METRICS.md) for its optional variables and daily email.

## Redis usage

Rate limits (chain requests, page requests and agent runtime requests) count in the server's memory, because Render runs a single instance; counting them in Redis cost one command per request. Sign-in lookups are cached in memory for 30 seconds and dropped at once on sign-out. Set `FLURBO_SHARED_LIMITS=true` only when running more than one instance, so they share the budgets through Redis again. A monitor observation that repeats the saved one is rewritten at most every 5 minutes. Agent heartbeats (every 30 seconds per running agent) are kept in memory and shown on the dashboard at once; they are written to Redis only when the runtime's mode, state, pending count, SDK, policy, credential or error changes, or every 5 minutes. After a restart, a running agent shows as stale until its next heartbeat. Even so, each agent running around the clock uses about 4,000 to 5,000 commands a day, so on the free Upstash plan ask invited users to run agents for trading sessions (`start`, then `stop`) rather than all day.

### Moving rebuildable data to Supabase

Price history (`flurbo:prices:*`), the trade history index (`flurbo:pilot:index:*`), the payout index (`flurbo:pilot:payouts:*`) and operator metrics (`flurbo:metrics:*`) can live in Supabase instead of Redis. Sessions, agents, wallet links, settlement and monitor state, email dedupe, starter funds and settlement evidence always stay in Redis. The server routes each command by key prefix, so no feature changes. It uses the same Supabase project and service key as access applications (`FLURBO_APPLICATIONS_SUPABASE_URL`, `FLURBO_APPLICATIONS_SUPABASE_SECRET`).

1. Run `apps/web/server/migrations/004_kv_store.sql` once in that project's SQL editor.
2. With the Redis and Supabase variables in your shell, dry run `node apps/web/scripts/move-kv-to-supabase.mjs`, then run it with `--copy`. It checks every copied value.
3. Set `FLURBO_SUPABASE_KV=true` on Render and redeploy straight away, so little is written to Redis in between. Anything that was (a price sample, an index step) is rebuilt from the chain.
4. Optionally, once the site works, run the script with `--copy --delete` to remove the moved keys from Redis.

To roll back, unset `FLURBO_SUPABASE_KV` and redeploy: the server reads Redis again, and the indexes rebuild from the chain. `wipe-retired-collections.mjs` only removes the Redis copies of a retired pool's data.

## Keep the service awake

Free Render web services stop after 15 minutes without inbound traffic, and the bot's own outbound requests do not count. Create a free external job, for example on cron-job.org, that sends `GET https://flurbo.singu.online/healthz` every 10 minutes. One always-on service uses about 720 to 744 of the 750 free instance hours a month, so it must be the only free service in the Render workspace.

## Verify, then switch GitHub off

1. After the deploy, open `https://flurbo.singu.online/healthz`. Within about 3 minutes `settlement_bot.cycles` should be at least 1, `monitor` should be `ok` (or `attention` with an explanation in the logs) and `worker` should show a worker status such as `wait`.
2. Render logs show one `[settlement-monitor]` line per pool and one or more `[settlement-worker]` lines per cycle.
3. Set the GitHub repository variables `FLURBO_MONITOR_ENABLED` and `FLURBO_RESOLUTION_ENABLED` to `false`. The workflows remain available for manual runs.
4. In Healthchecks.io, set the check period to 10 minutes with a 10 minute grace (the idle cadence pings every 10 minutes), so a stopped bot raises an alert.
5. Set `FLURBO_RESOLUTION_EXECUTE=true` on Render only when the worker reports the expected pool and no blocker.

To roll back, set `FLURBO_SETTLEMENT_BOT=false` on Render and the two GitHub variables back to `true`.
