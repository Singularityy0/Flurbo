import { encodeFunctionData, formatUnits, getAddress, isAddress, parseAbi, type Hex, type PublicClient } from 'viem';

// Planning and reads for Flurbo pools on Monad testnet. Everything here is pure calldata and public reads:
// no signer, no key and no wallet object. Submitting is the Agent Wallet's job (see commands/flurbo/trade.ts).
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MAX_QUANTITY_ATOMS = 10_000_000n; // 10 shares: the per-call quote support limit
export const MAX_SLIPPAGE_BPS = 100;
export const MIN_DEADLINE_SECONDS = 60;
export const MAX_DEADLINE_SECONDS = 600;
export const EXPLORER_TX = 'https://testnet.monadscan.com/tx/';

export const poolAbi = parseAbi([
  'function buy(uint32 scope, uint256 mask, uint128 quantity, uint128 maxCost, uint256 deadline) external returns (uint128 cost)',
  'function sell(uint32 scope, uint256 mask, uint128 quantity, uint128 minProceeds, uint256 deadline) external returns (uint128 proceeds)',
  'function redeem(uint32 scope, uint256 mask, uint128 quantity) external returns (uint128 payout)',
  'function quoteBuy(uint32 scope, uint256 mask, uint128 quantity) external view returns (uint128 cost)',
  'function quoteSell(uint32 scope, uint256 mask, uint128 quantity) external view returns (uint128 proceeds)',
  'function holdings(address owner, uint32 scope, uint256 mask) external view returns (uint128 shares)',
  'function collateral() external view returns (address)',
  'function eventCount() external view returns (uint8)',
  'function closesAt() external view returns (uint64)',
  'function funded() external view returns (bool)',
  'function resolved() external view returns (bool)',
]);

export const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
]);

export type TxRequest = { to: Hex; data: Hex; intent: string };
export type Claim = { pool: Hex; scope: number; mask: bigint; quantity: bigint };

/** Boolean claims cover 1 to 3 questions of the pool: scope is their bit set, mask a nonempty, non-full set of local outcomes. */
export function validateClaim(scope: number, mask: bigint, eventCount: number): void {
  if (!Number.isInteger(eventCount) || eventCount < 1 || eventCount > 32) throw new Error('Invalid question count');
  if (!Number.isInteger(scope) || scope <= 0 || scope >= 2 ** eventCount) throw new Error('Scope must select questions of this pool');
  let size = 0;
  for (let s = scope; s !== 0; s &= s - 1) size++;
  if (size < 1 || size > 3) throw new Error('A claim covers 1 to 3 questions');
  const full = (1n << BigInt(1 << size)) - 1n;
  if (mask <= 0n || mask >= full) throw new Error('Mask must be neither empty nor full');
}

function requirePool(pool: string): Hex {
  if (!isAddress(pool, { strict: false })) throw new Error('Invalid pool address');
  return getAddress(pool) as Hex;
}

function requireQuantity(quantity: bigint) {
  if (quantity <= 0n || quantity > MAX_QUANTITY_ATOMS) throw new Error(`Quantity must be 1 to ${MAX_QUANTITY_ATOMS} share atoms (at most 10 shares per call)`);
}

async function requireTestnet(client: PublicClient) {
  if (await client.getChainId() !== MONAD_TESTNET_CHAIN_ID) throw new Error('RPC is not Monad testnet');
}

async function eventCountOf(client: PublicClient, pool: Hex) {
  return Number(await client.readContract({ address: pool, abi: poolAbi, functionName: 'eventCount' }));
}

async function simulated<T>(run: () => Promise<T>, what: string): Promise<T> {
  try { return await run(); } catch (error) {
    const reason = error && typeof error === 'object' && 'shortMessage' in error ? String((error as { shortMessage: unknown }).shortMessage) : 'it would revert';
    throw new Error(`The pool would reject this ${what}: ${reason}`);
  }
}

export async function getQuote(client: PublicClient, p: Claim & { side: 'buy' | 'sell' }): Promise<{ atoms: bigint; ausd: string }> {
  await requireTestnet(client);
  const pool = requirePool(p.pool);
  requireQuantity(p.quantity);
  validateClaim(p.scope, p.mask, await eventCountOf(client, pool));
  const atoms = await client.readContract({ address: pool, abi: poolAbi, functionName: p.side === 'buy' ? 'quoteBuy' : 'quoteSell', args: [p.scope, p.mask, p.quantity] });
  return { atoms, ausd: formatUnits(atoms, 6) };
}

export async function getHoldings(client: PublicClient, p: { pool: Hex; account: Hex; scope: number; mask: bigint }): Promise<{ atoms: bigint; shares: string }> {
  await requireTestnet(client);
  const pool = requirePool(p.pool);
  validateClaim(p.scope, p.mask, await eventCountOf(client, pool));
  const atoms = await client.readContract({ address: pool, abi: poolAbi, functionName: 'holdings', args: [p.account, p.scope, p.mask] });
  return { atoms, shares: formatUnits(atoms, 6) };
}

/**
 * Builds the transaction(s) for one trade without sending anything.
 * Buy: an exact-amount approval of the pool's collateral is returned only when the allowance is short; the trade
 * is simulated as the owner only when no approval is needed (it would revert before the approval is mined).
 * Sell: never needs an approval.
 */
