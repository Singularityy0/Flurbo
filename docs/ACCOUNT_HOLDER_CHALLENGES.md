# Account holder challenges

Status: implemented for a new Monad testnet deployment. Not activated by changing an existing pool's manifest.

## Eligibility

A challenger signs with MetaMask. That wallet and at least one qualifying holder wallet must have verified links to the same signed-in Mera account. Mera is used for authentication, not transaction signing. Either linked wallet can pay the challenge bond, provided the paying wallet signs the challenge and meets the existing reviewer/asserter exclusions.

A positive current holding qualifies when its Boolean payout depends on the disputed base event. Yes, No, dependent AND/OR and other supported Boolean combinations count. Canonical wrapped base shares count at their current token holder. An unrelated event, a truth table that merely includes an unused event in its scope, a zero balance, and wrapper reserve holdings do not qualify. There is no minimum beyond one atomic share unit. Sold or transferred-away holdings do not count. Checking many uncommon combinations may require continuation of the bounded account scan.

The Flurbo API verifies membership from server-side wallet links and reads holdings from the selected pool. It issues an EIP-712 authorization with a random account commitment and nonce, holder, challenger, claim, base event, alternative answer, evidence hash and URI hash. Chain and resolver are included in the signature domain. The server normally issues a 90-second authorization. The contract accepts at most 120 seconds, never beyond the challenge deadline, checks current holdings again, and consumes the nonce on success. Bond approval must be followed by a fresh review and authorization for the actual challenge.

`AccountPilotResolver` has no unrestricted four-argument `dispute` function. Its other lifecycle stages retain the pilot behavior: assertions, challenges, reviewer votes, timeout VOID, finalization, bond credits and delivery to `PilotPool`. Pool pricing, collateral and payout logic are unchanged.

## Existing pools

The existing `PilotResolver` and `PilotPool` are unchanged. Their holders, settlement and redemption stay at their original addresses. The application checks account holdings for old pools too, but an old resolver still accepts its original direct challenge call without this check. The public form explicitly discloses this limitation. Never describe old pools as enforcing holder-only challenges on chain.

## Trust and availability

The authorization service attests account membership. The contract verifies the signature and holdings; it does not verify the Mera login or wallet-link database. A compromised eligibility key can authorize false account associations, although it cannot bypass the live qualifying-share check. A lost key, unavailable server, unavailable link database or RPC failure can prevent legitimate challenges. The signer is immutable for that resolver. Recovery from permanent key loss requires a future deployment, not a silent key change.

Restricting challenges also excludes knowledgeable observers with no position. It does not improve the truth of assertions. A wrong uncontested assertion can still finalize. Keep supervised monitoring and sufficient challenge windows. This mechanism is not a privacy feature: challenge calldata reveals the holder and challenger, and submitted evidence remains public.

## Activation for a future round

1. Create a dedicated eligibility signing key. It must be separate from the deployer, resolution bot and reviewers. Share only its public address. This key signs authorizations off chain and needs no MON or AUSD. Keep the private key out of chat, source control, frontend configuration and build logs.
2. Prepare and review the next round's events and future deadlines using the existing preparation workflow. Keep the saved prepared-file prefix, for example `october-demo` only if that is the separately reviewed round being cloned. This creates a separate deployment, not a migration of existing positions. Do not reuse an elapsed observation window or silently extend a published deadline.
3. From the repository root, run `bun workflows/cre/scripts/prepare-account-pilot.ts <reviewed-prefix> <public-eligibility-signer-address>`. It writes `target/deployments/account-pilot-prepared.json`, commits the holder policy and authority into the new rules, and refuses expired configurations. Review that file before broadcasting.
4. Set `FOUNDRY_PROFILE=demo` and the existing public `FLURBO_DEPLOYER`, then use the existing encrypted deployment account to run `forge script contracts/script/DeployAccountPilot.s.sol:DeployAccountPilot --use target/tools/solc-0.8.28.exe --rpc-url https://testnet-rpc.monad.xyz --account flurbo-testnet --sender "$FLURBO_DEPLOYER" --broadcast --slow`. The deployer needs the usual funding and gas for a separate pool. Do not broadcast until the specific round is approved.
5. Run `bun workflows/cre/scripts/verify-account-pilot.ts`. It verifies compiled runtime, immutable authority, rules, funding, pool binding and fresh deployment state, then writes `target/deployments/account-pilot-testnet.json`.
6. Put the eligibility private key directly into the Render server secret `FLURBO_CHALLENGE_AUTHORIZATION_KEY`. Its derived address must match `challengePolicy.authority`. Retain durable account-link storage. Do not add this key to Expo, Vite or the resolution worker.
7. Add the verified new manifest as an additional collection using the existing collection-bundle procedure. Retain the old collections. Update monitoring and the resolution worker's explicit manifest, pool and rules-hash settings only for the newly approved round. Verify monitoring before relying on automated settlement.
8. Before featuring the new round, exercise a separate-wallet holder challenge on public testnet, an empty account rejection, a related combination, bond approval followed by challenge, confirmation recovery, reviewer finalization, bond withdrawal and holder redemption. Local test results do not replace this public acceptance check.

## Local verification

- Solidity tests cover live and wrapped holdings, irrelevant claims, old-selector rejection, authority/caller/evidence tampering, expiry, chain/domain binding, a viem/Solidity digest vector, and challenge-to-delivery/redemption. The legacy lifecycle suite also runs unchanged.
- API tests exercise real wallet-link signatures, account isolation, zero holdings, failed reads, caller-supplied authorization rejection and internally issued authorization.
- Browser tests cover zero holdings, separate approval and challenge, rejection recovery, reload tracking and a narrow viewport.
- Publication preparation binds the dedicated signer into reviewed rules. These checks are test evidence, not an audit.
