import { type CommandIO, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from '@metamask/agent-wallet/plugin';
import { getQuote } from '../../index.js';
import { claimInputs, parseClaim, parseUint, readClient, text } from '../../shared.js';

const inputs = {
  ...claimInputs,
  quantity: text('quantity', 'Quantity in share atoms (1 share = 1000000, at most 10 shares)'),
  side: text('side', 'buy or sell'),
} satisfies InputSchema;

export default class FlurboQuoteCommand extends PluginCommand<{ amountAtoms: string; amountAusd: string; side: string }> {
  static requiresAuth = false;
  static requiresInit = false;
  static description = 'Read a Flurbo pool quote on Monad testnet';
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = 'flurbo:quote';

  async execute(io: CommandIO) {
    const input = await io.resolveInputs(inputs);
    if (input.side !== 'buy' && input.side !== 'sell') throw new Error('Side must be buy or sell');
    const quote = await getQuote(readClient(), { ...parseClaim(input), quantity: parseUint('quantity', input.quantity), side: input.side });
    return { amountAtoms: quote.atoms.toString(), amountAusd: quote.ausd, side: input.side };
  }
}
