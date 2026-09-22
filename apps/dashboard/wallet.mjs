// EIP-1193 requests stay in the user's selected wallet. The HTTP API never signs.
import { compileClaim, snapshotFresh } from './claims.mjs';

export const CHAIN_ID = '0x279f';
export const SELECTORS = { buy: '3e6b6cde', sell: 'c39849c5', approve: '095ea7b3' };
const MAX128 = (1n << 128n) - 1n;
export const address = value => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('Invalid wallet or contract address.');
  return value.toLowerCase();
};
export const hex = value => '0x' + BigInt(value).toString(16);
const word = value => {
  const n = BigInt(value);
  if (n < 0n || n >= 1n << 256n) throw new Error('ABI value is outside uint256.');
  return n.toString(16).padStart(64, '0');
};
export const encode = (selector, ...args) => '0x' + selector + args.map(word).join('');
export class WalletError extends Error {}
export function walletMessage(error) {
  if (error?.code === 4001) return 'You rejected the wallet request. Nothing was submitted by this request.';
  if (error?.code === -32002) return 'A request is already open in your wallet. Complete or reject it there.';
  if (error?.code === 4100) return 'The wallet has not authorized this account. Reconnect it.';
  if ([4900, 4901].includes(error?.code)) return 'The wallet is disconnected from the required local network.';
  return error instanceof WalletError ? error.message : 'Wallet request failed. Check the wallet and its local RPC connection; remote details are withheld.';
}

export function boundFor(quote, bps) {
  if (!Number.isInteger(bps) || bps < 0 || bps > 500) throw new WalletError('Choose slippage from 0% to 5%.');
  const price = BigInt(quote.collateral_atoms), qty = BigInt(quote.quantity_atoms);
  if (price <= 0n || price > qty || qty > MAX128) throw new WalletError('Quote amounts are outside supported bounds.');
  if (quote.side === 'buy') {
    const upper = (price * BigInt(10000 + bps) + 9999n) / 10000n;
    return upper > qty ? qty : upper;
  }
  if (quote.side !== 'sell') throw new WalletError('Unsupported quote direction.');
  const lower = price * BigInt(10000 - bps) / 10000n;
  if (lower === 0n) throw new WalletError('The minimum proceeds would round to zero. Increase quantity or reduce slippage.');
  return lower;
}

export function makePlan(snapshot, quoted, account, bps, now = Date.now() / 1000) {
  account = address(account);
  if (snapshot.environment !== 'local_fork' || quoted.environment !== 'local_fork' || snapshot.chain_id !== 10143 || quoted.chain_id !== 10143) {
    throw new WalletError('This transaction phase supports only the verified local fork.');
  }
  if (!snapshotFresh(snapshot.snapshot, now) || !snapshotFresh(quoted.snapshot, now) || !snapshot.trading_available || !quoted.quote || now >= quoted.quote.valid_until) {
    throw new WalletError('The quote or pool state expired. Refresh and request a new quote.');
  }
  const q = quoted.quote;
  const legs = Array.from({ length: 8 }, (_, index) => ({ index, yes: true })).filter(l => q.scope & (1 << l.index));
  const canonical = compileClaim(legs, 'custom', q.mask);
  if (canonical.scope !== q.scope) throw new WalletError('Unsupported claim scope.');
  const w = snapshot.wallet;
  if (!w || address(w.address) !== account) throw new WalletError('Load the connected wallet balances before reviewing.');
  const limit = boundFor(q, bps);
  const pool = address(snapshot.contracts.pool), cash = address(snapshot.contracts.cash);
  let kind = q.side, approval;
  if (kind === 'buy') {
    if (BigInt(w.ausd_atoms) < limit) throw new WalletError('Not enough local test AUSD for the maximum buy cost.');
    if (BigInt(w.pool_allowance_atoms) < limit) {
      kind = 'approve';
      approval = BigInt(w.pool_allowance_atoms) > 0n ? 0n : limit;
    }
  } else {
    const holding = w.positions.find(p => p.scope === q.scope && p.mask === q.mask);
    if (!holding || BigInt(holding.quantity_atoms) < BigInt(q.quantity_atoms)) throw new WalletError('Not enough internal pool units to sell this claim. Wrapped receipts must be unwrapped separately.');
  }
  const deadline = Math.min(Math.floor(now) + 180, snapshot.cluster.closes_at - 1);
  if (deadline <= now) throw new WalletError('The market is closing.');
  const input = kind === 'approve' ? encode(SELECTORS.approve, pool, approval)
    : encode(SELECTORS[kind], q.scope, q.mask, q.quantity_atoms, limit, deadline);
  return {
    kind, account, pool, cash, scope: q.scope, mask: q.mask, quantity: q.quantity_atoms,
    limit: limit.toString(), approval: approval?.toString(), deadline,
    quoteExpiry: q.valid_until, quoteSnapshot: quoted.snapshot, bps,
    tx: { from: account, to: kind === 'approve' ? cash : pool, data: input, value: '0x0', chainId: CHAIN_ID },
  };
}

