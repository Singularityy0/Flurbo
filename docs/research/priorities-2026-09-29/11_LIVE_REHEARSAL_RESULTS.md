# General-source public testnet rehearsal

Date: 29 September 2026. Branch: `product-priorities-correctness`. Status: **live settlement lifecycle and human redemption verified; operational reliability limitations remain**.

## Final result

Both real USGS snapshots were retained within their immutable windows. The existing worker automatically submitted both NO assertions, finalized them normally after their challenge periods and delivered the results. No manual proposal, finalization or delivery rescue was used. The separate human holder then redeemed the winning A NO share successfully. Four native SDK purchases also passed, as documented in `12_LIVE_SDK_TRADE_RESULTS.md`.

Independent verification at 03:07:45 UTC confirmed redemption transaction `0xb5153a71abc2c2a7a0f52cc216ca046c4940c96ad5a3012a0a17af92670a7f42`, canonical successful receipt at block 66575193. The exact pool emitted `Redeemed` for the expected holder, scope 1, mask 1, quantity 1,000,000 and collateral 1,000,000 atoms. The receipt also contains the matching test-AUSD transfer from pool to holder. Historical reads immediately before and at that block show cash increasing from 97.248227 to 98.248227 test AUSD and the NO holding decreasing from one share to zero. The proof is retained in `target/local-settlement-rehearsal/live-source-test/redemption-proof-*.json`. Losing YES shares need not be redeemed to demonstrate the winning payout.

This closes the bounded lifecycle rehearsal, not production release approval. The unexplained pre-capture process interruption required supervised recovery; monitor RPC failures later blocked capture temporarily; public evidence is hosted through a temporary tunnel. Continuous unattended uptime, production scheduler and funding readiness, durable public evidence hosting, pending-transaction restart recovery and live disputed resolution are not established by this run. No source, rules or journal was reset to obtain the result. Nothing was committed, pushed or deployed to production.

## Verified deployment

- Chain: public Monad testnet, 10143.
- Pool: `0xab8370662403b730a481973f4824c7c7d37d0163`.
- Resolver: `0xc1ba5c074632c6f0b73a725da565898499ce8623`.
- Rules hash: `0x7a9bdf6889f14e19bba2a8b3ccbdaa37c9af9baaaabf7758a31ed7387ea5879d`.
- Draft hash: `0xcff2d998789e00f263b752037c2a93fd661bd3e8ee829b9b96a083b33a78096b`.
- Verified snapshot block: 66534708.
- Eight deployment receipts have status `0x1`; no pending broadcast remains in the deployment record.
- Resolver creation: `0xee3019f1e9fdf12cb7ce93382c6a77d31c98f972f20cd07a2a3e24c663a3a8bc`.
- Pool creation: `0xfe11b46f63e0585a505d92ed22c5ca34a869b7db3807a19b6d07bc7400b0b0c6`.

The verified manifest is `target/deployments/deterministic-test-testnet.json`. Deployment receipts are in `target/broadcast/DeployDeterministicTest.s.sol/10143/run-latest.json`. These are local acceptance artifacts. Do not publish signing caches or wallet files.

## Immutable schedule

All dates below are 29 September 2026.

| Milestone | UTC | IST |
|---|---|---|
| Trading closes | 00:36 | 06:06 |
| Event A origin-time interval | 00:38 through 00:43 | 06:08 through 06:13 |
| Event A first-snapshot capture | 00:45 through 00:50 | 06:15 through 06:20 |
| Event B origin-time interval | 00:44 through 00:49 | 06:14 through 06:19 |
| Event B first-snapshot capture | 00:51 through 00:56 | 06:21 through 06:26 |
| Event A assertion opens | 00:50 | 06:20 |
| Event B assertion opens | 00:56 | 06:26 |
| Earliest ordinary full settlement | About 01:56 plus transaction/polling delays | About 07:26 plus delays |

The questions concern the first eligible retained USGS catalogue snapshot, not a final physical earthquake count. A asks whether its count is at least one. B asks whether its count is zero. Neither result is predetermined. Each challenge period runs for one hour from the actual assertion transaction. Missing proposals can only take the published timeout path to VOID.

## Runtime observations

