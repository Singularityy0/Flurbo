# Chainlink CRE for the next Flurbo market batch

Status: design and deployment plan, 3 October 2026. Network: Monad testnet
(chain ID 10143), test assets only. No CRE workflow has been verified as a live
settlement authority for a Flurbo market. This plan does not change the markets
already deployed with bonded resolvers.

## What CRE adds

CRE can collect the market's specified public observations through a Chainlink
workflow, apply deterministic rules, and retain a reproducible evidence packet.
For a new pool that explicitly opts in to CRE settlement, a deployed workflow
could also send an authenticated terminal-state report through the verified
Chainlink forwarder to that pool's receiver. The pool, not CRE, still defines
prices, positions, collateral, and redemption. The report supplies an outcome.

CRE consensus can establish that its nodes agreed on a particular response; it
does not make a mutable or ambiguous source true. Every question therefore needs
an exact source, snapshot time, binary decision rule, revision policy, and
unavailable-source policy before funding.

## Choose one settlement mode per new pool

| Mode | Use in the next batch | Outcome authority | Required work |
| --- | --- | --- | --- |
| Evidence-assisted bonded settlement | First rollout while live CRE delivery is unverified | Existing bonded resolver, with its assertion, challenge, and review process | Deploy and operate a real CRE observation workflow; store and publish its output; have the existing settlement process consider it as evidence. A CRE observation must never silently become a final outcome. |
| CRE-authoritative settlement | Only after a dedicated live test and supported forwarder are confirmed | A new `FactoredCreSettlementReceiver` bound to a new `FactoredPool` or `FundedFactoredPool` | Implement official-source observation through terminal report, authenticated EVM delivery, a real receiver and pool deployment, and end-to-end redemption tests. |

Set the mode in the market's publication and registry. Never change the label
of a bonded pool to imply CRE authority. A pool's resolver is selected at
deployment and cannot be replaced later. The CRE receiver has one-time
finalization and, in its current implementation, no challenge window, void,
timeout refund, or authority recovery. That makes source and failure-policy
review a funding gate for the authoritative mode.

## Existing code and what it proves

- `workflows/cre` is on `main`. The `synthetic` target compiles and simulates
  with fixtures, producing an unsigned report for a placeholder pool. It is
  never a deployment target for funded markets.
- The `pilot` target verifies a configured pool/resolver binding and reads a
  reviewed GitHub release endpoint using CRE HTTP consensus. It returns
  candidate evidence, not a final result or on-chain write. Adapt its source
  logic for the actual batch; do not assume every market is a GitHub event.
- `contracts/src/FactoredCreSettlementReceiver.sol` is locally tested. It
  checks the forwarder, workflow identity, chain, pool, rules hash, observation
  age, and one-time delivery, then calls `pool.resolve`. The TypeScript
  version-2 fixture and Solidity tests demonstrate encoding and redemption
  compatibility. They do not prove production forwarder authentication.
- Current public pools use their existing resolvers. Neither the synthetic
  simulation nor the read-only pilot changes their authority.

## Batch authoring gates, before any new pool is funded

1. Select a small pilot market with a primary public source and a deterministic
   yes/no rule. Publish the exact source URL or contract/feed address, expected
   response field, threshold, units, comparison operator, UTC observation
   window, timestamp rule, and chain/block finality rule. Define behavior for
   no data, changed data, outages, and conflicting sources. Do not infer a
   result from an AI forecast or a current market price.
2. Commit the ordered event list and rule encoding to the pool's
   `settlementRulesHash`. Record the source policy and hashes in a durable,
   publicly readable evidence packet. A hash without the source bytes and
   interpretation rules is insufficient for later review.
3. Choose the settlement mode per pool. For evidence-assisted markets, retain
   the bonded resolver. For CRE-authoritative markets, confirm this exact
   organization has CRE deploy access, Monad testnet EVM write support, and a
   real forwarder address through `cre workflow supported-chains`. Verify the
   forwarder deployment on Monad; do not use a mock or invented address.
