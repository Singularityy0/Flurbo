# Settlement evidence and rehearsal persistence

This implementation separates source capture, deterministic evaluation, public evidence publication and transaction state. Persisting a packet locally does not establish that a counterparty can read its URI.

## Production-compatible stores

`createSettlementStores({command, origin, now})` in `apps/web/server/settlement-persistence.mjs` accepts the existing Redis command interface. `now` returns UTC seconds. It returns:

- `captureStore.put(ruleHash, capture)` and `list(ruleHash)` retain complete byte-checked source captures.
- `captureStore.recordAttempt(ruleHash, {at, ok, issues})` and `latestAttempt(ruleHash)` retain the latest collection attempt. Issue values are bounded uppercase reason codes, not raw upstream exceptions.
- `packetStore.put(packet, sha256)` returns `{sha256, uri}` only after canonical hash and deterministic replay verification and durable readback.
- `packetStore.get(uri)` and `getByHash(sha256)` verify the stored packet again. They do not make network requests.
- `packetStore.verifyPublic(uri, {request})` separately fetches the exact public URI, rejects redirects and partial responses, and compares the bounded complete response with the durable canonical packet and its replayed result.

Capture history uses atomic Redis updates. The first and latest observation of each distinct source body and metadata are retained. Repeated unchanged reads do not add unbounded snapshots. Changed bodies remain available to expose conflicting initial releases and correction chains. At most 50 distinct captures, expanded into at most 100 first/latest snapshots, are retained per rule hash. There is no automatic eviction of disputed evidence. Reaching the cap stops collection instead of discarding facts.

Individual source bodies are limited to 2,000,000 bytes. A capture history or canonical packet is limited to 16,000,000 bytes. These are deliberate operational bounds below the evaluator's theoretical maximum. Markets with larger evidence requirements need a reviewed storage design before publication.

The source collector must validate each capture against its committed rule before storing it. The persistence layer checks complete transport, byte count and hash, but does not replace source parsing or immutable market binding. Failed attempts do not overwrite retained valid captures. The worker must require a healthy current attempt before proposing rather than quietly using old evidence after a failed refresh.

## Public serving

Packets are served as immutable JSON at `/api/settlement/packets/<64-character SHA-256>`. The handler accepts GET and HEAD only, validates the exact raw path, and exposes no listing, uploads, source history, monitor state or signer journal. It verifies the content before returning it. Application integration keeps this route public even when preview access requires a login. Responses include a content type, `nosniff`, an immutable cache policy and a content hash ETag. The application applies a local public-read rate limit.

`origin` is an explicit HTTPS origin. Loopback addresses, IP literals, local names, credentials, ports and paths are rejected. An omitted origin permits local capture work and reads, but packet publication fails. There is no implicit fallback from local storage to a production website URL. A syntactically public origin is not proof of reachability. The worker must verify the published archive URI and any referenced packet through the public endpoint before asserting an outcome.

The existing small `pilotEvidence` archive uses the same durable command and retains the bound outcome, event, uploader, draft hash and packet or packet reference. Both the small archive and a larger packet must be available through their published URIs. Storing one without serving the other is insufficient.

## Isolated local backend

`await createLocalSettlementCommand({directory, now})` in `apps/web/server/local-settlement-command.mjs` returns the same asynchronous command interface. `directory` must be an absolute, dedicated local directory; `now` uses milliseconds. This backend is explicitly injected into a rehearsal and is not a production Redis replacement.

It supports only the commands and exact scripts needed by the unchanged settlement monitor and worker lease, evidence upload quotas, capture history and content-addressed archives. Authentication and agent state namespaces and arbitrary Lua are rejected. The web rehearsal should retain its separate session store while injecting `pilotEvidence(command, evidenceOrigin)` and `settlementPackets` for public evidence reads.

Each command holds an exclusive filesystem transaction lock, reads the current state, applies expiry and the command atomically, writes a flushed temporary snapshot, and renames it into place. State survives process reconstruction. On platforms supporting directory synchronization, the rename is synchronized as well. Windows does not expose the same directory synchronization guarantee. The backend preserves permanent journal data, including signed transactions saved before broadcast, and fences expired monitor leases in the same way as the Redis implementation.

The state file is bounded to 64,000,000 bytes, 4,096 keys and 16,000,000 bytes per value. Files use restrictive creation modes where the operating system enforces them. Keep the directory outside any public server root, ignored by Git and accessible only to the operator. It contains operational state and signed transaction data. Private signing keys are never passed to or persisted by this backend.

An abandoned `state.lock` is never automatically stolen. This intentionally stops the worker rather than risking concurrent writes after a crash. Before removing an orphaned lock, stop all processes using the directory and inspect its recorded process ID. Preserve `state.json`, all pending transaction records and evidence files. Corrupt or oversized state fails closed; there is no reset-to-empty recovery.

## Rehearsal hosting limits

A dedicated read-only HTTPS tunnel may make a local evidence gateway reachable during a test. The gateway must expose only the small archive getter and packet handler, never the application, session endpoints, configuration, source history, journal, filesystem or signing material. Public readback is still required before submission.

A temporary tunnel is not durable production hosting. Local bytes surviving restart does not keep an old tunnel URL alive. Keep the same public origin reachable through proposal, challenge, finalization and review. Do not switch origins while a submitted proposal references the previous one. Losing connectivity, stopping the tunnel, sleeping the host or changing the URL invalidates any claim of uninterrupted availability. Preserve the evidence and report the interruption. Production requires a stable public evidence host and an operator-approved retention policy.

## Verification

`node --test apps/web/tests/settlement-persistence.test.ts` covers process restart, two independent concurrent processes, atomic quota updates, lease exclusion and stale-writer fencing, immutable archive readback, first/latest capture retention, conflicts, failed-attempt recovery, tampering, packet replay, public response integrity, bounded downloads, read-only routes, invite bypass only for evidence, invalid paths and local-origin rejection. Existing monitor, email and production-server tests are run alongside it when integrating these stores.