export async function planTrade(client: PublicClient, p: Claim & {
  owner: Hex; side: 'buy' | 'sell'; slippageBps: number; deadlineSeconds: number; now: number;
}): Promise<{ approval: TxRequest | null; trade: TxRequest; quoteAtoms: bigint; limitAtoms: bigint; deadline: bigint }> {
  await requireTestnet(client);
  const pool = requirePool(p.pool);
  if (!isAddress(p.owner, { strict: false })) throw new Error('Invalid owner address');
  const owner = getAddress(p.owner) as Hex;
  if (p.side !== 'buy' && p.side !== 'sell') throw new Error('Side must be buy or sell');
  requireQuantity(p.quantity);
  if (!Number.isInteger(p.slippageBps) || p.slippageBps < 0 || p.slippageBps > MAX_SLIPPAGE_BPS) throw new Error(`Slippage must be 0 to ${MAX_SLIPPAGE_BPS} basis points`);
  if (!Number.isInteger(p.deadlineSeconds) || p.deadlineSeconds < MIN_DEADLINE_SECONDS || p.deadlineSeconds > MAX_DEADLINE_SECONDS)
    throw new Error(`Deadline must be ${MIN_DEADLINE_SECONDS} to ${MAX_DEADLINE_SECONDS} seconds`);
  if (!Number.isSafeInteger(p.now) || p.now <= 0) throw new Error('Invalid time');

  const [eventCount, funded, resolved, closesAt, collateral] = await Promise.all([
    eventCountOf(client, pool),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'funded' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'resolved' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'closesAt' }),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'collateral' }),
  ]);
  validateClaim(p.scope, p.mask, eventCount);
  if (!funded || resolved || BigInt(p.now) >= closesAt) throw new Error('Trading is closed for this pool');
  const deadline = BigInt(p.now + p.deadlineSeconds);

  if (p.side === 'sell') {
    const [quoteAtoms, held] = await Promise.all([
      client.readContract({ address: pool, abi: poolAbi, functionName: 'quoteSell', args: [p.scope, p.mask, p.quantity] }),
      client.readContract({ address: pool, abi: poolAbi, functionName: 'holdings', args: [owner, p.scope, p.mask] }),
    ]);
    if (held < p.quantity) throw new Error('This wallet holds fewer shares than the quantity to sell');
    const limitAtoms = (quoteAtoms * BigInt(10000 - p.slippageBps)) / 10000n; // minimum proceeds, rounded down
    const args = [p.scope, p.mask, p.quantity, limitAtoms, deadline] as const;
    await simulated(() => client.simulateContract({ address: pool, abi: poolAbi, functionName: 'sell', args, account: owner }), 'sale');
    return { approval: null, quoteAtoms, limitAtoms, deadline, trade: { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: 'sell', args }),
      intent: `Sell ${formatUnits(p.quantity, 6)} Flurbo shares for at least ${formatUnits(limitAtoms, 6)} test AUSD` } };
  }

  const quoteAtoms = await client.readContract({ address: pool, abi: poolAbi, functionName: 'quoteBuy', args: [p.scope, p.mask, p.quantity] });
  const limitAtoms = (quoteAtoms * BigInt(10000 + p.slippageBps) + 9999n) / 10000n; // maximum cost, rounded up
  const [allowance, balance] = await Promise.all([
    client.readContract({ address: collateral, abi: erc20Abi, functionName: 'allowance', args: [owner, pool] }),
    client.readContract({ address: collateral, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
  ]);
  if (balance < limitAtoms) throw new Error(`This wallet holds ${formatUnits(balance, 6)} test AUSD; the trade can cost up to ${formatUnits(limitAtoms, 6)}`);
  const args = [p.scope, p.mask, p.quantity, limitAtoms, deadline] as const;
  const trade: TxRequest = { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: 'buy', args }),
    intent: `Buy ${formatUnits(p.quantity, 6)} Flurbo shares for at most ${formatUnits(limitAtoms, 6)} test AUSD` };
  if (allowance < limitAtoms) {
    return { quoteAtoms, limitAtoms, deadline, trade, approval: { to: collateral, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [pool, limitAtoms] }),
      intent: `Approve exactly ${formatUnits(limitAtoms, 6)} test AUSD for this Flurbo pool` } };
  }
  await simulated(() => client.simulateContract({ address: pool, abi: poolAbi, functionName: 'buy', args, account: owner }), 'purchase');
  return { approval: null, quoteAtoms, limitAtoms, deadline, trade };
}

/** Redeems a held claim after the pool has resolved. The call is simulated first. */
export async function planRedeem(client: PublicClient, p: Claim & { owner: Hex }): Promise<TxRequest> {
  await requireTestnet(client);
  const pool = requirePool(p.pool);
  if (!isAddress(p.owner, { strict: false })) throw new Error('Invalid owner address');
  const owner = getAddress(p.owner) as Hex;
  requireQuantity(p.quantity);
  const [eventCount, resolved] = await Promise.all([
    eventCountOf(client, pool),
    client.readContract({ address: pool, abi: poolAbi, functionName: 'resolved' }),
  ]);
  validateClaim(p.scope, p.mask, eventCount);
  if (!resolved) throw new Error('This pool has not resolved yet');
  const held = await client.readContract({ address: pool, abi: poolAbi, functionName: 'holdings', args: [owner, p.scope, p.mask] });
  if (held < p.quantity) throw new Error('This wallet holds fewer shares than the quantity to redeem');
  const args = [p.scope, p.mask, p.quantity] as const;
  await simulated(() => client.simulateContract({ address: pool, abi: poolAbi, functionName: 'redeem', args, account: owner }), 'redemption');
  return { to: pool, data: encodeFunctionData({ abi: poolAbi, functionName: 'redeem', args }),
    intent: `Redeem ${formatUnits(p.quantity, 6)} Flurbo shares from a resolved pool` };
}
