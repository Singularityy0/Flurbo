import { createSecretVaultWithExistingPasskey, decryptSecretVaultWithPasskey, parseSecretVault, type PasskeySecretVault, type WebAuthnClient } from '@category-labs/mera';

export const VAULT_STORAGE = 'flurbo.passkey.vault.v1';

// A fresh PRF salt is created inside the vault. That salt is not the salt that derives the trading account.
export async function sealNote(options: { rpId: string; credentialId: string; note: string; client?: WebAuthnClient }): Promise<PasskeySecretVault> {
  const encoded = new TextEncoder().encode(options.note);
  if (encoded.length < 1 || encoded.length > 500) throw new Error('Use a note between 1 and 500 characters.');
  const secret = new Uint8Array(encoded);
  try {
    return await createSecretVaultWithExistingPasskey({
      rpId: options.rpId, credential: { credentialId: options.credentialId }, secret, timeout: 60_000, webAuthnClient: options.client,
    });
  } finally { secret.fill(0); }
}

export async function openNote(options: { rpId: string; vault: unknown; client?: WebAuthnClient }): Promise<string> {
  const vault = parseSecretVault(options.vault);
  const secret = await decryptSecretVaultWithPasskey({ rpId: options.rpId, vault, timeout: 60_000, webAuthnClient: options.client });
  try { return new TextDecoder().decode(secret); }
  finally { secret.fill(0); }
}
