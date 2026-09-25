# Mera web account access

Hosted deployment now has a standalone server and external Redis sessions.
Mera passkey signup and login are required. MetaMask connects only after
login for transactions; it does not authenticate a
Flurbo account. Previously issued wallet-login sessions are rejected.
See [the public testnet deployment guide](PUBLIC_TESTNET_DEPLOYMENT.md) for the
current hosting path; loopback setup below remains the development workflow.

The consumer website uses `@category-labs/mera` 0.2.0 for real passkey creation
and sign-in. The user has verified the basic passkey flow on their device.
A server-verified account session now persists across refresh, and the account
workspace connects to local MVP trading. Native Expo authentication is still
separate work. See [the workspace guide](CONSUMER_WORKSPACE.md).

## Stable account identity

- Production origin: `https://flurbo.singu.online`, RP ID `flurbo.singu.online`.
- Development only: `http://localhost:18767`, RP ID `localhost`. Numeric loopback
  URLs offer a link to localhost. Preview deployments and other domains cannot
  create accounts. The production build does not enable localhost authentication.
- Local and production passkeys are separate. A local account cannot be migrated
  by moving browser storage. Do not fund local accounts with real assets.
- Mera's default PRF salt for this SDK version feeds 32-byte entropy into BIP-39
  with the English wordlist and an empty mnemonic passphrase. BIP-32/BIP-44 path
  `m/44'/60'/0'/0/0` derives the EVM key. These choices are part of identity:
  changing the salt, derivation or credential changes the account address.
- Future native integration must preserve the same RP, credential, PRF salt and
  derivation to recover the same account. Domain association alone is insufficient.
- Creation requires a discoverable credential and user verification. Some
  authenticators require a second confirmation to return PRF output. Failure at
  that stage can leave a saved passkey; try sign-in before creating another.

The implementation follows the upstream
[Mera passkey account recipe](https://github.com/category-labs/mera/blob/a3102f4fa7b89ce4e58e843a2d6da2201035ff25/docs/src/content/docs/recipes/create-passkey-accounts.mdx).
Device compatibility must be checked against Mera's
[authenticator support matrix](https://mera.category.xyz/authenticator-support/).
WebAuthn availability alone does not establish PRF support.

## Session and storage boundaries

Account login lasts seven days in an HttpOnly, SameSite=Strict cookie. A one-use,
five-minute, origin-bound server challenge is signed with the derived Mera account
and verified before issuing an opaque session token. The server stores only token
hashes and public session details. Reload restores the account through the server;
public browser metadata alone never establishes login. Sign-out revokes the token.
The development server keeps sessions in memory, so restarting it revokes logins.
The hosted server uses Upstash Redis with expiring hashed tokens and atomic
one-use challenges. Its cookies also require Secure transport.

The derived key signs only the login challenge. Its SDK session ends immediately
after successful authentication. The public signing method and legacy Mera
transaction adapters reject transaction requests, and the server does not relay
raw transactions. MetaMask confirms and submits all trading actions. Reload keeps
account access without requiring another passkey prompt to trade.

Local storage contains only a version, RP ID, credential ID and public address,
under `flurbo.passkey.v1:<rpId>`. These are remembered account hints, not proof of
authentication. Login derives the address again and rejects a mismatch for the
same remembered credential. Clearing storage permits discoverable passkey login.
Unavailable storage does not block an in-memory session. A separate-account
confirmation prevents accidental duplicate signup when an account is remembered.

PRF output, seed and intermediate private key byte arrays are cleared after
derivation; ending the session clears its owned key. JavaScript cannot guarantee
erasure of immutable mnemonic strings, garbage-collected copies or browser memory.
The EVM key is derived software key material in the page, not an EVM key kept in
the authenticator. Same-origin script compromise remains a security boundary.
There is no secret export or telemetry. The server verifies account signatures
but never receives the PRF output, mnemonic, seed or private key.

Recovery depends on retaining access to the same passkey, including a compatible
provider's synchronization or backup. A replacement passkey creates a different
account. An email address or remembered public address cannot recover it.

## Local device verification

From the repository root:

```sh
npm --prefix apps/web ci
npm --prefix apps/web run dev
```

1. In your regular browser, open `http://localhost:18767/signup`. Use a PRF-capable
   authenticator/password manager from the support matrix. No funds are needed.
2. Select **Create a passkey** and personally complete the device prompts. The
   account screen should show an EVM address only after successful derivation.
3. Copy that public address, sign out, then sign in with the same passkey. Confirm
   that the full address matches. Do not share or export any private material.
4. Reload. The account remains available; there is no Mera signing-unlock control.
   Connect MetaMask to trade. Sign out and reload: authentication must stay cleared.
5. Optionally clear this site's local storage and sign in by selecting the saved
   passkey. The same address should return. Do not delete the actual passkey.

Automated checks (`npm --prefix apps/web test`) use actual SDK cryptography with
mock WebAuthn responses. They cover creation, fallback PRF retrieval, discovery,
error handling, domain restrictions, storage failure, address mismatch, duplicate
signup, concurrent/late results and expiry. They do not verify actual device PRF
behavior, cross-device recovery or a deployed origin.

## Public hosting handoff

Only the parent domain is registered as of this change. The frontend builds with
`npm ci && npm run build`. The new session service also requires a deployed backend,
a shared expiring session store, exact origin checks, Secure cookies and valid
HTTPS at `flurbo.singu.online`. The local middleware is not a public server and
must not be exposed or used to proxy local test funding on the public internet. Configure an SPA fallback to `index.html`
for `/login`, `/signup` and `/account`. Test direct-route reloads. Keep account
creation disabled on provider preview domains as the current policy requires.

Repeat creation, sign-out, recovery, cancellation and expiry on the final domain
with a new production-domain passkey. Android association and native Mera testing
remain in `apps/mobile/PASSKEY_SETUP.md`. This phase does not establish public
trading readiness or completion of the Mera partner requirements.
