import { encodeFunctionData, formatUnits, parseAbi, type Hex, createPublicClient, http } from 'viem';

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const AUSD_TESTNET = '0xa9012a055bd4e0edff8ce09f960291c09d5322dc';

export const poolAbi = parseAbi([
  'error Closed()',
  'function buy(uint32 scope, uint256 mask, uint128 quantity, uint128 maxCost, uint256 deadline) external returns (uint128 cost)',
  'function sell(uint32 scope, uint256 mask, uint128 quantity, uint128 minProceeds, uint256 deadline) external returns (uint128 proceeds)',
  'function redeem(uint32 scope, uint256 mask, uint128 quantity) external returns (uint128 payout)',
  'function quoteBuy(uint32 scope, uint256 mask, uint128 quantity) external view returns (uint128 cost)',
  'function quoteSell(uint32 scope, uint256 mask, uint128 quantity) external view returns (uint128 proceeds)',
  'function holdings(address account, uint32 scope, uint256 mask) external view returns (uint128 shares)'
]);

export const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
]);

export interface PluginContext {
  wallet: {
    address: Hex;
    sendTransaction(tx: { to: Hex; data: Hex; value?: bigint }): Promise<Hex>;
  };
  rpcUrl?: string;
}

export class FlurboAgentPlugin {
  private rpcUrl: string;

  constructor(rpcUrl: string = 'https://testnet-rpc.monad.xyz') {
    this.rpcUrl = rpcUrl;
  }

  getPublicClient() {
    return createPublicClient({
      transport: http(this.rpcUrl)
    });
  }

  // Tool 1: Quote single or combination trade from the LMSR pool
  async getQuote(params: { pool: Hex; scope: number; mask: bigint; quantity: bigint; side: 'buy' | 'sell' }) {
    const client = this.getPublicClient();
    if (await client.getChainId() !== MONAD_TESTNET_CHAIN_ID) throw new Error('RPC is not Monad testnet');
    if (!Number.isInteger(params.scope) || params.scope <= 0 || params.scope > 15 || params.quantity <= 0n || params.quantity > (1n << 128n) - 1n) throw new Error('Invalid claim or quantity');
    if (params.side === 'buy') {
      const cost = await client.readContract({
        address: params.pool,
        abi: poolAbi,
        functionName: 'quoteBuy',
        args: [params.scope, params.mask, params.quantity]
      });
      return { costAtoms: cost.toString(), costAusd: formatUnits(cost, 6) };
    } else {
      const proceeds = await client.readContract({
        address: params.pool,
        abi: poolAbi,
        functionName: 'quoteSell',
        args: [params.scope, params.mask, params.quantity]
      });
      return { proceedsAtoms: proceeds.toString(), proceedsAusd: formatUnits(proceeds, 6) };
    }
  }

  // Tool 2: Check current token holdings
  async getHoldings(params: { pool: Hex; account: Hex; scope: number; mask: bigint }) {
    const client = this.getPublicClient();
    if (await client.getChainId() !== MONAD_TESTNET_CHAIN_ID) throw new Error('RPC is not Monad testnet');
    const shares = await client.readContract({
      address: params.pool,
      abi: poolAbi,
      functionName: 'holdings',
      args: [params.account, params.scope, params.mask]
    });
    return { sharesAtoms: shares.toString(), shares: formatUnits(shares, 6) };
  }

  // Tool 3: Build and execute trade strictly through MetaMask Agent Wallet
  // NEVER accesses private keys; delegates all signing to context.wallet
  async executeTrade(
    context: PluginContext,
    params: {
      pool: Hex;
      side: 'buy' | 'sell';
      scope: number;
      mask: bigint;
      quantity: bigint;
      slippageBps?: number;
      deadlineSeconds?: number;
    }
  ): Promise<{ txHash: Hex }> {
    const client = this.getPublicClient();
    if (await client.getChainId() !== MONAD_TESTNET_CHAIN_ID) throw new Error('RPC is not Monad testnet');
    if (!Number.isInteger(params.scope) || params.scope <= 0 || params.scope > 15 || params.quantity <= 0n || params.quantity > (1n << 128n) - 1n) throw new Error('Invalid claim or quantity');
    if (!Number.isInteger(params.slippageBps ?? 50) || (params.slippageBps ?? 50) < 0 || (params.slippageBps ?? 50) > 500) throw new Error('Slippage must be between 0 and 500 bps');
    const slippage = BigInt(params.slippageBps ?? 50);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds || 300));

    if (params.side === 'buy') {
      // 1. Get current quote to calculate maxCost with slippage limit
      const quoteCost = await client.readContract({
        address: params.pool,
        abi: poolAbi,
        functionName: 'quoteBuy',
        args: [params.scope, params.mask, params.quantity]
      });
      const maxCost = (quoteCost * (10000n + slippage) + 9999n) / 10000n;

      // 2. Check token allowance; if insufficient, route approval through Agent Wallet
      const allowance = await client.readContract({
        address: AUSD_TESTNET,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [context.wallet.address, params.pool]
      });

      if (allowance < maxCost) throw new Error(`Approve ${maxCost} AUSD atoms for this pool in a separate reviewed wallet action.`);

      // 3. Encode buy transaction
      const buyData = encodeFunctionData({
        abi: poolAbi,
        functionName: 'buy',
        args: [params.scope, params.mask, params.quantity, maxCost, deadline]
      });

      await client.simulateContract({ address: params.pool, abi: poolAbi, functionName: 'buy',
        args: [params.scope, params.mask, params.quantity, maxCost, deadline], account: context.wallet.address });
      // Signing and policy remain with the supplied wallet executor.
      const txHash = await context.wallet.sendTransaction({
        to: params.pool,
        data: buyData
      });

      return { txHash };
    } else {
      // Encode sell transaction
      const quoteProceeds = await client.readContract({
        address: params.pool,
        abi: poolAbi,
        functionName: 'quoteSell',
        args: [params.scope, params.mask, params.quantity]
      });
      const minProceeds = (quoteProceeds * (10000n - slippage)) / 10000n;

      const sellData = encodeFunctionData({
        abi: poolAbi,
        functionName: 'sell',
        args: [params.scope, params.mask, params.quantity, minProceeds, deadline]
      });

      await client.simulateContract({ address: params.pool, abi: poolAbi, functionName: 'sell',
        args: [params.scope, params.mask, params.quantity, minProceeds, deadline], account: context.wallet.address });

      const txHash = await context.wallet.sendTransaction({
        to: params.pool,
        data: sellData
      });

      return { txHash };
    }
  }
}
