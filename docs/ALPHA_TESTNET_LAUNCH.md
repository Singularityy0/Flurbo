# Operator-run alpha: five-day release plan

Approved by the user on September 24, 2026. Target launch: September 29, 2026.
This is a delivery target, not evidence that the alpha is live or a scheduled
background job. Original synthetic and learning markets remain separate.

## Approved configuration

The machine-readable selection is `config/pilot-alpha-selection.json`.

| Role | Public address |
| --- | --- |
| Creator and operator | `0xf1fea08ebba92ed342acc5639db312c3694bc391` |
| Operator test reviewer 1 | `0x1fc63b1f8e89473b7bea3b44fc4936b8d9416201` |
| Operator test reviewer 2 | `0x41c28b86170b5ec7b261d954e0185fca348b19a4` |
| Operator test reviewer 3 | `0x555d165001f60103c9429dbb15bf764caa8ae538` |

All reviewer wallets belong to the same operator. Two matching votes enforce
the contract workflow, but do not provide independent dispute adjudication.
This disclosure is bound into the draft hash and on-chain resolver rules hash.
The app displays it in Real events, Portfolio and History. Distinct addresses
remain required. Registered reviewer addresses cannot themselves assert or
challenge; use another test wallet for those actions. Reviewer wallets need
test MON for voting, not an AUSD voting bond.

Approved questions:

1. Will `ethereum/go-ethereum` publish stable `v1.17.7` during the observation window?
2. Will `paradigmxyz/reth` publish stable `v2.6.1` during the observation window?