4. Implement a workflow trigger tied to the observation schedule. Capture
   source response, status, timestamp, and finalized block; validate the
   committed rule and all failure cases; compute an observation commitment.
   A live workflow must not accept caller-supplied `final: true` as evidence.
5. Run unit, fixture, replay, malformed-source, outage, stale-block, wrong-chain,
   and reorganization tests. Run a live-source CRE simulation using the new
   configuration. Confirm CLI credentials and deployment access separately;
   a successful local simulation grants neither.

## Evidence-assisted deployment path

1. Deploy and activate the reviewed observation workflow on CRE if the account
   and target are supported. Keep the output read-only. Save the source payload,
   normalized observation, workflow/config hashes, execution identifier, and
   timestamp in a durable evidence packet.
2. Bind the evidence packet to the corresponding market and rule hash in
   Flurbo's settlement operator workflow. The existing resolver's assertion,
   challenge, and finalization steps remain unchanged. Display CRE provenance
   only after a real workflow execution has been verified.
3. Test a market from observation through operator assertion, challenge window,
   finalization, and redemption. Test missing or contradictory CRE evidence: the
   operator must stop or use the market's published fallback, never guess.

This path benefits the next batch without changing its on-chain resolver.
It is an evidence integration, not CRE-controlled settlement.

## CRE-authoritative deployment path

Use this only after the batch authoring gates pass and the supported forwarder
and workflow identity have been confirmed.

1. Extend a separate production workflow to fetch the actual final source data,
   validate the full event set, encode the version-2 seven-word report, and
   deliver it using CRE's authenticated EVM write capability. Preserve and
   publish the observation preimage corresponding to `observationsHash`.
2. Configure the receiver with the verified forwarder, nonzero workflow ID,
   CRE-encoded workflow name, workflow owner, and a report-age bound that covers
   the documented observation and delivery window. Workflow identity changes
   may require a new receiver/pool plan.
3. Deploy `FactoredCreSettlementReceiver`, then a new factored pool whose
   resolver is that receiver; call `bindPool` once. Verify bytecode, collateral,
   close time, event count/order, rules hash, resolver address, and bound pool
   using independent Monad RPC reads **before** funding or listing it.
4. Deploy and activate the production workflow. Exercise one small test-asset
   pool end to end: buy shares, wait for the official observation, retain the
   exact source response, receive an authenticated report through the real
   forwarder, verify `SettlementAccepted` and the pool's terminal state, then
   redeem winning shares. Confirm losing and replayed reports are rejected.
5. Publish the CRE execution ID, workflow/config hashes, forwarder, receiver,
   pool, rules/evidence hashes, transaction hash, and final redemption proof.
   Add the market to the registry and index its activity with Envio only after
   the deployment checks pass.

No Flurbo Render environment variable alone deploys a CRE workflow or confers
settlement authority. CRE deployment access, workflow configuration, the
forwarder, and the new pool are separate resources. Keep signing credentials
out of Git and out of the browser.

## Acceptance criteria and stop conditions

Evidence-assisted is live when a real CRE execution produces a durable packet
for the published rule and the existing bonded process consumes it without
losing its challenge path. CRE-authoritative is live only when an authenticated
report from a deployed workflow finalizes a new pool and a holder redeems on
Monad testnet. Simulation output, a UI badge, or an unsigned fixture alone does
not meet either criterion.

Do not fund a CRE-authoritative pool if deploy access, Monad testnet write
support, the genuine forwarder, workflow identity, source finality, evidence
retention, or an acceptable failure policy is missing. Use the bonded mode for
that batch instead. If a report is rejected, preserve the rejection and source
packet; never add a signature bypass to the receiver.

## References

- Local implementation: [`workflows/cre/README.md`](../workflows/cre/README.md),
  [`docs/CRE_RECEIVER.md`](CRE_RECEIVER.md),
  [`contracts/src/FactoredCreSettlementReceiver.sol`](../contracts/src/FactoredCreSettlementReceiver.sol).
- Chainlink: [CRE overview](https://docs.chain.link/cre/overview),
  [supported networks and tenant-specific chain check](https://docs.chain.link/cre/supported-networks-ts),
  [building EVM consumer contracts](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts).
