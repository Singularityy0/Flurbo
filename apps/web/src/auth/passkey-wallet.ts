import type { AuthController } from './controller.ts';

export const PASSKEY_WALLET_NAME = 'Passkey account';

// MetaMask stays in the list. This only opens the ten-minute signer when the passkey account is the one about to sign.
export async function openPasskeyTradingSession(controller: AuthController, walletName: string | undefined) {
  if (walletName !== PASSKEY_WALLET_NAME) return;
  const until = controller.getSnapshot().signingExpiresAt;
  if (until !== null && until > Date.now()) return;
  const opened = await controller.unlockSigning();
  if (!opened) throw new Error(controller.getSnapshot().error || 'The trading session was not opened.');
}
