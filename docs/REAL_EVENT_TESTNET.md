# Real-event testnet release

Status: implementation and isolated testing, 2026-09-24. The separate
`PilotPool` and `PilotResolver` now implement the five-role lifecycle with a
fixed named testnet reviewer panel and bounded void settlement. Hosted views,
reviewed signing, durable evidence/history and publication verification are
implemented. Nothing in this pilot has been publicly deployed or published.
Reviewer identities and exact future events/windows still require human input.
See [the deployment runbook](PILOT_TESTNET_DEPLOYMENT.md) for current evidence,
remaining integrations and the wallet-operated release sequence.

## Release objective

Launch a small, explicitly labelled public Monad testnet pilot using actual
event outcomes and test AUSD. Preserve Flurbo's shared on-chain cost-function
pool for supported combinations, Kuru base-event trading, Mera account access
and optional MetaMask transaction signing. No mainnet deployment or real-money
release is authorized by this milestone.

Recommend one curated cluster of two or three events for the first release.
Each cluster has its own shared collateral pool. Adding a derived claim within
that cluster must not create another pool or require an RFQ. Cross-cluster
combinations are not automatically supported.

## What changes from the existing release

The deployed original and learning pools have immutable resolvers and rules.
They cannot be relabelled with real questions or retrofitted with disputes.
Deploy a new pool with a new settlement controller. Keep old positions, history,
redemption and synthetic labels available under their original addresses.

`FactoredPool.resolve` accepts a single terminal bit vector, once, after close.
It has no challenge window, cancellation state or voting protocol. The existing
`FactoredCreSettlementReceiver` immediately finalizes an authenticated report;
the synthetic CRE workflow does not retrieve official results. Neither is an
implementation of the requested five-role lifecycle.

## Roles and authority

| Role | Proposed responsibility | Authority boundary |
| --- | --- | --- |
| Creator | Define a cluster, ordered base events, evidence sources, deadlines and outcome rules; arrange initial subsidy. | Cannot edit funded market rules or settle their own question merely because they created it. Start with reviewed publication; permissionless publication is a separate release decision. |
| Trader | Buy, sell, wrap, use Kuru and redeem using the selected trading wallet. | Mera login and wallet ownership do not grant settlement authority. |
| Asserter | Submit a candidate base-event outcome with retrievable evidence and a test bond under the selected policy. | Assertion opens a challenge period; it is not immediately redeemable. |
| Disputer | Challenge an assertion before the on-chain deadline, supplying counter-evidence and the specified test bond. | A challenge suspends finalization of the affected event; it cannot choose the payout by itself. |
| Voter | Adjudicate a disputed outcome under precommitted eligibility, quorum and voting rules. | No ad hoc vote by whoever happens to hold a Flurbo account; no creator/admin override after a binding decision. |

These are actions and permissions, not five separate signup methods. The UI
continues using Mera for login. Each signed action identifies the actual signer.
Role overlap and conflicts of interest must be specified before publication.

The user chose to investigate an existing oracle before considering a panel.
The subsequent instruction to continue the recommended custom workaround is the basis for implementing a named testnet panel. Publication still requires explicit named reviewers and reviewed rules.
A faucet-funded bond cannot provide meaningful economic resistance to attackers.
Mera passkeys do not prove that two accounts belong to different people.

