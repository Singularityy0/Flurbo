# Consumer workspace

Current public deployment: `/account` provides trading and network tools;
[`/portfolio` and `/history`](PORTFOLIO_HISTORY.md) provide separate authenticated
holdings and activity pages. The local scaffold description below is historical;
the new portfolio replaces the requested-claims consumer tab. Public deployment
status is tracked in [the rollout](DEPLOYMENT_ROLLOUT.md).

Open `http://localhost:18767/account` with `npm --prefix apps/web run dev` running.
Keep the existing local Anvil (18545), dashboard service (18765) and block helper
running as described in [dashboard setup](DASHBOARD_SCREEN.md). The new workspace
uses the consumer site's typography, colours and responsive navigation.

`/account` requires a verified, unexpired login. Direct visits wait for server
session restoration before mounting the market; signed-out visitors go to
`/login`, which also links to signup. Sign-out and login expiry remove the
workspace and redirect to sign-in. Signing-key expiry alone keeps account access.
This route guard does not change the separate dashboard's public on-chain read API.

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
Refresh retains account access for seven days. Mera signs only the login proof;
its signing session ends immediately afterward. MetaMask is the only transaction
wallet offered by the web and native apps. See [Mera authentication](MERA_WEB_AUTH.md).

1. Sign in with Mera, then connect MetaMask on Monad testnet. Fund the MetaMask
   address with test MON and test AUSD; do not fund the Mera account for trading.
2. Select a prediction and amount. Confirm any required AUSD approval in MetaMask,
   then confirm the purchase. Approval alone does not buy shares.
3. Check Portfolio for the selected MetaMask address. Earlier holdings at other
   addresses remain available through the read-only address lookup.
4. Reload during a pending transaction. Its saved record must remain and reconcile
   against a canonical receipt before another submission is allowed.
5. Reject a wallet prompt, change MetaMask accounts or networks, and sign out.
   Old reviews must not submit after their account or network context changes.

The old Mera adapters are read-only compatibility paths; signing and raw transaction
relay endpoints are disabled. MetaMask submits directly through its wallet provider.
Wallet-brand detection is an application policy, not cryptographic attestation;
public contracts remain callable outside the Flurbo interface.

## Validation and deployment boundaries

Run `npm --prefix apps/web test`, `npm --prefix apps/web run build`, and
`node --test apps/dashboard/claims.test.mjs apps/dashboard/wallet.test.mjs apps/dashboard/trading-ui.test.mjs`.
Tests cover real signature recovery, replay/expiry/origin checks, cookie login and
logout, refresh restoration, rejection of Mera signing, and
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
