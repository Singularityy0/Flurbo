# Synthetic learning pool deployment

This deploys a separately identified `FundedFactoredPool` on public Monad testnet.
The current ordinary pool, Kuru pair and user positions remain in place. Do not
replace Render's `FLURBO_MANIFEST_JSON` with this deployment's output. The hosted
Rust comparison is already ready; hosted proposals and new-pool navigation are
the next release slice.

## Exact configuration to review before signing

| Setting | Value |
|---|---|
| Network | Public Monad testnet, chain 10143 |
| Deployer, immutable updater and resolver | `0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391` |
| Collateral | Test AUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, 6 decimals |
| Market | Eight binary synthetic events, ascending elimination order |
| LMSR liquidity parameter | 10 AUSD |
| Initial subsidy transferred to the pool | 55.451775 test AUSD |
| Required deployer balance before deployment | At least 65.451775 test AUSD, leaving 10 in its wallet |
| Maximum bias movement per update | 2 AUSD in cost-function bias units, not a probability change |
| Maximum added funding per fixed epoch | 10 test AUSD |
| Epoch length / minimum update interval | 3,600 seconds / 60 seconds |
| Close | Seven days after the timestamp set in the command below |
| Settlement | Immutable deployer resolves synthetic bit outcomes once after close |

The hourly cap is aligned to `floor(block.timestamp / 3600)`, not a rolling hour
or a lifetime spending budget. Each update still needs a reviewed deadline,
revision and maximum funding, plus an explicit updater signature and AUSD
approval. Deployment does not submit an update or install a signing service.
The 10 AUSD left in the wallet is not approved to the pool by this script.

The initial subsidy is pool collateral, not a trader balance. There is no general
LP subsidy withdrawal function. This experiment uses synthetic outcomes and test
assets; it does not establish statistical loss guarantees or real-asset readiness.

The script creates the pool and its constructor-created pricing engine and base
token factory, approves exactly 55.451775 test AUSD, funds the pool, then resets
allowance to zero. There are four outer transactions. No receipt, Kuru market or
arbitrage inventory is created for this new pool.

## Local and public simulation evidence

On 2026-09-24, the public RPC dry run passed with the intended deployer and its
actual testnet balances. Foundry estimated 10,754,209 gas and about 2.183105 test
MON at its estimated fee. Foundry labels native fees as ETH in this output; on
chain 10143 the asset is MON. Gas estimates and balances can change.

The eight-event contract rehearsal covers deployment funding, zero allowance,
buying A AND B, a separately funded pairwise bias update, unchanged holdings and
selling the claim back with collateral coverage intact. The existing funded-pool
suite also checks updater authorization, stale revisions, domain binding,
cooldown, epoch caps, factor-width limits and adversarial collateral behavior.

The read-only acceptance verifier was exercised against actual compiled runtime
on an owned disposable Anvil instance. It rejected the unfunded pool and accepted
the funded initial state. This is local verification evidence, not a public
deployment. Unit tests reject altered policies, authority, token, code, helper
addresses, inconsistent immutable copies, missing funds, approvals, stale blocks
and reorgs.

## Sign the deployment in Git Bash

Run from the reviewed source version after its checks pass. Keep the encrypted
Foundry account and its password on your device. The assistant does not sign.

```bash
cd ~/Flurbo
export PATH="$HOME/.foundry/bin:$PATH"
export FOUNDRY_PROFILE=demo
export FLURBO_DEPLOYER=0xF1feA08EbBa92eD342Acc5639dB312C3694Bc391
export FLURBO_LEARNING_CLOSES_AT=$(( $(date +%s) + 7 * 86400 ))

forge script contracts/script/DeployLearning.s.sol:DeployLearning \
  --use target/tools/solc-0.8.28.exe \
  --rpc-url https://testnet-rpc.monad.xyz \
  --account flurbo-testnet \
  --sender "$FLURBO_DEPLOYER" \
  --broadcast --slow
```

For another read-only simulation, omit `--account flurbo-testnet` and
`--broadcast`. A dry run also writes `target/deployments/learning-unverified.json`;
the file alone is never proof of deployment. After a successful broadcast, keep
that file and `target/broadcast/DeployLearning.s.sol/10143/run-latest.json`. Do not
rerun the deployment or a new dry run after success: it would target a new pool
and could overwrite the manifest. If any transaction fails, stop and inspect the
receipt sequence before choosing a resume procedure.

## Verify after successful broadcast

The following commands read public chain state and never sign or send transactions:

```bash
forge build --use target/tools/solc-0.8.28.exe --offline
python scripts/verify_learning_deployment.py
```

If Git Bash cannot find Python, use the installed runtime:

```bash
"$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" scripts/verify_learning_deployment.py
```

`--provider alchemy` may be used with the existing local
`FLURBO_ALCHEMY_TESTNET_RPC_URL` environment variable. The verifier accepts only
the reviewed public providers, not a local RPC URL.

Success writes `target/deployments/learning-testnet.json` with status
`verified_learning_snapshot`. Failure replaces any prior output with `blocked`.
It checks the three runtimes against local compiler artifacts including metadata,
checks all repeated immutable values for consistency and their 15 public getters
against the reviewed plan, and checks initial funding, empty positions/bias,
revision zero and zero deployer allowance. Stateless helper bytecode must match
exactly. All chain reads use one block; the final block hash must still match.
AUSD is the canonical external proxy and is checked for code and decimals, not
source equivalence to a local token implementation.

This is a fresh-deployment acceptance check. Run it before any trades or updates.
It is not a general ongoing health check, source verification on an explorer or
a security audit. A later trade makes the initial-state check fail by design.
Keep the source version and compiler artifacts used for this deployment.

## Next release gate

After public verification, prepare a separate hosted learning-market configuration,
an operator-only proposal review and navigation that retains the original market.
Verify Rust model provenance, pinned snapshots, quantized bias tables, revision,
funding and price changes before signing an update. Synthetic observations must
remain labelled synthetic. No deployment manifest alone turns on live learning.

## Regression commands

```bash
forge test --use target/tools/solc-0.8.28.exe --offline --match-contract 'DeployLearningTest|FundedFactoredPoolTest'
python -m unittest discover -s scripts -p test_learning_deployment.py -v
```
