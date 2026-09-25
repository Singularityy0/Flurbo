# ADR: Showcase v0 Ethereum activity (2026-09-25)

Status: implementation decision for a separate, supervised testnet deployment. Not deployed by this change.

The user selected four real Ethereum activity events and four hours of trading. Do not reuse the scripted rehearsal rules or existing pool addresses. Keep PilotPool/PilotResolver pricing, collateral, bonds, quorum, finalization and uniform VOID payout logic unchanged.

## Committed questions

All four refer to the first Ethereum mainnet execution block whose timestamp is at least T, where T is trading close + 120 seconds. This block must be finalized according to both configured public RPC providers before an automated assertion. Its immediate parent must have timestamp below T; no substitute block is allowed. Observation ends T + 30 minutes, allowing ordinary finality; late/missing finality is not a NO.

1. Gas used is at least 75% of that block's gas limit (integer comparison).
2. That block contains at least 150 transactions.
3. Its baseFeePerGas is strictly greater than its parent's baseFeePerGas (equality is NO).
4. Its blobGasUsed is at least 3 × 131072, i.e. three blobs.

These are correlated measurements, not four independent experiments. Thresholds are fixed before deployment and do not promise balanced odds. They are not price, sports, election or stock markets.

## Evidence and authority

Only eth_chainId and eth_getBlockByNumber reads, on HTTPS allowlisted Ethereum RPC hosts. Two providers must agree on the selected block, parent and measured fields. Bounded requests, response limits, canonical quantities, parent linkage, timestamp order and finalized-height checks fail closed. Persist the first accepted evidence bundle per pool before signing; never silently replace it. RPC agreement is corroboration, not a light-client proof or an independent oracle. A compromised pair can lie. Public rules, hashes, block numbers and provider observations enable challenges. No LLM decides these arithmetic outcomes. No Kleros integration is claimed.

Existing one-hour assertion, challenge and voting windows, 1 test AUSD bonds, and operator-controlled 2-of-3 panel remain. Automation may propose YES or NO only for this strictly validated new source mode; existing release automation remains YES-only. It does not vote or decide disputes. Unavailable data yields no automated assertion, then VOID after the contract deadline. A false unchallenged assertion can still finalize. Missing monitoring stops automation. All events must finalize before delivery and redemption.

Expected earliest collection settlement: close + 32 minutes + one-hour challenge, plus transaction/scheduler delays. Assertions made near their deadline, challenges and worker outages extend this. Four trading hours are measured from preparation, not a promise of four hours after a delayed deployment. Prepare immediately before deployment and review printed UTC/IST dates.

## Isolation and rollout

Separate prepared/deployed/verified artifacts and an explicit collection mode. Existing namespaces, holdings, pending transaction bindings and redemption paths remain pinned. Register the new collection alongside September and October; never overwrite their manifests. Monitor the new pool before enabling its allowlisted worker. Keep signer journals pool-bound and never discard pending transactions to switch pools. Deployment and activation remain operator steps.

The worker retains one signer-wide lock and migrates its prior journal into a pool-keyed book without deleting ownership or transaction history. Any pending transaction from another pool blocks switching. A bounded drain (at most 12 ticks, with a 150-second loop budget) lets approvals, assertions and receipts progress within the short windows; pending or uncertain transactions stop the run, with no replacement. Only the explicitly configured pool is automated. Return the worker to October after Showcase is delivered. The website dropdown and multi-pool monitor keep both available throughout.

Source specifications: https://ethereum.org/developers/docs/apis/json-rpc/ and https://eips.ethereum.org/EIPS/eip-4844 . Public providers are transport services, not official Ethereum adjudicators.
