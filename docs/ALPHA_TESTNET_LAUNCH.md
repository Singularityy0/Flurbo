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
The public Monad deployment simulation succeeded on September 24. It funded
13.862944 test AUSD and estimated 2.383619707011741969 MON in network fees.
Foundry labels the native fee as ETH generically; this simulation uses chain
10143 and its native MON. Recheck fees and funds at broadcast time.
Simulation addresses and the unverified manifest are not public deployments.

## Deployment command (Git Bash)

After committing the reviewed files and checking the release targets again:

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

1. Freeze approved operator configuration, commit/push, deploy and verify the
   new pool/resolver. Keep existing manifests and markets intact.
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

No code has been committed or pushed by the agent. No pilot contracts were
broadcast during preparation. The already supplied three reviewer addresses
do not require any new private-key disclosure.
