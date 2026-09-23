# Consumer workspace

Open `http://localhost:18767/account` with `npm --prefix apps/web run dev` running.
Keep the existing local Anvil (18545), dashboard service (18765) and block helper
running as described in [dashboard setup](DASHBOARD_SCREEN.md). The new workspace
uses the consumer site's typography, colours and responsive navigation.

## What is connected

- Explore & trade: one-to-three-event AND, OR and custom Boolean claims, live
  shared-pool quotes, bounded approvals and buy/sell execution.
- Your positions: the selected wallet's AUSD, MON, receipts, Kuru available margin
  and requested claims. This still covers base YES claims plus the current
  composition, not a complete indexed portfolio. A connected extension wallet
  can differ from the Mera account shown in the account header.
- Activity & network: transaction inspection, pool contracts and settlement.
- Expandable receipt conversion and redemption retain the existing reviewed
  wrap/unwrap and settlement flows. Kuru is indicative top-of-book with canonical
  H YES receipts. Kuru order entry is not introduced by this integration.

The same `apps/dashboard` execution engine serves both interfaces. It checks
wallet identity and fork block hash, simulation, gas, allowance, ownership,
slippage, expiry and exact receipt events. A locally stored pending record blocks
duplicate submissions after refresh. UI mounts remove intervals and wallet
listeners on exit; old asynchronous results cannot restore a previous review.

The consumer wrapper uses a shadow root to isolate legacy dashboard styles from
the landing page. It supplies the approved consumer theme and reorganizes the
existing controls. This is a single page using shared code, not an iframe or a
second separately hosted dashboard. No provider is installed on `window.ethereum`.

## Sessions and manual testing

Sign in once again using the passkey you already created. This upgrade introduces
a verified cookie session; old in-memory sessions cannot be migrated automatically.
Refresh should retain account access for seven days. The signing key remains only
in tab memory, lasts one hour, and is cleared on refresh. **Unlock signing** opens
it again without recreating the account. See [Mera authentication](MERA_WEB_AUTH.md).

1. Select **Flurbo passkey (Mera)** as the trading wallet. Use **Set up local
   wallet** to top up this address with local test assets. Previously funded
   MetaMask addresses and Mera addresses are different accounts.
2. Select H YES, buy one unit, get a quote and review. Confirm the exact AUSD
   approval first. Approval does not buy a claim. After confirmation, get a fresh
   quote, review and confirm the buy separately. Mera confirms in this interface;
   an extension wallet opens its own prompt.
3. Check Your positions. Switch to Sell, request a fresh quote, review and confirm.
   Test a composed claim next. Do not repeat trades simply to refresh balances.
4. Refresh during a submitted transaction. The pending record must remain and
   reconcile against the canonical receipt before more submissions are allowed.
5. Sign out and refresh. The login must remain cleared. Cancel a subsequent
   passkey unlock and check that no signing access was opened.

The Mera adapter serializes legacy chain-10143 transactions with reviewed gas and
price bounds, signs through the in-memory SDK session, and broadcasts only through
the local gateway. The gateway checks a valid login, recovered sender, chain,
zero native value, target contract and supported selector. Arbitrary Anvil/admin
RPC methods are rejected. It never derives or receives a private key.

## Validation and deployment boundaries

Run `npm --prefix apps/web test`, `npm --prefix apps/web run build`, and
`node --test apps/dashboard/claims.test.mjs apps/dashboard/wallet.test.mjs apps/dashboard/trading-ui.test.mjs`.
Tests cover real signature recovery, replay/expiry/origin checks, cookie login and
logout, refresh restoration, signing expiry, exact serialized transactions, and
the shared review/confirmation lifecycle. Mock authenticators and RPC transports
do not replace a real device trade test.

`vite.config.mjs` installs the API only on the loopback development server. It
validates the incoming Host and Origin before forwarding a fixed set of requests
to the existing local service. Sessions are process-local and are revoked when
the dev server restarts. Static build preview does not run this backend.

Public hosting needs a backend with durable expiring session storage, Secure
cookies, final-domain origin policy and production deployment configuration.
Never publish this local RPC/funding gateway. Public markets, native Mera,
conditional securities and the separate learning lab remain separate work.
