# Crypto event sources: release publication pilot

Implemented 2026-09-24. This is a read-only source adapter, not a market release,
deployed workflow, dispute oracle or source of executable pool prices.

## Supported question

Did a specific stable software release become publicly available in the named
repository during a fixed interval? The allowlist currently contains only
`ethereum/go-ethereum` and `paradigmxyz/reth`. Tags must be exact `vMAJOR.MINOR.PATCH`
values. Publication does not mean a network upgrade activated or nodes adopted
the software. Those would require different events and evidence.

The source is the project's GitHub release record. See
[GitHub's release API specification](https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name),
[Geth releases](https://github.com/ethereum/go-ethereum/releases) and
[Reth releases](https://github.com/paradigmxyz/reth/releases).

`releaseEvent` constructs the exact question and source rules. The adapter
rejects edited wording or references rather than interpreting arbitrary text.
The event still belongs to a validated, versioned draft catalog; its position
in that catalog determines its bit. No live question or future deadline is
chosen by this adapter.

## Evidence and failure behavior

- Fetch only `https://api.github.com/repos/{allowlisted repository}/releases/tags/{validated tag}`.
  No supplied URLs, API credentials or redirects. Timeout is 15 seconds; body
  reads stop at one million bytes and invalid UTF-8 is rejected.
- Validate exact tag, numeric release ID, canonical API/HTML URLs, draft and
  prerelease flags and the publication timestamp. Extra GitHub fields can evolve;
  the required selection fields cannot be missing or malformed.
- A public stable release published in `[observationStartsAt, observationEndsAt)`
  produces a YES candidate with `final: false`. `published_at` is used, not the
  Git commit's creation timestamp. Future-dated responses are rejected.
- Missing releases, publications outside the window and prereleases need review.
  HTTP failures, throttling, redirects and malformed responses produce no outcome.
  In particular, a 404 is not evidence that a release was never published and
  deleted. Automated NO determination is not implemented.
- Hash the exact UTF-8 response text. A versioned ABI evidence commitment binds
  that hash to the draft hash, event ID, endpoint, retrieval time, release ID and
  publication time. Retain the response alongside the commitment for replay.
  Edits change the evidence hash; they must not silently overwrite earlier evidence.

These hashes establish which data was reviewed, not its truth, permanence or
availability. `observeRelease` accepts supplied responses for deterministic
testing and does not authenticate them. The CLI performs the HTTPS retrieval;
authenticated CRE delivery and durable evidence hosting are separate work.

## Run

From `workflows/cre`, using a JSON draft whose event was built with `releaseEvent`:

```bash
bun scripts/observe-github-release.ts path/to/draft.json event-id > observation.json
```

Exit code 0 means candidate evidence was obtained; 2 means unresolved or
unavailable source evidence; 1 means invalid input or a transport/read failure.
Neither success nor an evidence hash authorizes settlement. The output includes
the public response for candidates and never includes remote error bodies.

## Validation

28 workflow tests and TypeScript checks passed, including existing synthetic
payload tests. New tests cover source identity, exact templates, interval
boundaries, modified evidence, missing releases, throttling, malformed payloads,
size limits and future publication timestamps.

Live read-only checks retrieved Geth `v1.17.6` (release ID 393420218, published
2026-09-23T02:21:47Z) and Reth `v2.6.0` (release ID 390762883, published
2026-09-17T14:00:49Z). Both produced candidate evidence, never a final report.
These are already-known historical outcomes used to validate the adapter, not
proposed markets to offer for trading. Local evidence is under ignored `target/`.

## Next release gates

Choose exact future questions and source windows; implement reviewed absence
and revision evidence, the chosen dispute process and exception payouts; retain
evidence durably; integrate retrieval into CRE and verify delivery; then deploy
and test the new pool. The current website and synthetic pools remain unchanged.
