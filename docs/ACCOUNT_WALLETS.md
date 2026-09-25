# Flurbo account and trading wallets

Mera supplies the login identity. MetaMask supplies the trading addresses and
transaction confirmations. The same compatible synced passkey can restore the
same Mera address on another device. A biometric unlock is local to a device;
it is not the account identifier. Creating a different passkey can create a
different account. Cross-device passkey compatibility needs device acceptance.

## Linking and portfolio

On the first connection of a MetaMask address, the user signs a plain-text link
message. It names the origin, Mera address, trading address, testnet chain, nonce,
expiry and purpose. It does not grant token allowance or send a transaction.
Already-linked addresses do not require another link signature.

The authenticated `/api/account/wallets` API stores the verified association in
the existing Upstash database. Hosted service failure never falls back to
in-memory links. Proofs expire after five minutes, are consumed once, and are
bound to the current Mera session and origin. Address ownership is verified with
an EOA message signature; smart-contract signing wallets are not supported by
this link flow. MetaMask discovery is an application policy, not cryptographic
attestation of a wallet brand.

One trading address belongs to one Flurbo account; an account can link up to
20 addresses. The ownership index and account set are updated atomically.
Account reassignment and unlinking are not provided in this release. Losing
access to a Mera account does not transfer its wallet links to a newly created
account. Do not manually edit the database to transfer a link without a separate
recovery design and ownership verification.

Portfolio and History default to all linked addresses, with individual wallet
sections and optional filtering. Market detail sums individual Yes/No shares
across these addresses. Reads can be at different blocks and are not an atomic
account-wide chain snapshot. A failed wallet read must not be represented as a
zero balance. Collections remain separate; the user can select their collection.
A diagnostic address lookup does not create a verified link or change the
default account view. Earlier Mera holdings remain available as a legacy lookup.

Shares, AUSD and payout rights remain at their original on-chain addresses.
Selling or collecting still needs the owning MetaMask wallet. No contracts,
collateral rules or settlement logic change. Existing users connect each old
MetaMask address once to include its historical holdings and future activity.

## Privacy and deployment

The association is returned only to the signed-in account. It is not published
on-chain or in a public trader feed. The service/database operator can see these
relationships, and the underlying on-chain trades remain public. This feature
does not provide cryptographic participant privacy.

Deploy web/API together using the existing persistent Upstash configuration.
No new secrets or contract deployment are required. Rebuild the native app;
new WalletConnect sessions request `personal_sign` for the one-time ownership
proof as well as `eth_sendTransaction`. Old sessions may require reconnection.

Acceptance: log in, connect and link P1, buy, switch and link P2, buy, then open
Portfolio in a fresh browser/device using the same Mera account. Both wallets
must appear without address entry. Rejecting a link must prevent the new wallet
from becoming the active trading wallet. Check a rejected transaction and a
pending reload separately. Verify the other account cannot access these links.