export async function assertContext(provider, snapshot, account) {
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!Array.isArray(accounts) || !accounts.length || address(accounts[0]) !== address(account)) throw new WalletError('Wallet account changed. Reconnect and review again.');
  const chain = await provider.request({ method: 'eth_chainId' });
  if (BigInt(chain) !== 10143n) throw new WalletError('Select the local Monad fork (chain 10143, RPC http://127.0.0.1:18545) in your wallet.');
  if (snapshot.environment !== 'local_fork' || snapshot.chain_id !== 10143 || !snapshotFresh(snapshot.snapshot)) throw new WalletError('A fresh local deployment snapshot is required.');
  const block = await provider.request({ method: 'eth_getBlockByNumber', params: [hex(snapshot.snapshot.block_number), false] });
  if (!block || block.hash?.toLowerCase() !== snapshot.snapshot.block_hash.toLowerCase()) {
    throw new WalletError('Wallet RPC does not match this local fork. Public Monad testnet has the same chain ID; choose RPC http://127.0.0.1:18545 manually.');
  }
}

export async function simulate(provider, plan) {
  const output = await provider.request({ method: 'eth_call', params: [plan.tx, 'latest'] });
  if (!/^0x[0-9a-fA-F]{64}$/.test(output)) throw new WalletError('Unexpected contract simulation result.');
  const amount = BigInt(output);
  if (plan.kind === 'approve' ? amount !== 1n : plan.kind === 'buy' ? amount > BigInt(plan.limit) : amount < BigInt(plan.limit)) {
    throw new WalletError('Simulation did not satisfy the reviewed approval or price limit.');
  }
}

export async function prepare(provider, snapshot, quoted, account, bps) {
  const plan = makePlan(snapshot, quoted, account, bps);
  await assertContext(provider, snapshot, account);
  await simulate(provider, plan);
  const estimate = BigInt(await provider.request({ method: 'eth_estimateGas', params: [plan.tx] }));
  const gas = (estimate * 120n + 99n) / 100n;
  const gasPrice = BigInt(await provider.request({ method: 'eth_gasPrice' })) * 2n;
  if (gas <= 0n || gas > 30000000n || gasPrice <= 0n) throw new WalletError('Gas estimate is outside the local test limits.');
  if (BigInt(snapshot.wallet.native_balance_wei) < gas * gasPrice) throw new WalletError('Not enough local MON for the reviewed gas budget.');
  plan.tx.gas = hex(gas); plan.tx.gasPrice = hex(gasPrice);
  plan.gasBudget = (gas * gasPrice).toString();
  if (Date.now() / 1000 >= plan.quoteExpiry) throw new WalletError('Quote expired during review. Request a new quote.');
  return plan;
}

export async function sendReviewed(provider, plan, snapshot, stillCurrent = () => true, onSubmit = () => {}) {
  const guard = () => {
    if (!stillCurrent()) throw new WalletError('Inputs or wallet changed. Review again.');
    if (!snapshot.trading_available || Date.now() / 1000 >= plan.quoteExpiry) throw new WalletError('Review expired. Request a new quote.');
    if (address(snapshot.contracts.pool) !== plan.pool || address(snapshot.contracts.cash) !== plan.cash) throw new WalletError('Deployment changed. Review again.');
  };
  guard(); await assertContext(provider, snapshot, plan.account); guard();
  // Repeat simulation immediately before opening the wallet; bounds and deadline stay unchanged.
  await simulate(provider, plan);
  await assertContext(provider, snapshot, plan.account); guard();
  onSubmit();
  return provider.request({ method: 'eth_sendTransaction', params: [{ ...plan.tx }] });
}

export function reconcile(plan, tx) {
  if (!['succeeded', 'reverted'].includes(tx.status)) return 'pending';
  if (tx.sender !== plan.account || tx.to !== plan.tx.to || tx.input !== plan.tx.data || tx.value_wei !== '0') return 'mismatch';
  if (tx.status === 'reverted') return 'reverted';
  const matches = (tx.events || []).filter(event => plan.kind === 'approve'
    ? event.kind === 'approval' && event.owner === plan.account && event.spender === plan.pool && event.amount_atoms === plan.approval
    : event.kind === 'trade' && event.trader === plan.account && event.scope === plan.scope && event.mask === String(plan.mask) && event.is_buy === (plan.kind === 'buy') && event.quantity_atoms === plan.quantity &&
      (plan.kind === 'buy' ? BigInt(event.collateral_atoms) <= BigInt(plan.limit) : BigInt(event.collateral_atoms) >= BigInt(plan.limit)));
  return matches.length === 1 ? 'matched' : 'mismatch';
}