An external-oracle release would need verified Monad testnet support and an explicitly tested delivery path. The implemented pilot uses its own disclosed panel instead. UMA-style assertions and disputes are useful
prior art, not evidence that UMA is already integrated or available on Monad.
See [UMA's oracle lifecycle](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work).

## Outcome lifecycle

1. Draft: creator publishes proposed rules and source definitions.
2. Published and funded: exact rule bytes and ordered event IDs are committed;
   the controller, pool, token and chain are bound before accepting trades.
3. Trading: the existing cost function quotes supported Boolean claims.
4. Closed: new trades stop at the committed deadline.
5. Asserted: evidence and a candidate outcome open the challenge window.
6. Unchallenged assertions finalize only after that window. Challenged assertions
   enter adjudication; the contract enforces eligibility and deadlines.
7. Once every base event has a final YES, NO or VOID outcome, the controller constructs the valid and void masks and calls the separate pilot pool exactly once.
8. Winners redeem according to each claim's existing truth table. No separate
   vote or oracle report is required for each conjunction or disjunction.

For the first cluster, close trading before the earliest scheduled observation.
The current pool is not a partial-resolution engine. Time-staggered live events
and continued trading after a known result require a separate design.

## Market rules required before funding

- Stable cluster/event identifiers, question text, bit order and display labels.
- Exact primary source, result identifier and deterministic YES/NO interpretation.
- UTC trading close, observation interval, assertion eligibility and deadlines.
- Treatment of source revisions, delayed results, cancellations and ambiguity.
- Evidence payload schema, retrieval time, source publication time, content hash,
  persistent evidence location and a user-readable evidence page.
- Controller and oracle identity, dispute process, bonds, bond recipients,
  eligibility, quorum, voting deadlines, ties, abstentions and nonresponse.
- Funding amount, pricing parameters, supported graph width and claim language.
- Replay domains binding chain, pool, rules version, event and assertion round.

Source adapters must use reviewed source configurations. A creator-supplied URL
must not turn the hosted reader into an unrestricted server-side HTTP fetcher.
Missing, conflicting or malformed evidence never becomes an automatic NO.

## Cancellation and liveness are release gates

The old synthetic pool cannot represent an invalid/void event or refund a cluster. The new PilotPool implements uniform-weight void payouts, not purchase-price refunds.
Adding a UI label does not change that. Do not hardcode a terminal state to get
around an unavailable source, tied vote or cancelled event.

The new uniform-void policy and its tests address
how every outstanding composed claim is valued and collateral remains covered.
Returning each buyer's original cost is not a valid general policy after resale
and wrapping. The policy must cover mixed valid/invalid legs, wrapped claims,
Kuru inventory, open orders and reserve accounting. Reject unsupported event
templates until this policy and its invariant tests are complete.

## Keep the partner architecture explicit

- CRE retrieves and validates official-source evidence. A new authenticated
  adapter can submit evidence/proposals to the settlement controller; it must
  not bypass an open challenge or a binding dispute decision. Verify network,
  actual forwarder code and workflow identity before authenticated delivery.
  [CRE consumer documentation](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)
  and [network directory](https://docs.chain.link/cre/supported-networks) are the
  reference points; no network support is established by this document.
- Kuru needs new backed base-event receipts and pairs for the real-event pool.
  The synthetic H YES pair cannot be renamed or reused as a new event token.
- Mera remains required for product login; Mera or MetaMask signs each action
  under the existing review flow. Voting eligibility is independently enforced.
- Alchemy remains RPC infrastructure. Envio/durable indexing must capture the new
  lifecycle with reorg handling; an in-memory scan is not durable evidence storage.
- Rust learning and funded updates remain separate from truth determination.
  Learned probability is never an asserted outcome or a vote.
- Native mobile, conditional securities, remaining partner criteria and learning
  data work remain tracked separately; this pilot does not claim they are done.

## Small implementation slices

| Slice | Concrete deliverable | Acceptance before moving on |
| --- | --- | --- |
| 1 | Event/rule schema, canonical commitments and first source adapter | Real source sample validates; missing/revised/ambiguous data fails correctly; exact questions and source terms reviewed. |
| 2 | Settlement controller and chosen dispute adapter | Assertion, challenge, voting and finalization transitions; no unauthorized or early resolution; bonds conserved; bounded exception policy. |
| 3 | Cluster publication and deployment | Rules fixed before funding; new verified pool and receipt addresses; graph/claim restrictions checked; subsidy coverage proven. |
| 4 | Consumer creation, evidence, assertion and dispute views | Consistent existing design; clear deadlines and signer identity; no synthetic labels on real markets; portfolio/history retain both generations. |
| 5 | CRE delivery, Kuru pairs and persistent lifecycle indexing | Actual authenticated evidence delivery; receipt backing; order/fill/cancel/withdraw; durable evidence and replay/reorg reconciliation. |
| 6 | Public testnet acceptance and invite | Independent wallets exercise normal and disputed settlement, cancellation/nonresponse, trading and redemption; observed transactions documented. |

Each slice is reviewable separately and ends with user-run commit/push commands.
Contract broadcasts remain separately reviewed wallet actions. Do not estimate a
release date until source access and the chosen dispute model are confirmed.

## Implemented foundation

`workflows/cre/src/event-draft.ts` validates an offline two/three-event catalog
and creates a versioned ABI commitment. It records ordered IDs, question and
YES/NO wording, observation windows, source references, result identifiers,
selection/finality/revision rules and proposed exception/dispute policies.
Validation rejects unknown fields, duplicate IDs, ambiguous identical YES/NO
text, invalid time ordering, non-testnet chain IDs and unsafe reference syntax.
This does not prove the rules are semantically correct or the source is official.

The commitment domain is `flurbo.event-draft.v1`. Object key order does not
change the commitment; array order defines event bits and does change it.
Absent policies are explicit null values, encoded with presence flags. Exact
UTF-8 strings are preserved; control characters and surrounding whitespace are
rejected instead of silently rewriting rule bytes. Deployment will need a
separate domain binding pool/controller identities and enforceable policies.
Do not use this draft hash as an existing pool's settlement rules hash.

Run locally from `workflows/cre`:

```bash
bun scripts/review-event-draft.ts path/to/draft.json
bun test
bun run typecheck
```

The command performs no network calls or chain writes. Exit code zero means a
valid draft, not permission to publish. It always prints `deployable: false`
with outstanding gates. Stale dates remain hashable for reproducibility but are
flagged as a release blocker. No real market is published by these commands.
Tests use explicitly fictional governance questions, not a proposed event list.

## Oracle research checkpoint

Checked official sources on 2026-09-24:

- [UMA network information](https://docs.uma.xyz/resources/network-addresses)
  does not list Monad mainnet or testnet. It also distinguishes oracle contracts
  from DVM support; listed testnets do not provide DVM-backed dispute voting.
  Deploying a copy of OOv3 on Monad would not itself connect that voting network.
- [Reality.eth's official app](https://reality.eth.limo/app/) lists Monad mainnet.
  The [deployment repository](https://github.com/RealityETH/reality-eth-monorepo/tree/main/packages/contracts/chains/deployments)
  has a `143/MONAD` directory; neither inspected list establishes chain 10143
  support. An oracle deployment alone does not verify its arbitrator or jurors.
- Live GitHub API directory checks confirmed Reality.eth has chain `143` and no
  `10143` entry, and UMA has neither `143.json` nor `10143.json` in its published
  deployment directory. Reality.eth's Monad entry is `RealityETH-3.2.json`.
- [Kleros's deployment list](https://docs.kleros.io/developer/deployment-addresses)
  names Sepolia and Chiado testnet deployments, not Monad. Its
  [oracle integration guide](https://docs.kleros.io/integrations/types-of-integrations/3.-kleros-oracle-integration)
  requires an arbitrator proxy as well as Reality.eth. A mainnet oracle alone is
  not a usable testnet dispute system.

Result: no existing Monad testnet dispute-and-voting path has been verified.
This is a research limitation, not proof that no integration is possible.
Next verify supported testnet oracle, arbitrator, bond currency, appeal/finality
rules and authenticated result delivery before selecting a contract adapter.
No cross-chain relay, mock, central panel or alternate chain is implicitly approved.

The user asked whether a custom oracle is viable. The proposed fallback is a
testnet-only optimistic controller: public assertions and challenges, a fixed
named reviewer set, public votes and a precommitted quorum (for example three
of five). CRE supplies evidence; the controller enforces finalization. It must
disclose panel trust and implement cancellation/nonresponse payouts before
release. This fallback is now implemented in PilotResolver and PilotPool. It is not publicly deployed or independently audited.

The first [official-source adapter](CRYPTO_EVENT_SOURCES.md) now reads exact
Geth/Reth stable-release publication records as candidate evidence. This is
now used by a separate pilot CRE observer that checks chain bindings and retrieves candidate evidence. No market has been published; live pilot CRE simulation/delivery remains a release gate.

## Remaining decisions and access

1. Choose exact crypto questions, official source records and future windows.
2. Provide three or five independent named reviewers and public signing addresses.
3. Execute and verify the new deployment, CRE observation, Kuru pair and public acceptance sequence in the runbook.

Candidate source adapters may be tested independently. Freeze the first market's
questions, deadlines, evidence rules and exception policy before preparing a
deployable configuration or publishing a new market.
