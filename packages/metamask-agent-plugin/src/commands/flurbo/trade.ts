import { type CommandIO, InputFieldType, type InputSchema, PluginCommand, schemaToArgs, schemaToFlags } from '@metamask/agent-wallet/plugin';
import { MONAD_TESTNET_CHAIN_ID, planTrade } from '../../index.js';
import { activeAddress, claimInputs, confirmed, ctxOf, parseClaim, parseUint, submitTransaction, text, type Executor } from '../../shared.js';

const inputs = {
  ...claimInputs,
  quantity: text('quantity', 'Quantity in share atoms (1 share = 1000000, at most 10 shares)'),
  side: text('side', 'buy or sell'),
  slippage: text('slippage', 'Maximum slippage in basis points, 0 to 100 (default 50)', false),
  deadline: text('deadline', 'Seconds the order stays valid, 60 to 600 (default 300)', false),
  approve: { type: InputFieldType.Boolean, flag: 'approve', message: 'Allow one exact-amount test AUSD approval for this pool if one is needed', required: false, prompt: false },
} satisfies InputSchema;

type TradeResult =
  | { status: 'approval_required'; amountAtoms: string; message: string }
  | { status: string; hash: string | null; approvalHash?: string; explorerUrl?: string; pollingId?: string; quoteAtoms: string; limitAtoms: string };

export default class FlurboTradeCommand extends PluginCommand<TradeResult> {
  static requiresAuth = true;
  static description = 'Buy or sell shares of a Flurbo claim; every transaction goes through the Agent Wallet';
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = 'flurbo:trade';

  async execute(io: CommandIO): Promise<TradeResult> {
    const input = await io.resolveInputs(inputs);
    if (input.side !== 'buy' && input.side !== 'sell') throw new Error('Side must be buy or sell');
    const side: 'buy' | 'sell' = input.side;
    const claim = { ...parseClaim(input), quantity: parseUint('quantity', input.quantity) };
    const slippageBps = Number(parseUint('slippage', input.slippage || '50')), deadlineSeconds = Number(parseUint('deadline', input.deadline || '300'));
    const client = ctxOf(this).publicClient(MONAD_TESTNET_CHAIN_ID);
    const owner = activeAddress(ctxOf(this));
    const plan = () => planTrade(client, { ...claim, owner, side, slippageBps, deadlineSeconds, now: Math.floor(Date.now() / 1000) });

    let current = await plan();
    let approvalHash: string | undefined;
    if (current.approval) {
      if (!input.approve) {
        return { status: 'approval_required', amountAtoms: current.limitAtoms.toString(),
          message: `Run again with --approve to approve exactly ${current.limitAtoms} test AUSD atoms for this pool, then trade.` };
      }
      const executor = await ctxOf(this).walletExecutor(io, this.pluginCommandId) as Executor;
      const approval = await submitTransaction(executor, current.approval, io.signal);
      if (!approval.hash) {
        return { status: approval.status, hash: null, ...(approval.pollingId ? { pollingId: approval.pollingId } : {}),
          quoteAtoms: current.quoteAtoms.toString(), limitAtoms: current.limitAtoms.toString() };
      }
      await confirmed(client, approval.hash);
      approvalHash = approval.hash;
      current = await plan(); // a fresh quote, and a simulation that now sees the allowance
      if (current.approval) throw new Error('The approval did not take effect; nothing was traded');
    }
    const executor = await ctxOf(this).walletExecutor(io, this.pluginCommandId) as Executor;
    const trade = await submitTransaction(executor, current.trade, io.signal);
    return { status: trade.status, hash: trade.hash, ...(approvalHash ? { approvalHash } : {}), ...(trade.explorerUrl ? { explorerUrl: trade.explorerUrl } : {}),
      ...(trade.pollingId ? { pollingId: trade.pollingId } : {}), quoteAtoms: current.quoteAtoms.toString(), limitAtoms: current.limitAtoms.toString() };
  }
}
