import { createPublicClient, getAddress, http, isAddress, type Hex, type PublicClient } from 'viem';
import { InputFieldType, type InputSchema, type PluginCommandContext } from '@metamask/agent-wallet/plugin';
import { EXPLORER_TX, MONAD_TESTNET_CHAIN_ID, type TxRequest } from './index.js';

export const DEFAULT_RPC_URL = 'https://testnet-rpc.monad.xyz';

/** Read-only client for commands that need no wallet. */
export function readClient(): PublicClient {
  return createPublicClient({ transport: http(process.env.FLURBO_MONAD_RPC_URL || DEFAULT_RPC_URL) }) as PublicClient;
}

export const text = (flag: string, message: string, required = true) => ({ type: InputFieldType.Text, flag, message, required, prompt: false }) as const;
export const claimInputs = {
  pool: text('pool', 'Pool address'),
  scope: text('scope', 'Claim scope: bit set of the questions it covers, for example 4 for the third question'),
  mask: text('mask', 'Claim mask over the local outcomes, for example 2 for Yes on a single question'),
} satisfies InputSchema;

export function parseAddress(name: string, value: string): Hex {
  if (!isAddress(value, { strict: false })) throw new Error(`Invalid ${name}`);
  return getAddress(value) as Hex;
}
export function parseUint(name: string, value: string): bigint {
  if (!/^(0|[1-9]\d{0,38})$/.test(value)) throw new Error(`Invalid ${name}: use a whole number`);
  return BigInt(value);
}
export function parseClaim(input: { pool: string; scope: string; mask: string }) {
  const scope = parseUint('scope', input.scope);
  if (scope > 0xffffffffn) throw new Error('Invalid scope');
  return { pool: parseAddress('pool', input.pool), scope: Number(scope), mask: parseUint('mask', input.mask) };
}

/** First account of the Agent Wallet. Requires the wallet-read capability and the accounts data access. */
export function activeAddress(ctx: { walletStateManager: { read(): any } }): Hex {
  const state = ctx.walletStateManager.read();
  const wallet = [...(state?.byokWallets ?? []), ...(state?.remoteWallets ?? [])][0];
  if (!wallet?.address) throw new Error('No Agent Wallet account found. Create or import one with mm first.');
  return parseAddress('wallet address', wallet.address);
}

export type ExecutorResult = { kind?: string; hash?: string; status?: string; failureDescription?: string; pendingJob?: { pollingId?: string } };
export type Executor = (request: unknown, options?: { signal?: AbortSignal }) => Promise<ExecutorResult>;
export type Submitted = { hash: Hex | null; status: string; pollingId?: string; explorerUrl?: string };

/**
 * Hands one transaction to the Agent Wallet. The wallet applies its own policy, Guard Mode limits and MFA; this plugin
 * never signs and never holds a key. The intent text is what the wallet shows the person approving.
 */
export async function submitTransaction(executor: Executor, tx: TxRequest, signal?: AbortSignal): Promise<Submitted> {
  const result = await executor({
    kind: 'transaction', chainId: MONAD_TESTNET_CHAIN_ID,
    transaction: { to: tx.to, data: tx.data },
    intent: { action: 'custom', summary: tx.intent },
  }, { signal });
  if (result.kind !== 'transaction') throw new Error('The wallet returned an unexpected result');
  if (result.failureDescription) throw new Error(`The wallet could not complete the transaction: ${result.failureDescription}`);
  const hash = typeof result.hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(result.hash) ? (result.hash as Hex) : null;
  return { hash, status: String(result.status ?? 'SUBMITTED'), ...(result.pendingJob?.pollingId ? { pollingId: result.pendingJob.pollingId } : {}),
    ...(hash ? { explorerUrl: EXPLORER_TX + hash } : {}) };
}

/** Waits for a mined receipt and refuses a reverted transaction. */
export async function confirmed(client: PublicClient, hash: Hex): Promise<void> {
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== 'success') throw new Error(`Transaction ${hash} reverted`);
}

/** The command's restricted context. Typed here once so command classes stay independent of the SDK's internal base types. */
export const ctxOf = (command: object): PluginCommandContext => (command as unknown as { ctx: PluginCommandContext }).ctx;