The private website is hosted on loopback at `http://localhost:18867`. Chrome successfully loaded the real app, the user completed a localhost passkey sign-in, and the directory showed exactly the two questions in the new collection. The first market page showed public Monad testnet, the correct close time, one-share prices and the new pool namespace. The user linked the separate trading wallet and confirmed allowance and purchase transactions in MetaMask. Holder redemption has not yet occurred.

### First verified holder trade

- Wallet: `0x806f185afc0e7477aaac9ada67b414bc50913fa2`.
- Allowance transaction: `0x260e26ef6e22b52c6e91f02c7900aa5f6c65b51be8b3140b85e69fa88310e9b2`; this alone did not purchase a position.
- Purchase: `0x215fba765ab1ce0677ffa084b58a51e009a7b1a30c5d49a6f6e9e99efaafe73a`, successful at block 66537067.
- Decoded `Traded` event: scope 1, mask 2, buy 1,000,000 atoms of A YES, collateral 512,495 atoms (0.512495 test AUSD).
- Direct on-chain holdings read: 1,000,000 atoms. Wallet collateral after purchase: 49,056,634 atoms.
- Receipt block hash matched the canonical block and was at least two blocks deep when checked. The public read-only proof is retained in the isolated rehearsal directory as `trade-<transaction-hash-without-0x>.json`.

The UI showed the confirmed transaction and one share awaiting settlement. Its immediate balance refresh also reported a temporary failure; no duplicate purchase was submitted.

### Verified opposite-side holder trade

- Same holder wallet and event A, with a separate NO position to make later redemption measurable regardless of the source result.
- Allowance transaction: `0xb5cc5d97087c27b17fb698c9cf8d24d89211c570e299eaaa810180e50ac51f39`. The UI explicitly reported that the purchase had not been sent after this approval.
- Purchase: `0x4c710262477ee7a35d9d231e23b077475db2b3cfa3f3ccf668e345037ceeb7b1`, successful at block 66538568.
- Decoded `Traded` event: scope 1, mask 1, buy 1,000,000 atoms of A NO, collateral 487,506 atoms (0.487506 test AUSD).
- Direct on-chain NO holdings read: 1,000,000 atoms. Wallet collateral after purchase: 48,569,128 atoms.
- Receipt block hash matched the canonical block and was at least two blocks deep when verified at 23:41:23 UTC on 28 September. The read-only proof is retained as `trade-4c710262477ee7a35d9d231e23b077475db2b3cfa3f3ccf668e345037ceeb7b1.json` in the isolated rehearsal directory.

The two verified purchases cost 1,000,001 collateral atoms in total, excluding test MON gas. These are deliberate test positions, not evidence of organic trading demand. The second confirmation also displayed a temporary balance refresh failure; the successful chain receipt was verified instead of repeating the purchase. Settlement and holder redemption remain pending.

Chrome portfolio subsequently recovered and displayed both positions together: one YES share and one NO share, both awaiting settlement, with zero ready to collect and zero collected. The screenshot is retained at `target/local-settlement-rehearsal/live-source-test/portfolio-both-positions.png`. At 23:42:01 UTC the worker was healthy, execution and proposals enabled for this pool, with no pending monitor alerts and both sources awaiting their scheduled windows.

The local chart currently reports unavailable historical price storage because account sessions use the isolated memory store. This is a rehearsal UI limitation, not evidence of a production price-history regression or fabricated chart data. The USGS collection currently falls into the generic Ecosystem category.

The dedicated nonholder bot is `0xd7de0770df63fe92169dd5e574a26b32425db243`. Before starting, read-only chain checks confirmed 1 test MON, 2 test AUSD, zero pending and latest nonces, and no held claims. The actual monitor reported healthy with no queued alerts. The first execution-enabled loop reported `wait` and both sources `waiting-for-snapshot-window`, as expected before capture.

The worker polls once per minute after each completed cycle, so actual intervals include RPC time. It runs under PowerShell 7 with the local DPAPI launcher. Its PID is saved in `worker.pid`; state and logs are under `target/local-settlement-rehearsal/live-source-test`. Do not launch a competing signer or clear this state. The operator must keep the machine awake and connected.

