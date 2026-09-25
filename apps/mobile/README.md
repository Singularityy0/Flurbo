# Flurbo native mobile preview

Expo / React Native, Android first. The Agora brief supplied by the project owner
requires **Mera passkey login, an AUSD balance and at least one Perpl trade**.
Flurbo prediction-pool trades do not substitute for that Perpl requirement.

## Implemented in this slice

- Native Mera 0.2.0 signup and returning login using `react-native-passkey` 3.6.1.
- The website's unchanged BIP-39 / BIP-44 `m/44'/60'/0'/0/0` account derivation and
  `flurbo.singu.online` RP ID. Parity tests compare both implementations.
- SecureStore persists public credential ID, address and RP metadata only.
  Restoring this record displays a saved wallet, not an authenticated backend
  session. PRF entropy and derived key buffers are cleared after derivation;
  the Mera signing session stays in memory and locks on backgrounding or after
  one hour. This is best-effort JavaScript cleanup, not a memory-erasure guarantee.
- Actual AUSD and MON balances read directly on public Monad testnet at a common
  block, including token code, decimals and canonical-block checks. No sample
  balances, no private RPC keys. Requests have deadlines and can be superseded.
- Wallet address copying and test-funding instructions.
- Live Perpl testnet market discovery. Validates chain 10143, the pinned exchange,
  collateral token linkage and six-decimal AUSD before displaying prices.
- Cream, green and lime native screens. Perpl is explicitly a read-only preview.
- Branded launcher icon, Android adaptive/themed icons and a cream splash screen.
  Artwork in `assets/brand` reuses the website's f-and-dot favicon. PNGs are
  bundled into EAS builds; changing native branding requires a new APK.
- Hosted Android `/.well-known/assetlinks.json`, with the public certificate
  extracted from the previous EAS preview APK. See `PASSKEY_SETUP.md`.

## Not complete

This is **not yet the working Agora submission demo**. No Perpl deposit, API key
enrollment, order placement, cancellation, position close or withdrawal is enabled.
No native Flurbo prediction trading is enabled either. No transaction is sent by
this build. The app does not inherit the website's cookie-based login session.
Native passkey PRF, cross-device identity, recovery and this updated app's runtime
behavior still require testing on a physical phone. iOS association/provisioning
is not configured. Browser screenshots or Hermes export do not establish these.

Perpl's documented API enrollment requires origin whitelisting, which the owner
confirmed is **not yet approved**. Request `https://flurbo.singu.online` from
Perpl. The local checklist is in `tmp/FLURBO_MOBILE_PERPL_2026-09-25.md` at the
repository root and is intentionally uncommitted.

## Local checks

Use Node 24.13+; from the repository root in Git Bash:

```bash
cd apps/mobile
npm ci
npm run typecheck
npm test
export FLURBO_PASSKEY_RP_ID=flurbo.singu.online
npm run export:native
```

Tests include derivation parity against the website, so install `apps/web`
dependencies before running tests from a fresh checkout. The EAS build itself
does not include or depend on web source. `.easignore` includes mobile source,
package files, branding PNGs, passkey config and the public network registry only.

## Android preview build

The existing project is `@singuu/flurbo-mobile`, project ID
`f8b90478-5afc-472b-91ca-67e5437e87e8`. Keep its EAS-managed signing key.
This update uses app version 0.2.0 and Android versionCode 3.

First deploy the association endpoint on the website and verify its public JSON.
Then, in Git Bash from `apps/mobile`:

```bash
npx --yes eas-cli@24.7.0 build --platform android --profile preview
```

This uploads the mobile build inputs to EAS and creates an internal APK. Install
the resulting APK on the phone. Expo Go cannot run the required native module.
Never send anyone the keystore, private key, PRF output or recovery phrase.
Generated `android/`, `ios/`, `.expo/`, `dist*` and `.env*` stay uncommitted.

## Physical-device acceptance

1. With association deployed, sign in using an existing compatible web passkey.
   Confirm the full address matches the website before funding.
2. Cancel the passkey prompt; the app must stay usable and not unlock signing.
3. Create a separate disposable account; confirm that it produces a different
   address. Unsupported PRF must show an explicit error, not an empty wallet.
4. Transfer test AUSD and test MON to that address. Refresh and compare both
   balances to the explorer. Zero and unavailable must remain distinct.
5. Background, reopen and restart the app. Wallet metadata may remain visible;
   signing must be locked. Test switching passkeys while reads are in flight.
6. Sign out and restart. The saved account must be absent. Test offline errors.
7. Check Perpl market prices and refresh. Confirm they are labelled mark prices,
   not quotes, and no trading action is implied.

Only after the separate Perpl execution flow is implemented and a confirmed fill
is demonstrated on the phone can the Agora trade requirement be marked complete.

## Browser layout check only

```bash
FLURBO_WEB_PREVIEW=1 EXPO_NO_WEB_SETUP=1 npx expo export --platform web --output-dir dist-web
```

The web adapter deliberately disables account operations. This does not test
native authentication. SDK 57's web prerequisite checks the static `platforms`
array, so this explicit QA-only opt-in skips that check; native profiles remain
Android/iOS only.

## Sources

- [Mera's pinned native recipe](https://github.com/category-labs/mera/blob/a3102f4fa7b89ce4e58e843a2d6da2201035ff25/docs/src/content/docs/recipes/use-mera-with-react-native.md)
- [Perpl API integrations](https://github.com/PerplFoundation/api-docs/blob/main/integrations.md)
- [Agora contract overview](https://docs.agora.finance/contract-overview)
