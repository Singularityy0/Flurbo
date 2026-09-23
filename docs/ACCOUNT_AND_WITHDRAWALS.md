# Flurbo account and wallet roles

Mera passkeys are the required signup and login flow. MetaMask and other browser
wallets connect only inside an authenticated workspace. Wallet connection is not
account signup, login, account recovery or a merge of balances.

The account header always identifies the Mera wallet. The trading section shows
the selected signing wallet and reads that address's balances and positions.
Switching the trading wallet never updates the authenticated Mera address.
Connections are page-local; this change does not create a permanent linked-wallet
directory or let a connected wallet recover the Mera account.

## Withdraw to MetaMask

1. Sign in with Mera and unlock signing. In the trading section, select the
   Flurbo passkey wallet and connect it to read its balance.
2. If funds are in claims, sell those claims while trading is open, or redeem
   winning claims after resolution. Wrapped receipts and Kuru deposits require
   their own unwind/withdrawal steps. Do not count unrealized position value as
   available AUSD.
3. Expand **Withdraw available AUSD**. Choose MetaMask in the receiving-wallet
   selector and request its address, or paste the receiving address yourself.
   This only selects a destination; no tokens move at this step.
4. Enter an AUSD amount, then **Review withdrawal**. Check the full source,
   destination, amount, AUSD contract, Monad network and proposed MON gas budget.
5. Confirm explicitly. The Mera source signs the token transfer. The receiving
   wallet does not sign a token approval and does not need MON to receive AUSD.
   The source needs MON for transaction fees.
6. The tracker waits for two canonical confirmations, exact transaction data,
   and a matching AUSD Transfer event. Check MetaMask on the same Monad network;
   its token list may need the correct AUSD token imported.

Available deposited AUSD can also be transferred, not just realized winnings.
This is a transfer on the same chain. It is not a bridge, fiat cash-out, automatic
profit withdrawal or a transfer of open claim ownership. During this beta,
assets remain on Monad testnet and have no mainnet balance effect.

## Implementation boundaries

The wallet-login button and controller path are removed. Both session stores
reject the old `wallet` login method, challenges and sessions; the client also
discards them on restoration. Existing passkey sessions continue to restore.
The auth server verifies a signed proof from the Mera-derived EVM account as
documented in MERA_WEB_AUTH.md. The method marker is a workflow policy, not
hardware attestation or a cryptographic proof of which SDK derived a key.

Withdrawal uses ERC-20 transfer(address,uint256), not transferFrom or an
allowance. Mera's adapter and relay permit only canonical positive transfers of
the configured AUSD, from the signed-in account. Zero, self, pool and AUSD-token
destinations are rejected. Manual receiving addresses are user supplied and are
not proven to belong to that user; the full address is shown for confirmation.

The existing trading review/pending lock is reused, including expiry, input and
account-change invalidation, simulation, sufficient AUSD/MON checks, persisted
pending tracking and no automatic retry after ambiguous wallet errors. This
change does not submit a transfer, deploy contracts or replace the public
testnet wallet acceptance test.