Official sources are the [Geth release records](https://github.com/ethereum/go-ethereum/releases)
and [Reth release records](https://github.com/paradigmxyz/reth/releases). The
reviewed lists on September 24 showed v1.17.6 and v2.6.0 respectively. The chosen
versions are proposed future targets, not announced schedules or guarantees.
Recheck before broadcasting; a 404 or request failure is never proof of NO.
An early publication outside the window can make the question unhelpful, so do
not launch an already-known or ambiguous market merely because the code accepts it.

| Milestone | UTC | India time |
| --- | --- | --- |
| Launch target | September 29 | September 29 |
| Trading closes | September 30, 00:00 | September 30, 05:30 |
| Observation begins (inclusive) | September 30, 00:01 | September 30, 05:31 |
| Observation ends (exclusive) | October 7, 00:01 | October 7, 05:31 |

Each assertion/challenge bond is 1 test AUSD. Assertion, challenge and vote
windows are 24 hours each. These are separate stages, not a single 24-hour
settlement deadline. Missing assertions and unresolved disputes become VOID.
The [uniform-void payout rules](PILOT_TESTNET_DEPLOYMENT.md#void-payouts) apply.
Live trading can start by the launch target; these real events settle later.
Public lifecycle acceptance therefore uses a separately labelled rehearsal,
not fabricated early results in this actual market.

## Preparation completed

The selected addresses are distinct and pass publication validation.
`rulesReviewed` is true following the user's approval; the independence
declaration is false. Existing independent-panel configurations remain valid.

Generated ignored artifacts:

- `target/deployments/pilot-publication.json`
- `target/deployments/pilot-prepared.json`

The approved configuration hash is
`0x5b2db8b62a1c98d28d6839862869854591893ef97d7cec90c4f86b73aea38f30`.
The user broadcast the deployment on September 24 and verified it at block
65353564. The durable public manifest is `config/pilot-testnet.json`, copied
exactly from the verified artifact, including its original index anchor.

| Contract | Monad testnet address |
| --- | --- |
| PilotPool | `0x28d5ee02b1eda6959ac3ee5a4f834237c84dee02` |
| PilotResolver | `0xe72386686b03d7e04554505ea0ef00ffa04ec73e` |

The deployment cost reported by Foundry was 1.41252346001371382 MON. Its generic
ETH fee label means MON on chain 10143. A fresh read at block 65354722 confirmed
13.862944 test AUSD in the pool, zero outstanding liability and no resolution.
The hosted service's read-only preparation of a one-share A AND B buy succeeded,
returning an approval review capped at 0.260829 test AUSD with 0.5% slippage.
No approval or trade was submitted by this check.

At 17:35 UTC on September 24, direct requests to both exact official GitHub
release endpoints returned 404. The source adapter classified both as
`needs-review`, never NO. This direct source check is not a CRE runtime result.
Two attempts to start the live CRE simulation failed during credential refresh
with HTTP 500 from the authentication service, before workflow execution.
Live CRE simulation and authenticated delivery remain pending.

## Next: enable hosted operator testing

Do not deploy these contracts again. The application now loads the checked-in
`config/pilot-testnet.json` by default after push and Render rollout. An existing
`FLURBO_PILOT_MANIFEST_JSON` remains an explicit override; remove it if empty or
stale. Keep original/learning manifests, RPC and Redis settings. No signing keys
belong in these variables. `FLURBO_PILOT_DISABLED=true` disables hosted pilot
actions without cancelling contracts or their deadlines.

For the separate public scripted rehearsal, use `FLURBO_REHEARSAL_MANIFEST_JSON`
and `/rehearsal`. Never replace the real pilot manifest. See
[the complete mock-testing handoff](MOCK_TESTING.md) for deployment commands,
shorter rehearsal deadlines, wallet roles and the acceptance checklist.

After Render is live, sign in at `https://flurbo.singu.online/events`. Check both
release questions, September 30 trading close, October 7 observation end and
the operator-controlled reviewer disclosure. Select the funded trading wallet,
review a small buy, confirm any exact allowance approval, then review and
confirm the buy separately. Verify the same wallet and pilot market in
`/portfolio` and `/history`. Do not repeat a transaction just because history
is still catching up; use the pending receipt check.

This enables operator acceptance testing. It does not establish completion of
the Kuru, CRE or public lifecycle gates below. Assertions on this actual cluster
are unavailable until its observation window ends; use a separate rehearsal
for early lifecycle tests. Keep the initial verified manifest anchor unchanged.

## Original deployment command (reference only)

Already completed for the addresses above. Do not rerun for hosted activation:

```bash
cd ~/Flurbo
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
bun workflows/cre/scripts/create-pilot-publication.ts config/pilot-alpha-selection.json > target/deployments/pilot-publication.json
bun workflows/cre/scripts/prepare-pilot.ts target/deployments/pilot-publication.json > target/deployments/pilot-prepared.json
forge script contracts/script/DeployPilot.s.sol:DeployPilot --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow
bun workflows/cre/scripts/verify-pilot.ts
```

Stop if any command fails. Enter the keystore password locally only. Never
blindly restart a partly broadcast deployment. Verify before trading or Kuru
seeding because the verifier expects a freshly funded pool with no positions.

## Work through the five-day target

1. Completed: approved operator configuration and public pool/resolver deployment
   verified. Enable the saved manifest on Render for operator acceptance.
2. Finish verification and hosted routing for the new Kuru receipt pairs. The
   original H YES pair is not a replacement for these pairs.
3. Run the live CRE observation workflow against the verified pilot, preserve
   evidence and finish the planned delivery integration. Do not claim a
   manually pasted attachment is authenticated automatic delivery.
4. Exercise Mera and Firefox/MetaMask trading, assertions, challenges, all three
   reviewer accounts, timeout/void, redemption and restart recovery in a
   separate public rehearsal with recorded transaction hashes.
5. Verify the hosted manifest, real event wording, funding instructions,
   operator disclosure and monitoring. Invite users only after the selected
   alpha scope passes. If a required integration is unfinished, report that
   explicitly and revise the release target or scope with the user.

The user performed the public deployment and commits. The agent's post-deploy
checks were read-only. The already supplied three reviewer addresses do not
require any new private-key disclosure.
