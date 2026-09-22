# CRE settlement receiver: local contract boundary

`CreSettlementReceiver` delivers one authenticated terminal state to one
`ReferencePool`. Its local tests use a deliberately unauthenticated mock
transport. A separate [synthetic workflow](../workflows/cre/README.md) has now run
in the CRE CLI and prepared unsigned ABI payloads. No DON signatures have been
verified by these tests, and no receiver or pool has been deployed.

## Deployment and authority

Deploy the receiver with a verified forwarder contract address, nonzero workflow
ID, encoded workflow name, workflow owner and maximum report age in seconds.
These values cannot be changed or disabled. Deploy a new pool whose immutable
resolver is that receiver, then have the receiver's deployer call `bindPool` once.
Binding requires a deployed target that reports this receiver as its resolver.
The deployer must verify the actual pool code and rules, not merely its getters.
Finish binding before inviting funding. Existing pools with another immutable
resolver cannot be retrofitted. No factory, upgrade or admin resolution exists.

The receiver delegates signature verification to the configured forwarder and
then checks the workflow identity itself. A code-presence check is not verification
of a forwarder's implementation or network configuration. A compromised trusted
workflow/forwarder or an incorrectly chosen target still invalidates the trust
model. Workflow updates that change its ID require a new receiver/pool configuration.

## Metadata and report encoding

The ABI implements `onReport(bytes,bytes)` and ERC165 interface discovery. Following
[Chainlink's consumer guide](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)
and its [pinned forwarder source](https://github.com/smartcontractkit/chainlink-evm/blob/b6427ea1f4847d640abdf24dbd6c6f01d7799d59/contracts/cre/src/v1/KeystoneForwarder.sol),
metadata must be exactly 64 bytes:

| Byte offsets | Field |
| --- | --- |
| 0–31 | `bytes32 workflowId` |
| 32–41 | `bytes10 workflowName` |
| 42–61 | `address workflowOwner` |
| 62–63 | `bytes2 reportId` |

The name is CRE's encoded value, not a padded plaintext name: the first ten
lowercase hex characters of SHA-256(name), represented as ten ASCII bytes.
Do not truncate the raw digest to ten bytes. All three identity fields must match.
The report ID is logged; it is not treated as a globally unique nonce.

The application payload is `abi.encode(SettlementReport)` with exactly 224 bytes:

| ABI word | Type | Meaning/check |
| --- | --- | --- |
| 0 | `uint8` | Schema version, must equal 1 |
| 1 | `uint256` | Destination EVM chain ID, must equal `block.chainid` |
| 2 | `address` | Bound pool address |
| 3 | `bytes32` | Pool's immutable `settlementRulesHash` |
| 4 | `uint64` | Final observation timestamp, Unix seconds |
| 5 | `bytes32` | Nonzero commitment to the observation/evidence record |
| 6 | `uint8` | Terminal state; event i is bit i |

The final observation must be at or after trading close, no later than the current
block, and at most `maxReportAge` seconds old (inclusive). This is when the workflow
observed the complete final result, not a replacement for each event's observation
time in the committed rules. Evidence must be retained separately; a hash proves
neither availability nor truth. The synthetic workflow publishes deterministic
fixture rules/evidence preimages; actual source retrieval and verification remain
pending before it can produce a live settlement report.

## Finality, retries and limits

One successful report permanently finalizes the receiver. Identical reports and
changed outcomes/report IDs are then rejected. Chain, pool and rules checks
prevent a valid payload from being reused in another destination context.
`acceptedReportHash` commits to chain, receiver, metadata and payload using
`keccak256(abi.encode(...))`. `SettlementAccepted` records that digest and evidence
context. The existing pool validates funding, closing time and terminal-state range.

A downstream revert rolls back both contracts' state. Failed delivery can be
retried while the report is still fresh, or corrected by the authorized workflow;
an accepted result cannot be corrected. Resolution does not transfer collateral.
Existing redemption and coverage rules still apply. There is no partial settlement,
dispute window, void outcome, timeout refund or authority recovery in this slice.

## Remaining integration gates

- Agree on ordered events, sources, observation windows, finality, binary mapping,
  evidence encoding and failure policy; publish the exact rules-hash preimage.
- Extend the synthetic workflow with official source retrieval and verify the
  chosen chain's actual forwarder and workflow metadata. Never substitute an
  invented or mock deployment address.
- Synthetic report preparation now passes CRE CLI simulation; test verified
  report delivery separately. The documented simulation MockForwarder omits
  identity metadata, so it cannot call this strict
  receiver successfully. Use a separate test harness for simulation; do not add
  an authentication-off mode to the funded receiver to make a demo pass.
- Test real collateral and complete deployment-to-redemption before claiming the
  partner integration complete. This adapter still settles the enumerated
  reference engine; factored pricing and tradable conditionals remain required.

Validation: 14 receiver tests, including a literal 64-byte metadata fixture,
authentication/domain/freshness rejection, replay and rollback cases, overlapping
claim redemption, and 256 randomized terminal-state/report-ID combinations.
Seven additional [workflow payload tests](../workflows/cre/README.md#local-workflow-to-redemption-test)
deliver generated TypeScript ABI bytes unchanged to local contracts, exercise all
four two-event outcomes and exact multi-owner redemption, and reject replay,
wrong-chain, stale and direct unsigned delivery. No production authentication
or contract behavior was changed for this harness.
