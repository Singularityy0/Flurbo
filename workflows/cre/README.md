# Synthetic CRE settlement simulation

This is a **synthetic-only, unsigned report preparation workflow** for the
enumerated reference pool. An HTTP trigger carries local fixture observations;
the workflow validates them, derives a terminal state and returns the 224-byte
ABI payload defined in [the receiver specification](../../docs/CRE_RECEIVER.md).
It does not fetch official results, sign a report, call `writeReport`, deploy
contracts or broadcast transactions. It does not complete the CRE bounty's
external-data-to-blockchain requirement.

## Reproduce (Git Bash)

Install Bun and the CRE CLI, and log in to CRE. Verified here with Bun 1.4.2,
CRE CLI 1.33.0 and the pinned SDK 1.22.0. From the repository root:

```sh
cd workflows/cre
bun install --frozen-lockfile
bun test
bun run typecheck
cre workflow simulate . --target synthetic --non-interactive --trigger-index 0 --http-payload ./fixtures/observations.json
```

Do not add `--broadcast`. The CLI requires a reachable RPC configuration even
without a blockchain capability; `project.yaml` supplies public Monad testnet.
Chain ID 10143 in the report describes only the synthetic destination.
`0x1111111111111111111111111111111111111111` is a placeholder, **not a deployed
Flurbo pool**. No wallet or private key is required. The CLI's default simulation
key notice does not mean this workflow makes chain writes.

The successful CLI run on September 21, 2026 used normal simulation limits and
returned terminal state **1** (A true, B false). The report timestamp comes from
`runtime.now()`, so the evidence hash and report bytes change between runs.
Sixteen unit tests cover all 14 terminal states for one through three events,
canonical ordering, commitment binding and malformed/missing/unfinished evidence.
Type checking covers workflow source; Bun executes the tests.
An additional CLI simulation with `observations[0].final=false` aborted with
`invalid_literal` and produced no report, as expected.

## Exact synthetic rules

Only `synthetic-only` mode and `fixture:` source identifiers are accepted.
Configuration fixes 1–3 unique event IDs in bit order, their exact source labels,
chain ID, pool and close time. Outcomes must be JSON booleans; finality must be
the literal `true`. Every event must appear exactly once, with no extra fields.
Finality timestamps must be integral Unix seconds in `[closesAt, runtime.now()]`.
Any failure aborts report preparation. No partial, default, void or fallback
outcome exists. In this fixture convention all events finalize after trading
closes; actual market rules may require different per-event windows.

Source labels and `final: true` are assertions from the caller, not authenticated
evidence. Old finality timestamps are intentionally allowed for fixture replay;
the current report timestamp records fixture processing, not a fresh API fetch.
The empty HTTP authorized-key list is only for CLI fixture simulation. Do not
deploy this workflow as a live resolver or merely switch its mode to production.

Commitments use Keccak-256 over standard ABI encoding, never packed encoding or
JSON stringification. `src/settlement.ts` publishes the exact preimages:

- Rules: `(string domain, uint256 chainId, address pool, uint64 closesAt,
  (string id, string source)[] events)`, domain `flurbo.synthetic.rules.v1`.
  Array order is event bit order. The v1 domain commits to the validation policy
  above; changing that policy requires a new domain/version.
- Evidence: `(string domain, bytes32 rulesHash, uint64 observedAt,
  (string eventId, string source, bool outcome, uint64 finalizedAt)[] observations)`,
  domain `flurbo.synthetic.evidence.v1`. Observations are reordered to match the
  configured events. `final=true` is mandatory and implicit in this v1 encoding.

For the checked-in fixtures the rules hash is
`0x544e75a084153a0d6e523edf86b76ba10a0efef40f93e43e299f7fa2f852fcbc`.
At test timestamp `1700000030`, the evidence hash is
`0xf41952eb31bc7a7c62138fac5b0b48e84024962abdf770e42c9cf3d331fe86cf`.
Both fixed vectors were independently reproduced with Foundry `cast abi-encode`
and `cast keccak`. Actual evidence must be stored durably; a commitment alone
does not establish truth or availability.

## Next integration gates

1. Select real events and official sources, publish observation windows, finality,
   binary mapping, revisions/outages policy and a separately versioned rules
   preimage before creating a live pool. Add API retrieval and CRE consensus.
2. Local payload-to-redemption tests now pass (see below). Verify the real
   forwarder and workflow identity before any live delivery.
   CRE's simulation MockForwarder omits the identity metadata required by our
   receiver. Use a separate test harness; preserve receiver authentication.
3. Retain reproducible external-data and authenticated-chain-delivery evidence
   before marking CRE integration complete. This slice does not alter shared-pool
   pricing, or replace the required factored engine, conditionals or Kuru anchoring.

## Local workflow-to-redemption test

`scripts/settlement-fixtures.ts` calls the same `prepareSettlement` function as
the CRE handler and generates four Solidity payload fixtures, one per two-event
terminal state. They use the test creator's predicted CREATE address at nonce 1,
so the pool address can be included in the rules hash before deploying the pool.
This is a local test address, not a testnet deployment. The CLI example retains
its separately labelled placeholder address.

`CreWorkflowSettlement.t.sol` deploys real receiver/pool code inside Foundry,
checks the predicted address, funds with mock collateral and buys A, B and A AND B
for two owners. It delivers the generated report bytes unchanged through the
explicitly unauthenticated local forwarder. Seven tests check all four outcomes,
partial redemption, zero-payout losing burns, exact owner/pool balance changes,
remaining collateral requirements, complete liability cleanup, same/changed-report
replays, wrong-chain/stale rejection and rejection of direct unsigned delivery.

From the repository root, after installing the contract and workflow dependencies:

```sh
cd workflows/cre
bun run fixtures:check
cd ../..
forge test --match-contract CreWorkflowSettlementTest
```

After an intentional workflow encoding change, run `bun run fixtures` from
`workflows/cre`, review the generated Solidity diff, then rerun the check/tests.
The freshness check detects stale checked-in payloads without requiring Foundry
FFI, filesystem permissions or network access. The generator uses Bun's host
runtime; it is not bundled into the CRE WASM workflow.

This proves compatibility between the TypeScript report preparation and local
Solidity settlement/accounting. It does not exercise DON signing, production
forwarder verification, official APIs, actual AUSD or public-chain execution.

Factored pools opt in with `reportVersion: 2` (1–32 synthetic events and a
`uint32` terminal-state word), targeting `FactoredCreSettlementReceiver`.
The default version 1 continues to target `CreSettlementReceiver` (1–3 events).
The rules/evidence domains differ by version; regenerate commitments when changing
versions. `bun run fixtures` and `bun run fixtures:check` now cover both receivers.
The workflow still produces unsigned synthetic payloads only. See
[the receiver version-2 boundary](../../docs/CRE_RECEIVER.md#factored-pools-report-version-2)
for the tested scope and remaining live-delivery requirements.
