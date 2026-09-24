import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, encodeFunctionResult, parseAbiParameters } from 'viem';
import { kuruAbi, marginAbi, tokenAbi, kuruCall } from '../shared/kuru.mjs';
import { atoms, transaction, prepare, submit, matchReceipt, readPending, pendingKey, type Action, type Review, type Pending } from '../src/kuru.ts';

const addr = (n: number) => '0x' + n.toString(16).padStart(40, '0');
const contracts = { pool: addr(1), cash: addr(2), receipt: addr(3), margin: addr(4), market: addr(5) };
const owner = addr(6), hash = '0x' + 'aa'.repeat(32), blockHash = '0x' + 'bb'.repeat(32);
const action: Action = { kind: 'limit-buy', asset: 'cash', amount: '1', price: '0.45', minOut: '0.4', order: '8' };
const state = { chain_id: 10143, environment: 'public_testnet', contracts, trading_available: true, wallet: { address: owner, ausd_atoms: '10000000', receipt_atoms: '10000000', margin_available_ausd_atoms: '10000000', margin_available_receipt_atoms: '10000000' }, snapshot: { block_number: 100, block_hash: blockHash, stale: false } };
const fixture = (a = action): Review => { const tx = transaction(a, owner, contracts); return { version: 1, owner, login: owner, contracts, action: a, to: tx.to, data: tx.data, expires: Date.now() + 300000, gas: '0x249f0', gasPrice: '0x77359400', netOut: null }; };
function wallet() {
  let sends = 0; const flags = { nonce: 121 as unknown, ambiguous: false, reject: false, changed: false, gas: '0x186a0' };
  const provider = { async request({ method }: any) {
    if (method === 'eth_chainId') return '0x279f';
    if (method === 'eth_accounts') return [flags.changed ? addr(7) : owner];
    if (method === 'eth_getBlockByNumber') return { hash: blockHash };
    if (method === 'eth_call') return '0x';
    if (method === 'eth_estimateGas') return flags.gas;
    if (method === 'eth_gasPrice') return '0x3b9aca00';
    if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
    if (method === 'eth_getTransactionCount') return flags.nonce;
    assert.equal(method, 'eth_sendTransaction'); sends++;
    if (flags.reject) throw { code: 4001 };
    if (flags.ambiguous) throw Error('unknown');
    return hash;
  } };
  return { provider, flags, sends: () => sends };
}
async function withReads(fn: () => Promise<void>) { const original = globalThis.fetch; globalThis.fetch = async input => Response.json(String(input).includes('/auth/') ? { session: { address: owner } } : state); try { await fn(); } finally { globalThis.fetch = original; } }

test('all hosted Kuru actions use exact canonical calldata, limited assets and fixed flags', () => {
  for (const kind of ['approve', 'deposit', 'withdraw', 'limit-buy', 'limit-sell', 'market-buy', 'market-sell', 'cancel'] as const) {
    const tx = transaction({ ...action, kind }, owner, contracts);
    assert.ok(kuruCall({ ...tx, account: owner, contracts }), kind);
    assert.equal(kuruCall({ ...tx, data: tx.data + '00', account: owner, contracts }), null);
  }
  for (const amount of ['0', '-1', '1e2', '0.0000001', '100.000001']) assert.throws(() => atoms(amount));
  for (const price of ['0.450001', '1.01']) assert.throws(() => transaction({ ...action, price }, owner, contracts));
  assert.throws(() => transaction({ ...action, amount: '0.001' }, owner, contracts));
  const call = (abi: any, name: string, args: any[], to = contracts.market) => kuruCall({ to, data: encodeFunctionData({ abi, functionName: name, args }), account: owner, contracts });
  assert.equal(call(kuruAbi, 'addBuyOrder', [450000, 1000000n, false]), null);
  assert.equal(call(kuruAbi, 'placeAndExecuteMarketBuy', [1000000n, 0n, true, true]), null);
  assert.equal(call(kuruAbi, 'placeAndExecuteMarketBuy', [1000000n, 1n, false, true]), null);
  assert.equal(call(kuruAbi, 'placeAndExecuteMarketSell', [1000000n, 1n, true, false]), null);
  assert.equal(call(marginAbi, 'deposit', [addr(7), contracts.cash, 1n], contracts.margin), null);
  assert.equal(call(marginAbi, 'withdraw', [1n, addr(7)], contracts.margin), null);
  assert.equal(call(tokenAbi, 'approve', [addr(7), 1n], contracts.cash), null);
  assert.equal(call(tokenAbi, 'approve', [contracts.margin, 2n ** 256n - 1n], contracts.cash), null);
});

