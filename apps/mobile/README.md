# Flurbo native mobile preview

Expo / React Native, Android first. The Agora brief supplied by the project owner
requires **Mera passkey login, an AUSD balance and at least one Perpl trade**.
Flurbo prediction-pool trades do not substitute for that Perpl requirement.

## Native screens and shared execution

- Native Mera 0.2.0 signup and returning login using `react-native-passkey` 3.6.1.
- The website's unchanged BIP-39 / BIP-44 `m/44'/60'/0'/0/0` account derivation and
  `flurbo.singu.online` RP ID. Parity tests compare both implementations.
- Native sign-in uses the website's challenge/signature/session transport. The
  platform cookie jar holds the server session; AsyncStorage holds public
  credential metadata and pending transaction records, never signing material.
  Old SecureStore bookmarks migrate without changing identity. Restoring a
  bookmark alone cannot authenticate a backend session. PRF and derived key
  buffers are cleared best-effort; the signing session ends immediately after login.
- Native practice/release market screens, individual and combined AND/OR trades
  of up to three events, sells, redemption, market rules and exact review amounts.
  Quotes load after selection. AUSD approval remains a separate transaction.
- Native What-if: marginals, conditional probabilities and joint-versus-independent
  comparison at one snapshot. No conditional trading or causal/accuracy claims.
- Native portfolio and history with full question names and separate answer labels.
  Direct share reads do not wait for history scans; wallet switching cancels old
  reads. History advances on request rather than endlessly blocking the interface.
- MetaMask trading through WalletConnect SignClient and the owner's public Reown
  project ID. MetaMask is the only transaction wallet; Mera is account-only. Requests are pinned to
  Monad testnet and the selected session account. No arbitrary message signing.
- Funding, reviewed AUSD withdrawal, original/learning pool trades and portfolio,
  H Yes receipt wrapping/unwrapping, Kuru deposits/withdrawals/orders/cancellation,
  learning proposals and research comparison, transaction lookup, and native
  assertion/challenge/vote/finalization/delivery/bond-credit controls.
- `More` contains experimental/operator features; server and contract roles still
  apply. No resolver, pricing or collateral behavior was changed.
- Shared web validators verify transactions; native adapters await durable pending
  writes before signing. Unknown outcomes keep tracking open. Confirmations check
  exact calldata, sender, nonce and canonical receipts. Read polling is bounded;
  no transaction is automatically retried. The public tracking record survives
  navigation and process restart, including a missing-hash recovery path.
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
The native implementation can request Flurbo transactions after explicit review,
but its end-to-end behavior must be accepted on a physical Android phone. In
particular, Google Password Manager PRF, the installed APK certificate, native
cookie persistence, MetaMask handoff and confirmed trades need device verification.
The app establishes its own login session; it does not copy the browser's cookies.
iOS association/provisioning is not configured. Hermes export is not device evidence.

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
dependencies before running tests from a fresh checkout. The EAS archive includes
a narrow allowlist of shared web transaction validators and pure dashboard helpers.
Metro resolves their packages from the native dependency graph, preserving nested
dependency versions. No web server entry point, secrets or planning docs are sent.

## Android preview build

The existing project is `@singuu/flurbo-mobile`, project ID
`f8b90478-5afc-472b-91ca-67e5437e87e8`. Keep its EAS-managed signing key.
This update uses app version 0.3.0 and Android versionCode 4.

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
5. Background, reopen and restart the app. Restore the server login but keep
   no Mera transaction signer. Sign out and restart; authentication must remain cleared.
6. Connect MetaMask on chain 10143, switch accounts/network, then reconnect.
   Mera login must not change. A review for the old trading account must not send.
7. Buy a small single claim and an AND claim. Complete allowance and buy separately.
   Verify both holdings on chain. Kill/reopen while confirmation is pending. Never
   require buying twice to show shares. A rejected prompt must not imply a trade.
8. Switch viewed wallets during a slow history read. The old response must not
   overwrite the new wallet. Test offline/unavailable separately from zero holdings.
9. Exercise What-if, sell/redeem where eligible, and the existing supervised
   settlement rehearsal with disposable test wallets. Deadlines and roles still apply.
10. Test Kuru deposit/order/cancel/withdraw and learning update with authorized wallets,
    checking exact receipts and balances. Do not treat a successful bundle as proof.
11. Check Perpl market prices and refresh. Confirm they are labelled mark prices,
   not quotes, and no trading action is implied.

Only after the separate Perpl execution flow is implemented and a confirmed fill
is demonstrated on the phone can the Agora trade requirement be marked complete.

## Browser layout check only

```bash
FLURBO_WEB_PREVIEW=1 EXPO_NO_WEB_SETUP=1 npx expo export --platform web --output-dir dist-web
```

Browser exports are not a supported app target. The native account gate refuses
browser sign-in, and native storage or wallet modules may be unavailable there.
Use a physical Android preview build for runtime acceptance; native profiles
remain Android/iOS only.

## Current Android candidate

EAS build `317d7f66-161d-4db2-8282-96d3a9f73b4d` contains this native expansion
(0.3.0 / versionCode 4) and finished successfully. Its extracted public signing
certificate matches the hosted fingerprint. Device acceptance is not complete:
the first phone test reported `DOMAIN_ASSOCIATION`. The server was missing the
`handle_all_urls` relation required for Android passkeys. Deploy the correction
described in `PASSKEY_SETUP.md`, then retry the existing APK and passkey.

## Sources

- [Mera's pinned native recipe](https://github.com/category-labs/mera/blob/a3102f4fa7b89ce4e58e843a2d6da2201035ff25/docs/src/content/docs/recipes/use-mera-with-react-native.md)
- [Perpl API integrations](https://github.com/PerplFoundation/api-docs/blob/main/integrations.md)
- [Agora contract overview](https://docs.agora.finance/contract-overview)
