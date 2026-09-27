# Flurbo autonomous agent platform: architecture and gap assessment

Monad testnet beta with test assets. Not a mainnet product and not a promise of profit.

## Starting point (verified in the repository before this work)

- **Contracts.** `PilotPool` (`FactoredTrading`) exposes `buy(scope, mask, quantity, maxCost, deadline)`, `sell(scope, mask, quantity, minProceeds, deadline)`, `redeem(scope, mask, quantity)`, `quoteBuy`, `quoteSell`, `holdings` and `payoutFraction`. None of these restrict the caller, so a dedicated agent wallet (any EOA) can trade. The collateral is test AUSD at `0xa9012a055bd4e0edff8ce09f960291c09d5322dc` with 6 decimals. Trades check the deadline, the market close time and the slippage limit on-chain.
- **No contract blocker.** Autonomous trading needs no contract change. Stronger on-chain delegation (spending caps enforced by a contract) would need a smart account and is out of scope.
- **Hosted policy.** `pilotCall` (apps/web/shared/pilot.mjs) accepts pool `buy`, `sell` and `redeem` with at most 100 shares (100,000,000 atoms) and limits up to 100 test AUSD, and token `approve` to the pool of at most 100 test AUSD. `pilotService.prepare` uses slippage of 10, 50 or 100 basis points, a deadline of at most 300 seconds (and before close), exact approvals and gas bounds.
- **Authentication.** Mera passkey sessions (cookie `flurbo_session`), invite approval by Mera account (`previewAccess`), and a same-origin check on every non-GET request. There is no headless credential; browser cookies are the only access.
- **Wallet links.** MetaMask wallets are linked by a signed, origin-bound, expiring challenge. A wallet belongs to one Mera account.
- **Agents beta.** Account-isolated agent profiles, a manual joint forecast form, the `joint-edge` v1 strategy, paper trading, and proposals approved one by one in MetaMask. Recovery work is in place: provisional hash recording, verified ownership per chain and hash (atomic with accounting), archive instead of delete, compaction that keeps recovery evidence, and reconciliation of older records.
- **SDK.** TypeScript only. Canonical claims (wrapping `flurbo.claim.v1`), forecasts, the reference strategy, paper trading and a browser transport. No headless transport, signer, execution, journal or runtime.

## Gaps against the requirement

| Requirement | Gap |
| --- | --- |
| Headless API access | No credentials; every route needs a browser session and same-origin headers. |
| Dedicated agent wallet | No association of a wallet with an agent; MetaMask links are account-level. |
| Autonomous execution | No signer, no transaction building outside the web review flow, no journal or nonce handling. |
| Research | Probabilities are typed by hand; no retrieval or model interface. |
| Attribution | Only browser proposals are verified; externally signed transactions are not. |
| Runtime visibility | No heartbeat, policy acknowledgement, pause instruction or runtime status. |
| Languages | TypeScript only; no shared protocol, schemas or cross-language fixtures. |

Each gap is addressed on this branch: stage by stage, with what was and was not verified, in [AGENT_PLATFORM_PROGRESS.md](AGENT_PLATFORM_PROGRESS.md).

## Architecture

```
research (retrieval, model or custom)  ->  structured forecast (validated)
  ->  strategy (joint-edge or custom)  ->  deterministic policy checks
  ->  quote and simulation (pool contract)  ->  journal intent  ->  sign (injected signer)
  ->  journal signed  ->  broadcast  ->  reconcile receipt  ->  report to Flurbo  ->  verified attribution
```

- **Protocol** (`protocol/`): one versioned specification for all SDKs: OpenAPI for hosted endpoints, JSON Schemas, the canonical claim specification, the contract ABI subset and deployment rules, numeric rules, credentials, the transaction lifecycle, and golden fixtures that every SDK must reproduce exactly.
- **Hosted service** (`apps/web/server/agents`): agent credentials, agent wallet ownership proofs, the headless runtime API (`/api/agent-runtime/v1`), runtime heartbeats and policy, self-reported decisions, and verification of externally signed executions. The headless API never reads cookies and never signs.
- **SDKs** (`packages/sdk` TypeScript reference; `packages/sdk-python`, `packages/sdk-rust`, `packages/sdk-cpp`): typed domain helpers, calldata encoding, a signer interface with a local key signer, execution with simulation, a persistent journal, policies, research interfaces and a runner. Generated HTTP code is never counted as a trading SDK.
- **Runtime**: a local command in each language (`flurbo-agent`, `python -m flurbo_sdk`, `flurbo-agent-rs`, `flurbo-agent-cpp`) with `init`, `start`, `stop`, `status`, `recover`, `address` and `sign-message`. State lives in a local directory; no framework is required.

## Control model, stated precisely

- API credentials authorize reading and reporting. They are not signing authority.
- The agent wallet key stays in the operator's runtime. Flurbo never receives it and never asks for a seed phrase.
- Execution policies are software checks in a compliant runtime. A funded wallet bounds the funds at risk; a raw key can bypass any SDK policy.
- Revoking a credential stops a compliant runtime from starting new actions. It does not revoke the wallet's on-chain authority, and a transaction already submitted may still confirm.
- A dashboard pause is an instruction the compliant runtime reads before each new action. It is not an on-chain freeze.
- None of this is cryptographically enforced delegation. That would need a smart account or contract changes, as a separate reviewed design.

## Attribution rules

- **Verified agent execution**: a transaction the runtime reported, sent from the wallet associated with the agent at that time, whose on-chain call matches the reported intent and passes the pool policy, with a confirmed receipt. Ownership is claimed per chain and hash, atomically with accounting, in the same namespace as browser proposals, so no transaction is counted twice.
- **Other wallet activity**: anything else the wallet did. Shown as wallet holdings, never as agent performance.
- **Self-reported decisions**: forecasts, evidence and abstentions sent by the runtime. Labelled as reported by the runtime, never as verified.

Progress is tracked in [AGENT_PLATFORM_PROGRESS.md](AGENT_PLATFORM_PROGRESS.md).