test('review never submits; confirmation saves tracking first and preserves numeric nonce', () => withReads(async () => {
  const w = wallet(), saved: (Pending | null)[] = [];
  const review = await prepare(w.provider, action, owner, owner); assert.equal(w.sends(), 0);
  await submit(w.provider, review, p => { if (!saved.length) assert.equal(w.sends(), 0); saved.push(p); }, () => true);
  assert.equal(w.sends(), 1); assert.equal(saved[0]!.nonce, '0x79'); assert.equal(saved[0]!.hash, null); assert.equal(saved[1]!.hash, hash);
  assert.deepEqual(readPending({ getItem: key => key === pendingKey ? JSON.stringify(saved[1]) : null }), saved[1]);
}));

test('changed account, expired review, gas, unsafe nonce and storage failure block submission', () => withReads(async () => {
  for (const mode of ['account', 'expired', 'gas', 'nonce', 'storage', 'invalidated']) {
    const w = wallet(), r = fixture();
    if (mode === 'account') w.flags.changed = true;
    if (mode === 'expired') r.expires = Date.now() - 1;
    if (mode === 'gas') w.flags.gas = '0xffffff';
    if (mode === 'nonce') w.flags.nonce = Number.MAX_SAFE_INTEGER + 1;
    await assert.rejects(submit(w.provider, r, () => { if (mode === 'storage') throw Error('quota'); }, () => mode !== 'invalidated'));
    assert.equal(w.sends(), 0, mode);
  }
}));

test('unknown outcomes remain tracked; only explicit wallet rejection clears pending', () => withReads(async () => {
  for (const reject of [false, true]) {
    const w = wallet(), saved: (Pending | null)[] = []; w.flags.reject = reject; w.flags.ambiguous = !reject;
    await assert.rejects(submit(w.provider, fixture(), p => saved.push(p), () => true));
    assert.equal(w.sends(), 1); assert.equal(saved.at(-1) === null, reject);
  }
}));

test('receipt verification requires exact transaction, canonical block and matching Kuru order event', () => {
  const r = fixture(), p = { review: r, nonce: '0x79', hash, started: Date.now() };
  const tx = { hash, from: owner, to: r.to, input: r.data, value: '0x0', nonce: '0x79', chainId: '0x279f', blockHash, blockNumber: '0x64' };
  const log = { address: contracts.market, topics: encodeEventTopics({ abi: kuruAbi, eventName: 'OrderCreated' }), data: encodeAbiParameters(parseAbiParameters('uint40,address,uint96,uint32,bool'), [8, owner as any, 1000000n, 450000, true]) };
  const receipt = { ...tx, transactionHash: hash, status: '0x1', logs: [log] };
  assert.equal(matchReceipt(p, tx, receipt, { hash: blockHash }, { number: '0x64' }), 'confirming');
  assert.equal(matchReceipt(p, tx, receipt, { hash: blockHash }, { number: '0x65' }), 'confirmed');
  for (const bad of [{ nonce: '0x80' }, { input: '0x' }, { from: addr(7) }, { to: addr(8) }]) assert.throws(() => matchReceipt(p, { ...tx, ...bad }, receipt, { hash: blockHash }, { number: '0x65' }));
  assert.throws(() => matchReceipt(p, tx, receipt, { hash }, { number: '0x65' }));
  assert.throws(() => matchReceipt(p, tx, { ...receipt, logs: [{ ...log, address: contracts.pool }] }, { hash: blockHash }, { number: '0x65' }));
  assert.equal(matchReceipt(p, tx, { ...receipt, status: '0x0', logs: [] }, { hash: blockHash }, { number: '0x65' }), 'reverted');
});