Before source capture, a monitor read failed at 23:29:03 UTC on 28 September. The worker blocked that cycle, recorded a local failure alert, and recovered on the next successful monitor read at 23:30:08 UTC. A later worker read also reported `RPC_READ_FAILED`. No manual settlement transaction or fabricated answer was used. Public RPC reliability remains an observed operational risk; healthy recovery is not proof of future availability during the five-minute capture windows.

Only the read-only evidence gateway is exposed publicly. Its initial origin was `https://facility-laboratory-img-sculpture.trycloudflare.com`; after the interruption described below, it is `https://xml-enter-session-lamb.trycloudflare.com`. Initial public health returned 200, while account and wallet-file routes returned 404; the replacement public health also returned the expected read-only service identity. This temporary tunnel must remain available for evidence retrieval and does not demonstrate production archival durability. The private app is not tunneled.

Local monitor alerts are durable files, not email. A thread follow-up checks for meaningful milestones or failures; it is not the transaction scheduler. GitHub Actions and Render settings remain unchanged.

### Process interruption and supervised recovery

The last cycle before an unplanned process interruption began at 23:45:37 UTC on 28 September. At 23:53 UTC, the recorded worker process was absent, its output was stale, the earlier execution sessions were unavailable, and the local website and evidence ports were not listening. The cause of process termination was not established. This is a failure of uninterrupted local operation and must not be presented as unattended uptime.

Before restarting, the store was checked without exposing signer material: no captures, packets, frozen proposals, archived evidence or worker transaction journals existed. The original public configuration was preserved. Only the runtime evidence origin was changed to the replacement tunnel, outside the immutable market and rule commitments. The existing state directory, signer, deployment and deadlines were retained. No competing settlement worker or manual settlement transaction was created.

The single worker, read-only gateway, temporary tunnel and loopback website were restarted. The first recovery cycle at 23:57:42 UTC recorded a monitoring failure and blocked transactions; the next at 23:58:47 UTC reported healthy monitoring, clear nonholder preflight and both sources waiting for their windows. Durable cycles and pre-recovery logs were retained. Restarting the website reset its in-memory sign-in session, so the human may need to sign in again for redemption. Later successful settlement would demonstrate recovery and the transaction lifecycle, not erase this interruption.

## Setup interventions

1. Initial helper execution failed on a public RPC connection before deployment simulation. No deployment was inferred from that failure.
2. A dry run exposed the missing Foundry `demo` profile. The helper was fixed, the simulation passed, and simulation-only output was preserved separately after confirming no code at its predicted addresses.
3. The initial 0.05-test-MON bot gas reserve was increased to 1 test MON before deployment, covering multiple bounded actions.
4. The human unlocked the encrypted creator keystore locally and completed deployment. No password was supplied to the agent.
5. The first background worker launch used Windows PowerShell with an incompatible inherited module path and exited before signing. Relaunching with the installed PowerShell 7 succeeded. This happened before either source window.

These are setup interventions. Any later manual proposal, finalization or delivery rescue must be recorded separately and invalidates the unattended settlement claim for this run.

## Acceptance observations and limitations

At 02:14:46 UTC independent verification confirmed event B automatically finalized NO with `timedOut=false`: transaction `0x7d912ce3b3ad15b84517488a109eca8150e9d1e49e7ce86e2f6f7acb1cc3302d`, block 66567972. Automatic delivery followed in transaction `0xae0d88a94eb9275d9cf57bde5813e8be7958d8a459df518d81acca102e53cfdc`, block 66568627, emitting `Delivered` for the exact rehearsal pool with yesMask 0 and voidMask 0. Both resolver cases are finalized NO and `delivered()` is true. Both public evidence hashes still matched and both packets passed verification. Source capture, assertions, normal finalization and delivery therefore completed without manual settlement rescue after the earlier supervised process recovery. This is not a claim of uninterrupted uptime, hosted production reliability or tested dispute handling.

At 02:34:21 UTC, holder reads at block 66572450 confirmed the pool resolved, one A NO share still held, its payout fraction 1/1 and 1.000000 test AUSD redeemable. The human wallet still held its losing A YES share too. Current holder cash was 97.248227 test AUSD, which differs from the original post-trade balance; do not attribute unrelated wallet activity to this rehearsal or use the old balance as a redemption baseline. Save the new pre-redemption reading and verify the actual redemption event and transaction-block collateral change. Holder redemption has not yet occurred in this proof. Browser control failed twice while loading its request-header policy, so the user must open the local portfolio and confirm the redemption in MetaMask. The worker and durable state were left untouched.

