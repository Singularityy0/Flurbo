import { type CommandIO, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from '@metamask/agent-wallet/plugin';
import { getHoldings, MONAD_TESTNET_CHAIN_ID } from '../../index.js';
import { activeAddress, claimInputs, ctxOf, parseClaim } from '../../shared.js';

const inputs = { ...claimInputs } satisfies InputSchema;

export default class FlurboHoldingsCommand extends PluginCommand<{ account: string; sharesAtoms: string; shares: string }> {
  static requiresAuth = true;
  static description = 'Read the Agent Wallet account shares of one claim in a Flurbo pool';
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = 'flurbo:holdings';

  async execute(io: CommandIO) {
    const claim = parseClaim(await io.resolveInputs(inputs));
    const account = activeAddress(ctxOf(this));
    const held = await getHoldings(ctxOf(this).publicClient(MONAD_TESTNET_CHAIN_ID), { ...claim, account });
    return { account, sharesAtoms: held.atoms.toString(), shares: held.shares };
  }
}
