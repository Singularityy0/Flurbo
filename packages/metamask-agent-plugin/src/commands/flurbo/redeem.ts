import { type CommandIO, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from '@metamask/agent-wallet/plugin';
import { MONAD_TESTNET_CHAIN_ID, planRedeem } from '../../index.js';
import { activeAddress, claimInputs, ctxOf, parseClaim, parseUint, submitTransaction, text, type Executor } from '../../shared.js';

const inputs = { ...claimInputs, quantity: text('quantity', 'Quantity in share atoms to redeem (at most 10 shares)') } satisfies InputSchema;

export default class FlurboRedeemCommand extends PluginCommand<{ status: string; hash: string | null; explorerUrl?: string; pollingId?: string }> {
  static requiresAuth = true;
  static description = 'Redeem shares of a claim after the Flurbo pool has resolved; the transaction goes through the Agent Wallet';
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = 'flurbo:redeem';

  async execute(io: CommandIO) {
    const input = await io.resolveInputs(inputs);
    const tx = await planRedeem(ctxOf(this).publicClient(MONAD_TESTNET_CHAIN_ID), { ...parseClaim(input), quantity: parseUint('quantity', input.quantity), owner: activeAddress(ctxOf(this)) });
    const executor = await ctxOf(this).walletExecutor(io, this.pluginCommandId) as Executor;
    const sent = await submitTransaction(executor, tx, io.signal);
    return { status: sent.status, hash: sent.hash, ...(sent.explorerUrl ? { explorerUrl: sent.explorerUrl } : {}), ...(sent.pollingId ? { pollingId: sent.pollingId } : {}) };
  }
}
