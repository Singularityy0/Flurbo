# October practice collection

Prepared September 25, 2026. This is a separate four-event scripted Monad testnet pool, using the existing `PilotPool` and `PilotResolver`. It changes no pricing, collateral or settlement implementation. Test AUSD only; the same operator controls all three test reviewer wallets.

| Milestone | UTC, October 14 | IST, October 14 |
| --- | --- | --- |
| Trading closes | 12:00 | 17:30 |
| Assertions open | 12:02 | 17:32 |
| Assertion deadline | 13:02 | 18:32 |

Challenge and voting periods are each one hour **from their respective actions**, not fixed wall-clock times. The assertion/challenge bond is 1 test AUSD. Scripted outcomes remain A YES, B NO after a deliberately challenged YES assertion, C VOID after no assertion, D YES. Finalization, delivery and redemption still require transactions. A wrong uncontested assertion can finalize.

## Deploy separately

Run in Git Bash from the repository root after committing this rollout's code. Keep your keystore password on your device.

```bash
cd ~/Flurbo
export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
bun workflows/cre/scripts/prepare-october-demo.ts
```

Review `target/deployments/october-demo-prepared.json`. The creator needs at least 27.725888 test AUSD for the initial pool funding, plus test MON for gas. Deploy before October 14 at 11:00 UTC, because the deployment requires over one hour before close. The configuration must also be within 30 days of close.

```bash
if [ -f target/deployments/october-demo-unverified.json ]; then
  echo "An October deployment record already exists. Verify it before deploying again."
else
  forge script contracts/script/DeployOctoberDemo.s.sol:DeployOctoberDemo \
    --use target/tools/solc-0.8.28.exe \
    --rpc-url https://testnet-rpc.monad.xyz \
    --account flurbo-testnet \
    --sender "$FLURBO_DEPLOYER" \
    --broadcast --slow
fi
bun workflows/cre/scripts/verify-pilot.ts --october-demo
```

If broadcast is interrupted, inspect its receipts before running another deployment. Only the verifier's successful output and `october-demo-testnet.json` establish the checked deployment snapshot. No October address is assumed in source control.

## Register, monitor, then feature

Create the public hosting configuration from the verified manifest:

```bash
bun -e 'const m=await Bun.file("target/deployments/october-demo-testnet.json").json(); if(m.status!=="verified_pilot_snapshot"||m.publication.mode!=="rehearsal")throw Error("Verify the October deployment first"); await Bun.write("target/deployments/october-demo-collections.json",JSON.stringify([{label:"October practice",manifest:m}])); console.log("October pool:",m.pool);'
```

1. Set `FLURBO_PRACTICE_COLLECTIONS_JSON` to that file's complete JSON in **both Render and GitHub Actions repository secrets**. If additional collections already exist, preserve those entries and append this one. Every entry has `label` and `manifest`; duplicate addresses are rejected.
2. Leave `FLURBO_REHEARSAL_MANIFEST_JSON` set to the original September pool. Never replace it with October. The web server rejects rebinding the old alias, so old APKs, saved transactions and checkout drafts cannot silently switch pools. The original public manifest is also preserved in `config/practice-rehearsal.json`.
3. Redeploy the web service, leaving `FLURBO_PRACTICE_ACTIVE_POOL` unset for now. Check both collections in Portfolio and History. Each collection's settlement link must use its own pool. Verify existing September holdings and pending transaction tracking before proceeding.
4. Run the existing **Settlement monitor** GitHub workflow with its labelled delivery test enabled. Confirm three pool observations: original September practice, real-event pilot, and the new October pool. Confirm the October message reaches the inbox, its address/deadlines are correct, and subsequent scheduled runs succeed with the delivery-test option off. Check Healthchecks independently. Free scheduling can be delayed and is suitable only for supervised testnet use.
5. Set Render's `FLURBO_PRACTICE_ACTIVE_POOL` to the lowercase October pool address and redeploy. This changes the web Markets collection. Monitor selection is independent and must continue covering all pools.
6. Test a small purchase, combined position, reload during confirmation, What-if comparison, Portfolio and History. Check the wallet receipt and actual pool address. September holdings must remain available after selecting September practice. Keep settlement supervision through the final redemption exercise.

Rollback the featured choice by removing `FLURBO_PRACTICE_ACTIVE_POOL` or setting it to the September address. **Keep all registered manifests and monitor entries** while users have positions or pending resolution actions. Changing the featured collection never transfers balances or cancels deadlines.

## Routing and scope

- `/api/rehearsal/*` permanently means September practice at `0xf632cbf09aaa8c22821e38c930695463781c5284`.
- New collections use `/api/practice-<pool-address-without-0x>/*`. Their saved checkout drafts and pending confirmations use the same namespace.
- `/api/practice-collections` returns the authenticated public catalog. Unknown collections fail; they do not fall back to a different pool.
- Portfolio and History allow selecting registered collections. `/rehearsal?collection=<namespace>` opens that collection's existing settlement and redemption tools.
- The current native APK continues using the original September alias. This rollout does not add an October selector to native screens or claim native parity for the new collection.
- No service or contract was deployed by preparing these files. Configuration is not evidence of live monitoring or successful settlement.
