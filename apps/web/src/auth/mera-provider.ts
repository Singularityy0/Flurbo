import { bytesToHex, keccak256, serializeTransaction, type Hex } from 'viem';
import type { AuthController } from './controller';
import { WalletError } from '../../../dashboard/wallet.mjs';

async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch('/api/rpc', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }), signal: AbortSignal.timeout(20_000) });
  const value = await response.json();
  if (!response.ok || value.error) throw new WalletError('Local chain request failed. Check transaction tracking before retrying.');
  return value.result;
}

// EIP-1193 adapter for the existing, reviewed local execution engine. It exposes
// no arbitrary message signing or key export to dashboard code.
export function meraProvider(controller: AuthController) {
  const listeners = new Map<string, Set<() => void>>();
  let previous = controller.getSnapshot().address;
  const unsubscribe = controller.subscribe(() => {
    const current = controller.getSnapshot().address;
    if (current?.toLowerCase() !== previous?.toLowerCase()) { previous = current; listeners.get('accountsChanged')?.forEach(fn => fn()); }
  });
  return {
    on(name: string, fn: () => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeListener(name: string, fn: () => void) { listeners.get(name)?.delete(fn); },
    destroy() { unsubscribe(); listeners.clear(); },
    async request({ method, params = [] }: { method: string; params?: unknown[] }) {
      const owner = controller.getSnapshot().address;
      if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return owner ? [owner.toLowerCase()] : [];
      if (method === 'eth_sendTransaction') {
        controller.checkExpiry();
        if (!controller.getSnapshot().signingExpiresAt || !owner) throw new WalletError('Use Unlock signing at the top of the workspace, then review again.');
        const input = params[0] as Record<string, string>;
        if (!input || input.from?.toLowerCase() !== owner.toLowerCase() || BigInt(input.chainId) !== 10143n || BigInt(input.value) !== 0n) throw new Error('Unsupported transaction');
        const response = await fetch('/api/state', { cache: 'no-store' });
        if (!response.ok) throw new Error('Deployment unavailable');
        const state = await response.json();
        const selector = input.data?.slice(0, 10);
        if (state.environment !== 'local_fork' || state.chain_id !== 10143 || ![state.contracts.pool, state.contracts.cash].some((a: string) => a.toLowerCase() === input.to?.toLowerCase()) ||
            !(input.to.toLowerCase() === state.contracts.cash.toLowerCase()
              ? selector === '0x095ea7b3'
              : ['0x3e6b6cde', '0xc39849c5', '0xb0a52172', '0xf6c4eade', '0xdf992423'].includes(selector))) throw new Error('Unsupported local contract');
        const chain = await rpc('eth_chainId');
        if (BigInt(chain) !== 10143n) throw new Error('Wrong local chain');
        const block = await rpc('eth_getBlockByNumber', ['0x' + BigInt(state.snapshot.block_number).toString(16), false]);
        if (block?.hash?.toLowerCase() !== state.snapshot.block_hash.toLowerCase()) throw new Error('Local fork changed');
        const nonce = BigInt(await rpc('eth_getTransactionCount', [owner, 'pending']));
        if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Nonce out of range');
        const tx = { type: 'legacy' as const, chainId: 10143, nonce: Number(nonce), to: input.to as Hex, data: input.data as Hex,
          gas: BigInt(input.gas), gasPrice: BigInt(input.gasPrice), value: 0n };
        if (tx.gas <= 0n || tx.gas > 30_000_000n || tx.gasPrice <= 0n) throw new Error('Invalid gas bounds');
        const signature = await controller.signDigest(keccak256(serializeTransaction(tx)));
        const serialized = serializeTransaction(tx, { r: bytesToHex(signature.compact.slice(0, 32)), s: bytesToHex(signature.compact.slice(32)), v: 27n + BigInt(signature.recovery) });
        return rpc('eth_sendRawTransaction', [serialized]);
      }
      if (!['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice'].includes(method)) throw new Error('Unsupported wallet request');
      return rpc(method, params);
    },
  };
}
