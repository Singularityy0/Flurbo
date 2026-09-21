# Flurbo mobile preview

Expo / React Native / TypeScript foundation for the native Flurbo client. This
slice displays an unconnected account and a working, explicitly requested Monad
testnet connection check. There are no sample balances, live pool quotes, or
transactions. Passkey sign-in is disabled until the account integration exists.

## Run locally

Use Node 24+ and npm. From the repository root:

```sh
cd apps/mobile
npm ci
npm run typecheck
npm test
npm run export:native
```

`npm run export:native` generates Android and iOS Hermes bundles in `dist/` by
default. This checks JavaScript/bytecode generation, not compilation or execution
of an APK/IPA. Root Solidity/Rust builds remain independent of this npm package.

For an Android development build, install the Android SDK/JDK toolchain and
configure an emulator or connected device, then run `npm run android`. For iOS,
use `npm run ios` on a Mac with Xcode. After installing a development client,
`npm start` runs Metro for it. See Expo's
[development build setup](https://docs.expo.dev/develop/development-builds/introduction/).
`eas.json` also declares an internal development build profile, but no EAS project,
account, signing credentials, or cloud build has been configured or created.

Generated `android/`, `ios/`, `.expo/`, `dist*`, credentials and `.env*` files are
ignored locally. Change app configuration/plugins and regenerate native projects;
do not rely on untracked native edits. `dev.flurbo.preview` is a development-only
application identifier, not a registered production identity.

## Network and account boundaries

`src/config.ts` imports the testnet entry from the repository's reviewed
`config/monad-readiness.json`; Metro watches that shared config directory. There
is no mainnet switch, pool address, private key, RPC credential or account storage.
Do not put Alchemy secrets in an app bundle or `EXPO_PUBLIC_*` variables.

The connection check performs only `eth_chainId` and `eth_blockNumber`. It verifies
the configured chain before reading the block, rejects malformed/error responses,
and uses a ten-second abort timeout. It displays a timestamped observation, not
a continuously monitored network status. A successful read does not validate
AUSD transfers, account funding, a pool deployment, or the complete trading path.

`src/polyfills.ts` loads Expo Crypto randomness before the app entry point, ready
for Hermes consumers. Mera is **not installed or integrated in this slice**. Its
native WebAuthn client and peer packages belong in the next account slice after
we configure and test the native build. The [Mera recipe](https://github.com/category-labs/mera/blob/a3102f4fa7b89ce4e58e843a2d6da2201035ff25/docs/src/content/docs/recipes/use-mera-with-react-native.md)
describes the crypto and platform association requirements.

The user's plan is free hosting with a possible delegated host on a friend's
domain. Choose the actual stable `rpId`, app identifiers, association files and
test device before creating real passkeys. There is no temporary domain default.

The [passkey setup guide](PASSKEY_SETUP.md) provides validated host configuration
and local generation of Android/iOS association files once real signing details
are available. This preparation does not enable authentication.

## Optional browser layout check

Browser dependencies are development-only. Enable browser rendering explicitly
from `apps/mobile` in PowerShell:

```powershell
$env:FLURBO_WEB_PREVIEW = '1'
npm exec -- expo start --offline --port 8081
```

Open `http://localhost:8081/?platform=web`. Unset the flag afterwards with
`Remove-Item Env:FLURBO_WEB_PREVIEW` to return to native-only exports. This preview
renders the same React Native screen; it does not validate native modules,
biometric prompts, PRF support, safe-area behavior on hardware, or mobile signing.

## Verification recorded for this slice

- TypeScript strict checking and four offline connection tests pass.
- Expo dependency compatibility check passes after applying its recommended patches.
- Android project generation with `prebuild --no-install --platform android` passes.
- Android and iOS Hermes bundle exports pass.
- Browser checks at 320 and 390 pixels show no horizontal overflow. The connection
  action passed against public Monad testnet (observed block 64,434,136); sign-in
  remained disabled, and no browser console errors were observed.

No APK/IPA was compiled or installed. Android SDK/JDK tools were not found in the
checked local paths, and the target phone is still unspecified. Physical-device
verification and Mera authentication remain required. No deployment, passkey,
wallet, token approval, or transaction was created.
