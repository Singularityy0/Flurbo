# Request capacity and testnet rollout

This change isolates application request budgets and bounds RPC work. It does not replace edge denial-of-service protection or guarantee a provider's uptime. No contract, signing authority, settlement rule or provider credential changes are required.

## Server controls

| Budget | Allowance | Scope |
| --- | --- | --- |
| Public preview | 600/minute | Local, separate from application/login ingress |
| Anonymous application | 300/minute | Local brake and Redis service budget |
| Signed-in application | 240/minute/account | Redis, across sessions and server instances |
| Expensive browser routes | 90/minute/account | Redis, inside the account allowance |
| Authenticated browser service | 1,200/minute | Redis circuit breaker |
| Runtime credential | 120/minute | Redis |
| Runtime account | 240/minute/account | Redis, aggregates all agent credentials |
| Authenticated runtime service | 1,200/minute | Redis, invalid credentials use a separate budget |
| Runtime ingress | 180/minute/credential string and 3,600/minute total | Emergency local brake before body parsing/authentication |
| Hosted upstream RPC | 1,200 weighted units/minute | Redis across the hosted web instances |
| Hosted RPC concurrency | 6 active, 32 queued | Per process, held until response bodies finish |

API counters use fixed minute windows and expire after two minutes. They can permit a boundary burst; the RPC queue additionally bounds concurrent work. General account identities come from verified sessions/credentials. Forwarded IP headers are not trusted or used as account identities. Redis failures reject the request instead of granting an unlimited fallback.

RPC costs are 10 for a log request, 2 for an eth_call or gas estimate, and 1 for other permitted methods. A JSON-RPC batch is charged for every method. A Multicall eth_call costs 2 units; this is a coarse application budget, not a provider billing-unit measurement. Large/heavy eth_call input remains subject to existing body limits and provider execution limits. Tune these constants after staging measurements rather than interpreting them as exact billing control.

RPC queue overflow returns a cooldown. A queued request's abort signal removes it before execution. HTTP 429 from the provider establishes a process-local endpoint cooldown honoring numeric or HTTP-date Retry-After. No RPC is automatically replayed, including raw transaction broadcasts. The weighted Redis budget remains shared even though queue slots and provider cooldowns are process-local.

Identical concurrent market reads reuse one in-flight promise. Open-market Yes/No prices use one Multicall when the transport supports it. A normal four-event market read now uses ten upstream requests instead of seventeen. Failed reads clear the promise; subsequent reads recompute state. There is no persistent executable-quote cache and no cross-account wallet-data cache.

The web production entrypoint installs RPC admission before configuring its services. The pilot, collection, agent verification, learning RPC and browser RPC proxy paths use it. Separate Python dashboard child processes and operational settlement scripts do not pass through this JavaScript queue. Testing-tool access restrictions remain in place for legacy expensive dashboard routes.

## Client controls

The default web/SDK transport has a per-origin rolling allowance of 100 requests/minute and four concurrent requests. TypeScript queues at most 64 waiting calls; it respects abort signals while queued. The native API transport uses the same scheduler. Direct native public-balance/network checks remain independent public-provider reads.

Autonomous chain transports have a separate 600 requests/minute per-origin budget and four concurrent requests. Chain verification and receipt reconciliation need more calls than application metadata. These allowances are local to one process/browser context, not shared between tabs, machines or agent processes.

Python, Rust and C++ default runtime API/chain transports fail locally with a capacity error when a budget, concurrency limit or cooldown is active. TypeScript waits within the caller's timeout/abort budget. This deliberate transport difference preserves synchronous SDK interfaces. All retain bounded origin registries and refuse excess new origins instead of evicting an active allowance.

The default browser SDK read retry respects the full Retry-After, supports HTTP dates and can be cancelled during cooldown. Non-server-specified read backoff has jitter. Mutations and signed sends are not blindly replayed. Reference journals still reconcile pending transactions; exceeding a budget may delay recovery until the allowance returns. No limit permanently deletes pending work or treats an unconfirmed transaction as failed.

Custom injected transports or arbitrary scripts can bypass client controls, so backend limits are mandatory. The four SDK implementations do not share a distributed provider-key quota. Research-provider per-cycle/hour budgets remain distinct from these API/chain limits.

## Deployment

1. Review and commit only the files for this change; do not add unrelated design resources.
2. Push and allow the normal Render build/restart. Existing Upstash configuration is reused. No new secret, environment variable, pool deployment or migration is required. New counters expire automatically.
3. Rebuild/restart locally operated TypeScript, Python, Rust and C++ agents using the updated SDKs. A website deploy alone does not update users' runtimes or the native APK.
4. Smoke-test login, market browsing, portfolio, quote preparation and agent heartbeat on the deployed build. Use staging for saturation tests, not the public instance.
5. Check provider/Upstash usage and observed 429 rates against expected invited-user traffic. Validate limits on an isolated Upstash test database before materially increasing concurrency.
6. Verify Cloudflare/Render ingress rules separately. These source changes do not configure an edge firewall, validate proxy IP trust or stop volumetric attacks. The emergency service circuit breakers intentionally remain capable of rejecting all traffic under sufficiently high load.
7. Give settlement workers separately budgeted provider capacity if Render and GitHub currently share a provider key. This cannot be established from repository configuration alone and is not changed here. Never paste credential values into a report.

## Verification

Focused regressions cover anonymous/authenticated isolation, Redis-backed cross-instance account budgets, credential multiplication, RPC weights and queue cancellation, full cooldowns, cancellation during cooldown, in-flight market coalescing, and preservation of non-retried writes. SDK/runtime and local-chain recovery tests must remain passing. Test fixtures only are used; no hosted transaction or production load test is necessary.

Local verification on 27 September 2026:

- Web production build, web/SDK/mobile typechecks, and native API transport test passed.
- Focused production/session, invite, wallet-link, thesis and request-capacity regressions passed.
- TypeScript client, scheduler and runtime unit tests passed. All four local Anvil agent execution/restart/policy/paper tests passed after separating chain and API budgets.
- Rust: three library tests and eight runtime tests passed.
- Python: two capacity tests and six runtime unit tests passed using the existing development virtual environment.
- C++: eight conformance tests and ten runtime tests passed.
- No full hosted load test, Upstash REST validation of the new weighted counter, new APK build, edge-rule verification or production transaction was performed. The weighted counter was exercised through the local Redis test double; hosted validation remains a rollout check.
