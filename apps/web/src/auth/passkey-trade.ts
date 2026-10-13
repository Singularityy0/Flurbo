import { bytesToHex, hashMessage, keccak256, serializeSignature, serializeTransaction, type Hex } from 'viem';
import type { AuthController } from './controller.ts';
import { MONAD_TESTNET_RPC } from './mobile-wallet.ts';

export const PASSKEY_SIGNING_ERROR = 'Mera is for account access only. Use MetaMask for transactions.';

function requireSession(controller: AuthController) {
  const snap = controller.getSnapshot();
  if (!snap.address || snap.signingExpiresAt === null) throw new Error(PASSKEY_SIGNING_ERROR);
  return snap.address;
}

function whole(value: unknown, name: string): bigint {
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^0x[0-9a-f]{1,64}$/i.test(value)) return BigInt(value);
  throw new Error(`The ${name} on this transaction is not valid. Review it again.`);
}

// Signing stays in the browser. The Flurbo server still refuses raw transactions.
// The signed transaction is sent straight to the public Monad testnet RPC.
export async function passkeyAccountRequest(controller: AuthController, method: string, params: unknown[] = [], broadcast: typeof fetch = fetch): Promise<unknown | undefined> {
  if (method === 'wallet_requestPermissions') {
    if (controller.getSnapshot().signingExpiresAt === null) {
      const opened = await controller.unlockSigning();
      if (!opened) throw new Error(controller.getSnapshot().error || PASSKEY_SIGNING_ERROR);
    }
    return [{ parentCapability: 'eth_accounts' }];
  }
  if (method !== 'personal_sign' && method !== 'eth_sendTransaction') return undefined;
  const account = requireSession(controller);
  if (method === 'personal_sign') {
    const message = params[0];
    const who = typeof params[1] === 'string' ? params[1] : '';
    if (who.toLowerCase() !== account.toLowerCase()) throw new Error('The passkey account does not match this signature request.');
    if (typeof message !== 'string' || !/^0x[0-9a-f]*$/i.test(message) || message.length % 2 !== 0) throw new Error('The signature request is not a hex message.');
    const signature = await controller.signDigest(hashMessage({ raw: message as Hex }));
    return serializeSignature({ r: bytesToHex(signature.compact.slice(0, 32)), s: bytesToHex(signature.compact.slice(32)), yParity: signature.recovery });
  }
  const row = params[0];
  if (!row || typeof row !== 'object') throw new Error('Review the transaction again before signing.');
  const tx = row as Record<string, unknown>;
  const from = typeof tx.from === 'string' ? tx.from : '';
  if (from.toLowerCase() !== account.toLowerCase()) throw new Error('The passkey account does not match this transaction.');
  if (whole(tx.chainId ?? '0x279f', 'chain') !== 10143n) throw new Error('The passkey account only signs Monad testnet transactions.');
  if (whole(tx.value ?? '0x0', 'value') !== 0n) throw new Error('The passkey trading session does not send MON. It only signs contract calls.');
  const gas = whole(tx.gas, 'gas limit');
  const gasPrice = whole(tx.gasPrice, 'gas price');
  if (gas === 0n || gas > 15_000_000n || gasPrice === 0n || gasPrice > 500_000_000_000n) throw new Error('Gas exceeds the passkey trading limit. Review again.');
  const to = tx.to;
  const data = tx.data ?? '0x';
  if (typeof to !== 'string' || !/^0x[0-9a-f]{40}$/i.test(to)) throw new Error('The transaction has no contract address.');
  if (typeof data !== 'string' || !/^0x[0-9a-f]*$/i.test(data) || data.length > 16_384) throw new Error('The transaction data is not valid.');
  const nonce = whole(tx.nonce, 'nonce');
  if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The nonce on this transaction is not valid. Review it again.');
  const unsigned = { type: 'legacy' as const, chainId: 10143, nonce: Number(nonce), gas, gasPrice, to: to as Hex, value: 0n, data: data as Hex };
  const signature = await controller.signDigest(keccak256(serializeTransaction(unsigned)));
  const raw = serializeTransaction(unsigned, { r: bytesToHex(signature.compact.slice(0, 32)), s: bytesToHex(signature.compact.slice(32)), v: BigInt(27 + signature.recovery) });
  const response = await broadcast(MONAD_TESTNET_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [raw] }) });
  const body = await response.json() as { result?: unknown; error?: unknown };
  if (!response.ok || body.error || typeof body.result !== 'string' || !/^0x[0-9a-f]{64}$/i.test(body.result)) throw new Error('Monad did not accept the signed transaction. Check the account balance and try again.');
  return body.result.toLowerCase();
}