At 02:08:08 UTC, independent verification confirmed the worker's automatic event A finalization: transaction `0xe7d5609dff3f3a4a4772ae850bfc5556d8fdfe700244fdfd996dfd93d66c758d`, canonical successful receipt at block 66566171, `Finalized(eventIndex=0, outcome=1, timedOut=false)`. The resolver reports A finalized NO. B remains asserted NO until its 02:10:50 UTC challenge deadline. Delivery remains false, so holder redemption is not available yet. No manual settlement transaction was used.

At 01:11:31 UTC, independent public RPC and HTTPS verification confirmed both automatic NO assertions, canonical successful receipts from the dedicated bot, and both publicly retrievable evidence bodies matching their on-chain hashes. Packet verification reproduced their rule-bound results. Event A assertion: `0xd14d63c45002941f17b61407e24bbcc2f74db298d49b99f41f849f7eb9b197c6`, block 66554269, challenge deadline epoch 1790647252. Event B assertion: `0xca21bfd0487aa6c1bd7b4929f49457b777cba2d748fbf127e90369bd471810ff`, block 66556204, challenge deadline epoch 1790647850. Both cases remained proposed, with no disputer and no final result; delivery was false. The read-only proof is saved under `target/local-settlement-rehearsal/live-source-test/chain-evidence-*.json`.

Event B's first snapshot was generated and retained at epoch 1790643251, within its 00:51 through 00:56 UTC capture window. It contained one event, making the zero-events question NO. Its retained body SHA-256 is `0f52057e01954f07c9068bb336f4bda58c985865c5744144a735d9fbd0c95e43`. The monitor failed chain reads for three cycles starting 00:50:40 UTC, blocking all worker actions including capture during those cycles. It recovered automatically at 00:53:49 UTC, captured B before the cutoff and proceeded with bond approvals and assertions. No restart, manual capture, proposal, finalization or delivery rescue was performed. This exposes a liveness risk: monitoring outages can consume a bounded capture window even when the source is reachable. It remains a production-readiness issue to review, not a reason to bypass transaction safeguards during this run.

At 00:45:58 UTC the existing worker retained event A's first eligible USGS response, generated at 00:45:57 UTC. Independent inspection confirmed 323 complete bytes, matching SHA-256 `7c1736e20807cd4874cf7568f051486b65c1c562bd3ae8e20b03c57f51ee91f5`, with catalogue count zero and zero features. Both timestamps fall within A's immutable capture window. Persistence stores normalized content with `fetchedAt: 0` and reconstructs the capture timestamp from the retained `first`/`last` fields. Under A's at-least-one rule this snapshot supports NO, but no assertion or final result is claimed yet. Event B's window has not opened. Public proposal-packet readback remains a later verification step.

Separate SDK transaction checks completed at 00:09:24 UTC on 29 September. TypeScript, Python, Rust and C++ each bought one distinct claim through their native SDK components using a separate funded trader. Four canonical purchase receipts, all four holdings and aggregate collateral expenditure of 2.000002 test AUSD were independently verified. See `12_LIVE_SDK_TRADE_RESULTS.md` for hashes and coverage limits. These checks neither used the settlement signer nor completed settlement or redemption.

- Verified: both holder test purchases and all four SDK purchases.
- Verified: complete retained responses within both fixed capture windows, hashes and public evidence readback.
- Verified: bot-submitted assertions, challenge deadlines, normal finalization and delivery receipts.
- Verified: separate human redemption receipt, token transfer and historical collateral/holding changes.
- Not established: controlled restart with an outstanding signed transaction. The earlier restart occurred before transaction journals existed.
- Not established: continuous unattended uptime, hosted scheduler reliability, durable public evidence hosting or live dispute resolution. These remain separate release gates.

Unit and integration tests passed, including the final 25-test local rehearsal/storage/UI run and the full 314-test Foundry suite. Those results do not substitute for these live observations. Nothing has been committed or pushed, and no existing production pool, signer or configuration has been modified.
