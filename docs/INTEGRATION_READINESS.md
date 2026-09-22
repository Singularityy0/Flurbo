# Integration readiness — 2026-09-21

This checkpoint verifies public infrastructure and the integration paths from
`flurboidea.md` and the supplied resources. It does not establish bounty
completion. No contracts were deployed, faucet used, tokens moved, orders sent,
accounts created, or sponsor messages sent.

## Monad, AUSD and Alchemy

Read-only RPC checks passed against the public endpoints on both networks:

| Network | Chain ID | Observed block | AUSD code bytes / decimals | Kuru Router / Margin code bytes |
|---|---:|---:|---|---|
| Testnet | 10143 | 64424456 | 5937 / 6 | 141 / 141 |
| Mainnet | 143 | 106725469 | 5937 / 6 | 141 / 141 |

Testnet observation: `2026-09-21T10:27:25.873489+00:00`, block hash
`0x8a2552b11dbcb2e050d6ef03225de2ec65b10501e23702eede332730f7d372ef`.
Mainnet observation: `2026-09-21T10:28:28.901958+00:00`, block hash
`0xc57802a095f35c15d2cc021039ca89780ac0e8a7f54195daa8edae18b8bbdd15`.
Each probe pinned contract reads to its block number and rechecked its hash.
These are dated observations, not an availability monitor or freshness guarantee.