test('market simulation enforces net minimum received after venue fees', () => withReads(async () => {
  const w = wallet(), request = w.provider.request.bind(w.provider);
  w.provider.request = async input => input.method === 'eth_call' ? encodeFunctionResult({ abi: kuruAbi, functionName: 'placeAndExecuteMarketBuy', result: 997000n }) : request(input);
  const r = await prepare(w.provider, { ...action, kind: 'market-buy', amount: '0.5', minOut: '0.99' }, owner, owner);
  assert.equal(r.netOut, '997000'); assert.equal(w.sends(), 0);
  await assert.rejects(prepare(w.provider, { ...action, kind: 'market-buy', minOut: '1' }, owner, owner));
}));

test('deposit review offers only the exact missing approval and never chains a deposit', () => withReads(async () => {
  const w = wallet(), request = w.provider.request.bind(w.provider);
  (state.wallet as any).cash_margin_allowance_atoms = '0';
  w.provider.request = async input => input.method === 'eth_call' ? encodeFunctionResult({ abi: tokenAbi, functionName: 'approve', result: true }) : request(input);
  const approval = await prepare(w.provider, { ...action, kind: 'deposit' }, owner, owner);
  assert.equal(approval.action.kind, 'approve'); assert.equal(approval.action.amount, '1');
  await submit(w.provider, approval, () => {}, () => true); assert.equal(w.sends(), 1);
  (state.wallet as any).cash_margin_allowance_atoms = '1000000';
  w.provider.request = request;
  const deposit = await prepare(w.provider, { ...action, kind: 'deposit' }, owner, owner);
  assert.equal(deposit.action.kind, 'deposit'); assert.equal(w.sends(), 1);
}));

test('deposit, withdrawal, approval, fill and cancellation require the right asset and actor event', () => {
  for (const kind of ['approve', 'deposit', 'withdraw', 'market-buy', 'cancel'] as const) {
    const r = fixture({ ...action, kind }), p = { review: r, nonce: '0x79', hash, started: Date.now() };
    const tx = { hash, from: owner, to: r.to, input: r.data, value: '0x0', nonce: '0x79', chainId: '0x279f', blockHash, blockNumber: '0x64' };
    const [abi, eventName, types, values, address] = kind === 'approve'
      ? [tokenAbi, 'Approval', 'uint256', [1000000n], contracts.cash]
      : ['deposit', 'withdraw'].includes(kind) ? [tokenAbi, 'Transfer', 'uint256', [1000000n], contracts.cash]
      : kind === 'cancel' ? [kuruAbi, 'OrderCanceled', 'uint40,address,uint32,uint96,bool', [8, owner, 450000, 1000000n, true], contracts.market]
      : [kuruAbi, 'Trade', 'uint40,address,bool,uint256,uint96,address,address,uint96', [8, addr(9), true, 500000000000000000n, 1000000n, owner, owner, 1000000n], contracts.market];
    const indexed = kind === 'approve' ? { owner, spender: contracts.margin } : kind === 'deposit' ? { from: owner, to: contracts.margin } : kind === 'withdraw' ? { from: contracts.margin, to: owner } : {};
    const log = { address, topics: encodeEventTopics({ abi: abi as any, eventName: eventName as any, args: indexed as any }), data: encodeAbiParameters(parseAbiParameters(types as string), values as any) };
    const receipt = { ...tx, transactionHash: hash, status: '0x1', logs: [log] };
    assert.equal(matchReceipt(p, tx, receipt, { hash: blockHash }, { number: '0x65' }), 'confirmed', kind);
    assert.throws(() => matchReceipt(p, tx, { ...receipt, logs: [{ ...log, address: addr(99) }] }, { hash: blockHash }, { number: '0x65' }), kind);
  }
});
