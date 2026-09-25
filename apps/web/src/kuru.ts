import { decodeEventLog, decodeFunctionResult, encodeFunctionData, type Hex } from 'viem';
import { appFetch as fetch } from './platform-fetch.ts';
import { kuruAbi, marginAbi, tokenAbi, kuruCall, type Contracts } from '../shared/kuru.mjs';

export type Provider = { request(input: { method: string; params?: unknown[] }): Promise<unknown>; on?(name: string, fn: () => void): void; removeListener?(name: string, fn: () => void): void };
export type State = { environment: string; chain_id: number; contracts: Contracts; trading_available: boolean;
  snapshot: { block_number: number; block_hash: string; timestamp: number; stale: boolean };
  wallet: Record<string, string>; kuru: { best_bid_wad: string | null; best_ask_wad: string | null };
  orders: { id: string; side: string; remaining_atoms: string; price_units: string }[];
  orders_page: { next_before: string | null; through_id: string }; activity: { from_block: number; to_block: number; logs: any[] } };
export type Action = { kind: 'approve' | 'deposit' | 'withdraw' | 'limit-buy' | 'limit-sell' | 'market-buy' | 'market-sell' | 'cancel'; asset: 'cash' | 'receipt'; amount: string; price: string; minOut: string; order: string };
export type Review = { version: 1; owner: string; login: string; contracts: Contracts; action: Action; to: string; data: Hex; expires: number; gas: string; gasPrice: string; netOut: string | null };
export type Pending = { review: Review; nonce: string; hash: string | null; started: number };
export const pendingKey = 'flurbo.kuru.pending.v1';
export const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hex = (n: bigint) => '0x' + n.toString(16);
export function rpcNumber(n: unknown): bigint {
  if (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 || typeof n === 'string' && /^0x[0-9a-f]+$/i.test(n)) return BigInt(n);
  throw new Error('Wallet returned an invalid integer. Reconnect and retry.');
}
export function atoms(input: string): bigint {
  if (!/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,6})?$/.test(input)) throw new Error('Use a positive amount with at most six decimal places.');
  const [whole, fraction = ''] = input.split('.');
  const n = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  if (n <= 0n || n > 100000000n) throw new Error('Use an amount above zero and no more than 100.');
  return n;
}
export async function read(provider: Provider, method: string, params: unknown[] = []): Promise<any> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([provider.request({ method, params }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Wallet read timed out. No automatic retry.')), 20_000); })]); }
  finally { clearTimeout(timer!); }
}
export async function loadState(owner: string, before = ''): Promise<State> {
  const response = await fetch('/api/kuru?' + new URLSearchParams({ wallet: owner, ...(before ? { before } : {}) }), { cache: 'no-store', signal: AbortSignal.timeout(35_000) });
  const state = await response.json();
  if (!response.ok) throw new Error(state.error || 'Kuru reader unavailable.');
  if (state.chain_id !== 10143 || !['public_testnet', 'local_fork'].includes(state.environment) || !same(state.wallet?.address || '', owner) || state.snapshot?.stale) throw new Error('Kuru snapshot is unavailable or stale.');
  return state;
}
export function transaction(action: Action, owner: string, c: Contracts) {
  if (!['approve', 'deposit', 'withdraw', 'limit-buy', 'limit-sell', 'market-buy', 'market-sell', 'cancel'].includes(action.kind) || !['cash', 'receipt'].includes(action.asset)) throw new Error('Unsupported Kuru action.');
  let to = c.market, abi = kuruAbi, name: string, args: unknown[];
  const kind = action.kind;
  if (kind === 'approve') { to = c[action.asset]; abi = tokenAbi; name = 'approve'; args = [c.margin, atoms(action.amount)]; }
  else if (kind === 'deposit' || kind === 'withdraw') { to = c.margin; abi = marginAbi; name = kind; args = kind === 'deposit' ? [owner, c[action.asset], atoms(action.amount)] : [atoms(action.amount), c[action.asset]]; }
  else if (kind === 'cancel') { if (!/^[1-9][0-9]{0,12}$/.test(action.order)) throw new Error('Choose a valid order ID.'); name = 'batchCancelOrders'; args = [[Number(action.order)]]; }
  else if (kind === 'limit-buy' || kind === 'limit-sell') { name = kind === 'limit-buy' ? 'addBuyOrder' : 'addSellOrder'; args = [Number(atoms(action.price)), atoms(action.amount), true]; }
  else { name = kind === 'market-buy' ? 'placeAndExecuteMarketBuy' : 'placeAndExecuteMarketSell'; args = [atoms(action.amount), atoms(action.minOut), true, true]; }
  const data = encodeFunctionData({ abi, functionName: name, args });
  if (!kuruCall({ to, data, account: owner, contracts: c })) throw new Error('Use a price up to 1 AUSD in 0.0001 steps and limit sizes from 0.01 to 100 in 0.01 steps.');
  return { to, data, from: owner, value: '0x0', chainId: '0x279f' };
}
async function identity(provider: Provider, owner: string, state: State) {
  if (rpcNumber(await read(provider, 'eth_chainId')) !== 10143n) throw new Error('Choose Monad testnet in your wallet.');
  const accounts = await read(provider, 'eth_accounts');
  if (!Array.isArray(accounts) || !accounts[0] || !same(accounts[0], owner)) throw new Error('Wallet account changed. Reconnect.');
  const block = await read(provider, 'eth_getBlockByNumber', [hex(BigInt(state.snapshot.block_number)), false]);
  if (!block || !same(block.hash, state.snapshot.block_hash)) throw new Error('Wallet RPC does not match the verified market.');
}
async function simulate(provider: Provider, tx: ReturnType<typeof transaction>, action: Action) {
  const raw = await read(provider, 'eth_call', [tx, 'latest']);
  if (action.kind === 'approve' && decodeFunctionResult({ abi: tokenAbi, functionName: 'approve', data: raw }) !== true) throw new Error('Approval simulation failed.');
  if (action.kind.startsWith('market-')) {
    const result = decodeFunctionResult({ abi: kuruAbi, functionName: action.kind === 'market-buy' ? 'placeAndExecuteMarketBuy' : 'placeAndExecuteMarketSell', data: raw }) as bigint;
    if (result < atoms(action.minOut)) throw new Error('Minimum received cannot be met.');
    return result.toString();
  }
  if (action.kind !== 'approve' && raw !== '0x') throw new Error('Unexpected simulation response.');
  return null;
}
export async function prepare(provider: Provider, action: Action, owner: string, login: string): Promise<Review> {
  const state = await loadState(owner); await identity(provider, owner, state);
  if (action.kind !== 'cancel' && action.kind !== 'approve') {
    const quantity = atoms(action.amount), buy = action.kind.endsWith('-buy');
    const asset = ['deposit', 'withdraw'].includes(action.kind) ? action.asset : buy ? 'cash' : 'receipt';
    const required = action.kind === 'limit-buy' ? (quantity * atoms(action.price) + 999999n) / 1000000n : quantity;
    const key = action.kind === 'deposit' ? asset === 'cash' ? 'ausd_atoms' : 'receipt_atoms'
      : asset === 'cash' ? 'margin_available_ausd_atoms' : 'margin_available_receipt_atoms';
    if (BigInt(state.wallet[key]) < required) throw new Error(action.kind === 'deposit'
      ? `Not enough ${asset === 'cash' ? 'AUSD' : 'H YES receipts'} in this wallet. Fund or convert receipts before depositing.`
      : `Not enough available Kuru ${asset === 'cash' ? 'AUSD' : 'receipts'}. Deposit first, or cancel an unfilled order to release its reserve.`);
  }
  // Approval is its own reviewed transaction, never an automatic prelude to a
  // deposit. The next review rechecks allowance and simulates the deposit itself.
  if (action.kind === 'deposit' && BigInt(state.wallet[action.asset + '_margin_allowance_atoms']) < atoms(action.amount)) action = { ...action, kind: 'approve' };
  if ((action.kind.includes('buy') || action.kind.includes('sell')) && !state.trading_available) throw new Error('Market is closed or unavailable. Deposits, withdrawals and cancellation remain separate.');
  const tx = transaction(action, owner, state.contracts);
  const netOut = await simulate(provider, tx, action);
  const gas = (rpcNumber(await read(provider, 'eth_estimateGas', [tx])) * 120n + 99n) / 100n;
  const gasPrice = rpcNumber(await read(provider, 'eth_gasPrice')) * 2n;
  if (gas <= 0n || gas > 5000000n || gasPrice <= 0n || gasPrice > 500000000000n) throw new Error('Gas exceeds the hosted testnet limit.');
  if (rpcNumber(await read(provider, 'eth_getBalance', [owner, 'latest'])) < gas * gasPrice) throw new Error('Add test MON to this trading wallet for network fees.');
  return { version: 1, owner, login, contracts: state.contracts, action: { ...action }, to: tx.to, data: tx.data, expires: Date.now() + 300000, gas: hex(gas), gasPrice: hex(gasPrice), netOut };
}
export function validateReview(review: Review) {
  const tx = transaction(review.action, review.owner, review.contracts);
  if (review.version !== 1 || !same(tx.to, review.to) || tx.data !== review.data || !Number.isFinite(review.expires) || rpcNumber(review.gas) <= 0n || rpcNumber(review.gas) > 5000000n || rpcNumber(review.gasPrice) <= 0n || rpcNumber(review.gasPrice) > 500000000000n) throw new Error('Invalid saved review.');
  return tx;
}
export async function submit(provider: Provider, review: Review, save: (p: Pending | null) => void, current: () => boolean) {
  const tx = validateReview(review);
  const response = await fetch('/api/auth/session', { cache: 'no-store' });
  const auth = await response.json();
  if (!response.ok || !same(auth.session?.address || '', review.login)) throw new Error('Sign in again before submitting.');
  const state = await loadState(review.owner);
  if (Object.keys(review.contracts).some(k => !same(state.contracts[k as keyof Contracts], review.contracts[k as keyof Contracts]))) throw new Error('Deployment changed. Review again.');
  await identity(provider, review.owner, state);
  if ((review.action.kind.includes('buy') || review.action.kind.includes('sell')) && !state.trading_available) throw new Error('Trading is no longer available.');
  await simulate(provider, tx, review.action);
  if (rpcNumber(await read(provider, 'eth_estimateGas', [tx])) > rpcNumber(review.gas) || rpcNumber(await read(provider, 'eth_gasPrice')) > rpcNumber(review.gasPrice)) throw new Error('Gas changed beyond your review. Review again.');
  if (rpcNumber(await read(provider, 'eth_getBalance', [review.owner, 'latest'])) < rpcNumber(review.gas) * rpcNumber(review.gasPrice)) throw new Error('Add test MON for the reviewed network fee.');
  const nonce = hex(rpcNumber(await read(provider, 'eth_getTransactionCount', [review.owner, 'pending'])));
  await identity(provider, review.owner, state);
  if (!current() || Date.now() >= review.expires) throw new Error('Review changed or expired. Review again.');
  const pending = { review, nonce, hash: null, started: Date.now() };
  save(pending);
  try {
    const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ ...tx, nonce, gas: review.gas, gasPrice: review.gasPrice }] });
    if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Missing hash');
    save({ ...pending, hash: hash.toLowerCase() });
  } catch (error) {
    if ((error as { code?: number }).code === 4001) { save(null); throw new Error('Wallet request declined.'); }
    throw new Error('Submission outcome is unknown. Attach the hash from wallet activity before doing anything else.');
  }
}
export function readPending(storage: Pick<Storage, 'getItem'>): Pending | null {
  const raw = storage.getItem(pendingKey);
  if (!raw) return null;
  if (raw.length > 20000) throw new Error('Saved Kuru tracking is invalid.');
  const p = JSON.parse(raw) as Pending; validateReview(p.review); rpcNumber(p.nonce);
  if (p.hash !== null && !/^0x[0-9a-f]{64}$/i.test(p.hash)) throw new Error('Invalid saved transaction hash.');
  return p;
}
export function events(logs: any[], market: string, owner: string) {
  return logs.flatMap(log => {
    if (log.removed || !same(log.address || '', market)) return [];
    try {
      const decoded = decodeEventLog({ abi: kuruAbi, topics: log.topics, data: log.data, strict: true });
      const a = decoded.args as Record<string, any>;
      if (![a.owner, a.makerAddress, a.takerAddress].some(v => typeof v === 'string' && same(v, owner))) return [];
      return [{ name: decoded.eventName, args: a, hash: log.transactionHash, index: log.logIndex }];
    } catch { return []; }
  });
}
export function matchReceipt(p: Pending, tx: any, receipt: any, canonical: any, head: any) {
  validateReview(p.review);
  const r = p.review, kind = r.action.kind;
  if (!p.hash || !same(tx.hash, p.hash) || !same(receipt.transactionHash, p.hash) || !same(tx.from, r.owner) || !same(receipt.from, r.owner) || !same(tx.to, r.to) || !same(receipt.to, r.to) || !same(tx.input, r.data) || rpcNumber(tx.value) !== 0n || rpcNumber(tx.nonce) !== rpcNumber(p.nonce) || tx.blockHash !== receipt.blockHash || tx.blockNumber !== receipt.blockNumber || canonical?.hash !== receipt.blockHash || tx.chainId && rpcNumber(tx.chainId) !== 10143n) throw new Error('Transaction does not match the saved review. Tracking remains open.');
  if (rpcNumber(head.number) < rpcNumber(receipt.blockNumber) + 1n) return 'confirming';
  if (rpcNumber(receipt.status) === 0n) return 'reverted';
  if (rpcNumber(receipt.status) !== 1n) throw new Error('Invalid receipt status.');
  if (['approve', 'deposit', 'withdraw'].includes(kind)) {
    const asset = r.contracts[r.action.asset];
    const found = receipt.logs.some((log: any) => {
      if (log.removed || !same(log.address, asset)) return false;
      try {
        const e = decodeEventLog({ abi: tokenAbi, ...log, strict: true }); const a = e.args as any;
        return kind === 'approve' ? e.eventName === 'Approval' && same(a.owner, r.owner) && same(a.spender, r.contracts.margin) && a.value === atoms(r.action.amount)
          : e.eventName === 'Transfer' && same(a.from, kind === 'deposit' ? r.owner : r.contracts.margin) && same(a.to, kind === 'deposit' ? r.contracts.margin : r.owner) && a.value === atoms(r.action.amount);
      } catch { return false; }
    });
    if (!found) throw new Error('Expected token event missing. Tracking remains open.');
  } else {
    const found = events(receipt.logs, r.contracts.market, r.owner).some(e => {
      const a = e.args;
      if (kind === 'cancel') return e.name === 'OrderCanceled' && same(a.owner, r.owner) && String(a.orderId) === r.action.order;
      if (kind.startsWith('limit-')) return e.name === 'OrderCreated' && same(a.owner, r.owner) && a.size === atoms(r.action.amount) && BigInt(a.price) === atoms(r.action.price) && a.isBuy === (kind === 'limit-buy');
      return e.name === 'Trade' && same(a.takerAddress, r.owner) && a.filledSize > 0n;
    });
    // Vault fills may omit a regular-order Trade event. Keep tracking open rather
    // than guessing that an unrelated event proves execution.
    if (!found) throw new Error('Expected Kuru event missing. Inspect the receipt before clearing tracking.');
  }
  return 'confirmed';
}
export async function check(provider: Provider, p: Pending) {
  if (!p.hash) throw new Error('Attach your transaction hash first.');
  await identity(provider, p.review.owner, await loadState(p.review.owner));
  const tx = await read(provider, 'eth_getTransactionByHash', [p.hash]);
  const receipt = await read(provider, 'eth_getTransactionReceipt', [p.hash]);
  if (!tx || !receipt) return 'pending';
  return matchReceipt(p, tx, receipt, await read(provider, 'eth_getBlockByNumber', [receipt.blockNumber, false]), await read(provider, 'eth_getBlockByNumber', ['latest', false]));
}