The checked addresses are in [the read-only configuration](../config/monad-readiness.json).
[Agora's deployment registry](https://docs.agora.finance/developer/contract-deployments)
lists separate mainnet and testnet AUSD addresses and the testnet faucet. Faucet
code was also present (1200 bytes); mint access and balances remain untested.
The chain IDs match [Monad's chain configuration documentation](https://docs.monad.xyz/developer-essentials/changelog).

Use the actual AUSD address for each chain; do not label `MockCollateral` as AUSD.
Six decimals fit our exact conversion path. Bytecode and decimals alone do not
verify transfer behavior, proxy implementation, pause/freeze status, or suitability
for real funds. The reference pool remains local-test only.

Alchemy's [testnet endpoint page](https://www.alchemy.com/rpc/monad-testnet) and
[mainnet endpoint page](https://www.alchemy.com/rpc/monad) publish both networks.
Its older [quickstart](https://www.alchemy.com/docs/reference/monad-api-quickstart)
still says testnet only; use the network-specific endpoint pages and validate the
actual account endpoint. The checked Alchemy environment variables were unset,
so account-specific connectivity is **pending**, not passed. Do not infer webhook,
bundler, or other product support from base RPC support.

Run from the repository root with Python 3.11+:

```sh
python scripts/test_monad_readiness.py
python scripts/check_monad_readiness.py --network testnet
python scripts/check_monad_readiness.py --network mainnet
python scripts/check_monad_readiness.py --network testnet --provider alchemy
```

For Alchemy, set `FLURBO_ALCHEMY_TESTNET_RPC_URL` or
`FLURBO_ALCHEMY_MAINNET_RPC_URL` in the process environment locally, using the
corresponding dashboard endpoint. Do not paste credentials into chat or commit
them. The probe does not load `.env` files. It never prints endpoint URLs or
remote errors, rejects redirects, and allows only read methods. Exit code 0
means these limited checks passed; 1 means a check or configuration failed.

## Kuru deployment and order path

The [published contracts](https://docs.kuru.io/contracts/Contract-addresses) have
code on both chains. Inspection of
[Router source at 2060bb2](https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/2060bb2736080c175d80d568bfdb6226bb5abd04/contracts/Router.sol)
shows public `deployProxy` with no caller allowlist or owner modifier. This supports
permissionless market creation at the source level. We have not matched that
source to the live proxy implementations or executed a deployment, and exchange
UI listing/access is a separate question still requiring confirmation.

Use the [Router market deployment path](https://docs.kuru.io/sdk/deploy-market)
for two existing ERC-20 assets (`NO_NATIVE`): a backed Flurbo base-event token and
AUSD. Do not use the generic token launcher to create unbacked outcome supply.
Flurbo currently has internal claim balances, so transferable base tokens remain
a prerequisite. Check precision/tick/minimum-size/fees for prices spanning 0–1.

The [order SDK](https://docs.kuru.io/sdk/orderbook-sdk) documents margin deposits,
`GTC.placeLimit`, and `OrderCanceler.cancelOrders`. The upcoming spike must pin an
SDK compatible with the actual deployment, deposit test inventory, place a
post-only order, capture its ID, cancel it, and reconcile balances/events. A fill
requires a separate controlled test. Neither placement nor cancellation happened
in this checkpoint. Funded inventory, signing setup and network choice are still
needed. Keeper profitability must account for executable depth, fees and gas.

The supplied legacy testnet docs URL did not load; current official docs and
the public source were used instead. Kuru's organization also lists a newer
`ts-sdk`, so do not silently assume every published SDK targets the same contracts.

## Expo and Mera

The [Mera repository](https://github.com/category-labs/mera) supports React Native
on iOS 18+ and Android 9+. The inspected
[package at a3102f4](https://github.com/category-labs/mera/blob/a3102f4fa7b89ce4e58e843a2d6da2201035ff25/library/package.json)
is version 0.2.0, with peers `react-native-passkey` 3.6.1 and `viem` ^2.28.0.
This is inspected source metadata, not an installed or tested mobile dependency set.

Its [React Native recipe](https://github.com/category-labs/mera/blob/a3102f4fa7b89ce4e58e843a2d6da2201035ff25/docs/src/content/docs/recipes/use-mera-with-react-native.md)
uses `expo-crypto` for Hermes randomness and native WebAuthn. Use an
[Expo development build](https://docs.expo.dev/develop/development-builds/introduction/)
for native libraries. The Expo/TypeScript scaffold and dependency checks are now
complete; the Android preview now runs on a phone, but authentication remains unverified.
Node 24.13.0 is available locally; `adb`, `java`, and `keytool` were not found on
PATH. This does not prove those tools are absent elsewhere.

The user plans free hosting, potentially with a friend's custom domain. No domain
is chosen yet. Use a stable delegated host for `rpId` and serve the native
association files: Apple `apple-app-site-association` and Android `assetlinks.json`.
Android is the selected test device and its EAS signing setup is complete.
The exact host, Android association fingerprint and any iOS signing/team setup
remain to be verified for passkeys. Do not mint real passkeys against a temporary preview URL.
Hosting choice can wait; control of that host and its association files is required.

Physical-device checks must cover PRF support, account recovery, session expiry,
and an actual signed test transaction. Native passkey support alone is not proof
of PRF compatibility. Domain/account setup and device validation will require
human involvement. Agora/Mera/community bounty details remain pending as agreed.

## Mobile scaffold follow-up

[The Expo client scaffold](../apps/mobile/README.md) now exists with pinned SDK 57
dependencies, an internal development-build profile, Crypto bootstrap, and a
read-only testnet connection action. TypeScript, connection tests, Android project
generation, and Android/iOS Hermes exports pass. Browser layout verification is
recorded separately. The Android APK now launches on the user's phone; Mera
authentication and the remaining domain/device checks above still apply.

The [passkey domain setup](../apps/mobile/PASSKEY_SETUP.md) now supports explicit
host configuration, iOS associated domains and local platform association-file
generation from the configured app IDs. No real host has been supplied and no
association file has been deployed. Android is the selected
first test device, using EAS cloud. APK profiles and the minimal upload inputs are
prepared and locally checked. Expo login, project linking and EAS Android signing
setup are complete. The [first Android preview build](https://expo.dev/accounts/singuu/projects/flurbo-mobile/builds/1e365827-9c5e-4092-a8a2-4569b158a534)
finished successfully and produced an APK. The user's screenshot confirms phone
installation, app launch and a successful Monad testnet connection check. Mera
sign-in, AUSD balances, signed transactions and recovery remain unverified.

## Next small tasks

1. Configure Alchemy locally and rerun the probe against that account endpoint.
2. Configure a stable passkey domain and integrate Mera in the working Android preview.
3. Choose real source-of-record rules and add API retrieval to the
   [synthetic CRE workflow](../workflows/cre/README.md), which now passes CLI
   simulation for unsigned payload preparation. The [authenticated receiver](CRE_RECEIVER.md)
   passes local tests, including generated payloads through multi-owner redemption;
   verified CRE delivery and official source validation remain pending.
4. Add backed base-event tokens, then perform the Kuru deploy/order/cancel spike.

The factored engine, tradable conditionals and every remaining
[partner milestone](INTEGRATIONS.md) stay in scope. This checkpoint does not replace them.
