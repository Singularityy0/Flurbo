import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from '@metamask/agent-wallet/plugin';
import { type Hex } from 'viem';
import { FlurboAgentPlugin } from '../../index.js';

const inputs = {
  pool: { type: InputFieldType.Text, flag: 'pool', message: 'Pool address', required: true, prompt: false },
  scope: { type: InputFieldType.Text, flag: 'scope', message: 'Claim scope', required: true, prompt: false },
  mask: { type: InputFieldType.Text, flag: 'mask', message: 'Claim mask', required: true, prompt: false },
  quantity: { type: InputFieldType.Text, flag: 'quantity', message: 'Quantity in share atoms', required: true, prompt: false },
  side: { type: InputFieldType.Text, flag: 'side', message: 'buy or sell', required: true, prompt: false }
} satisfies InputSchema;

export default class FlurboQuoteCommand extends PluginCommand<{ amountAtoms: string; amountAusd: string; side: string }> {
  static requiresAuth = false;
  static requiresInit = false;
  static description = 'Read a Flurbo pool quote on Monad testnet';
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = 'flurbo:quote';

  async execute(io: CommandIO) {
    const { pool, scope, mask, quantity, side } = await io.resolveInputs(inputs);
    if (!/^0x[0-9a-f]{40}$/i.test(pool) || !/^\d+$/.test(scope) || !/^\d+$/.test(mask) || !/^\d+$/.test(quantity) || !['buy', 'sell'].includes(side)) throw new Error('Invalid quote input');
    const client = new FlurboAgentPlugin(process.env.FLURBO_MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz');
    const quote = await client.getQuote({ pool: pool as Hex, scope: Number(scope), mask: BigInt(mask), quantity: BigInt(quantity), side: side as 'buy' | 'sell' });
    return side === 'buy'
      ? { amountAtoms: quote.costAtoms!, amountAusd: quote.costAusd!, side }
      : { amountAtoms: quote.proceedsAtoms!, amountAusd: quote.proceedsAusd!, side };
  }
}
