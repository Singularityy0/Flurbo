import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, prepare, makeRedemptionPlan, prepareRedemption, assertContext, sendReviewed, reconcile, setupLocalWallet, encode, boundFor, walletMessage } from './wallet.mjs';

const ACCOUNT = '0x' + '11'.repeat(20), POOL = '0x' + '22'.repeat(20), CASH = '0x' + '33'.repeat(20);
function settled() {
  const f = fixture();
  f.snapshot.redemption_available = true; f.snapshot.trading_available = false;
  f.snapshot.pool = { resolved: true, resolved_state: 129, covered: true, receipt_backed: true };
  f.snapshot.wallet.positions = [{ scope: 129, mask: 8, quantity_atoms: '1000000' }, { scope: 129, mask: 1, quantity_atoms: '1000000' }];
  return f;
}
test('redemption projects sparse scopes, supports partial winners and zero-payout losers without approval', async () => {
  for (const [mask, payout] of [[8, '500000'], [1, '0']]) {
    const f = settled(); f.overrides.eth_call = () => encode('', payout);
    const plan = await prepareRedemption(f.provider, f.snapshot, { scope: 129, mask }, ACCOUNT, '500000');
    assert.equal(plan.kind, 'redeem'); assert.equal(plan.payout, payout);
    assert.equal(plan.tx.data, encode('df992423', 129, mask, 500000));
    await sendReviewed(f.provider, plan, f.snapshot);
    assert.equal(f.calls.filter(c => c.method === 'eth_sendTransaction').length, 1);
    const tx = { status: 'succeeded', sender: ACCOUNT, to: POOL, input: plan.tx.data, value_wei: '0', events: [
      { kind: 'redemption', owner: ACCOUNT, scope: 129, mask: String(mask), quantity_atoms: '500000', collateral_atoms: payout }] };
    assert.equal(reconcile(plan, tx), 'matched');
    tx.events[0].collateral_atoms = '1'; assert.equal(reconcile(plan, tx), 'mismatch');
    tx.events[0].collateral_atoms = payout; tx.events.push({ ...tx.events[0] }); assert.equal(reconcile(plan, tx), 'mismatch');
  }
});
test('redemption rejects stale unresolved shortfall wrong-owner and excessive quantities, and rechecks outcome', async () => {
  for (const change of [f => f.snapshot.pool.resolved = false, f => f.snapshot.pool.covered = false,
    f => f.snapshot.pool.receipt_backed = false, f => f.snapshot.snapshot.stale = true,
    f => f.snapshot.wallet.address = CASH, f => f.snapshot.wallet.positions = [], f => f.snapshot.environment = 'public_testnet']) {
    const f = settled(); change(f);
    assert.throws(() => makeRedemptionPlan(f.snapshot, { scope: 129, mask: 8 }, ACCOUNT, '500000'));
  }
  const f = settled();
  for (const quantity of ['0', '-1', '1000001']) assert.throws(() => makeRedemptionPlan(f.snapshot, { scope: 129, mask: 8 }, ACCOUNT, quantity));
  f.overrides.eth_call = () => encode('', 1);
  await assert.rejects(prepareRedemption(f.provider, f.snapshot, { scope: 129, mask: 8 }, ACCOUNT, '500000'), /Simulation/);
  f.overrides.eth_call = () => encode('', 500000);
  const plan = await prepareRedemption(f.provider, f.snapshot, { scope: 129, mask: 8 }, ACCOUNT, '500000');
  f.snapshot.pool.resolved_state = 0;
  await assert.rejects(sendReviewed(f.provider, plan, f.snapshot), /Settlement changed/);
  assert.equal(f.calls.some(c => c.method === 'eth_sendTransaction'), false);
});
function fixture() {
  const now = Math.floor(Date.now() / 1000);
  const snapshot = { environment: 'local_fork', chain_id: 10143, snapshot: { timestamp: now, stale: false, block_number: 100, block_hash: '0x' + 'aa'.repeat(32) },
    trading_available: true, contracts: { pool: POOL, cash: CASH }, cluster: { closes_at: now + 1000 },
    wallet: { address: ACCOUNT, ausd_atoms: '10000000', native_balance_wei: '1000000000000000000', pool_allowance_atoms: '1000000', positions: [{ scope: 3, mask: 8, quantity_atoms: '1000000' }] } };
  const quoted = { environment: 'local_fork', chain_id: 10143, snapshot: { ...snapshot.snapshot }, quote: { side: 'buy', scope: 3, mask: 8, quantity_atoms: '1000000', collateral_atoms: '250001', valid_until: now + 30 } };
  const calls = [], overrides = {};
  const provider = { async request({ method, params }) {
    calls.push({ method, params });
    if (overrides[method]) return overrides[method](params);
    return { eth_accounts: [ACCOUNT], eth_chainId: '0x279f', eth_getBlockByNumber: { hash: snapshot.snapshot.block_hash },
      eth_call: '0x' + BigInt(250001).toString(16).padStart(64, '0'), eth_estimateGas: '0x186a0', eth_gasPrice: '0x3b9aca00', eth_sendTransaction: '0x' + '55'.repeat(32) }[method];
  } };
  return { snapshot, quoted, provider, calls, overrides };
}

test('buy calldata uses factored scope/mask, capped integer slippage and contract deadline', () => {
  const { snapshot, quoted } = fixture();
  const p = makePlan(snapshot, quoted, ACCOUNT, 50, snapshot.snapshot.timestamp);
  assert.equal(p.limit, '251252'); assert.equal(p.kind, 'buy');
  assert.equal(p.tx.data, encode('3e6b6cde', 3, 8, 1000000, 251252, p.deadline));
  assert.equal(p.tx.chainId, '0x279f'); assert.equal(p.tx.value, '0x0');
  assert.equal(p.deadline, snapshot.snapshot.timestamp + 180);
  assert.equal(boundFor({ ...quoted.quote, collateral_atoms: '1000000' }, 500), 1000000n);
});

test('automatic setup requests exact local network configuration and funds only after fork verification', async () => {
  const f = fixture(); let switched = false, funded = false;
  f.overrides.eth_requestAccounts = () => [ACCOUNT];
  f.overrides.eth_getBlockByNumber = () => ({ hash: switched ? f.snapshot.snapshot.block_hash : '0x' + 'bb'.repeat(32) });
  f.overrides.wallet_addEthereumChain = params => {
    assert.equal(params[0].chainId, '0x279f'); assert.deepEqual(params[0].rpcUrls, ['http://127.0.0.1:18545']); return null;
  };
  f.overrides.wallet_switchEthereumChain = () => { switched = true; return null; };
  const owner = await setupLocalWallet(f.provider, {
    readHealth: async () => ({ local_wallet_setup: true }), readSnapshot: async () => f.snapshot,
    fundLocal: async candidate => { assert.equal(candidate, ACCOUNT); assert.equal(switched, true); funded = true; f.snapshot.wallet.native_balance_wei = '10000000000000000000'; },
  });
  assert.equal(owner, ACCOUNT); assert.equal(funded, true);
  assert.equal(f.calls.some(c => c.method === 'eth_sendTransaction'), false);
});
test('setup never funds on rejected prompts, unchanged public RPC, or changed account', async () => {
  for (const reason of ['rejected', 'wrong_fork', 'account_changed', 'disabled']) {
    const f = fixture(); let funded = false;
    f.overrides.eth_requestAccounts = () => [ACCOUNT];
    f.overrides.eth_getBlockByNumber = () => ({ hash: '0x' + 'bb'.repeat(32) });
    f.overrides.wallet_addEthereumChain = () => { if (reason === 'rejected') throw Object.assign(new Error(), { code: 4001 }); return null; };
    f.overrides.wallet_switchEthereumChain = () => { if (reason === 'account_changed') f.overrides.eth_accounts = () => [CASH]; return null; };
    await assert.rejects(setupLocalWallet(f.provider, { readHealth: async () => ({ local_wallet_setup: reason !== 'disabled' }),
      readSnapshot: async () => f.snapshot, fundLocal: async () => { funded = true; } }));
    assert.equal(funded, false);
    if (reason === 'disabled') assert.equal(f.calls.length, 0);
  }
});
test('approvals are exact and a nonzero insufficient allowance is reset in a separate transaction', () => {
  const { snapshot, quoted } = fixture(); snapshot.wallet.pool_allowance_atoms = '0';
  const p = makePlan(snapshot, quoted, ACCOUNT, 50);
  assert.equal(p.kind, 'approve'); assert.equal(p.approval, '251252'); assert.equal(p.tx.to, CASH);
  assert.equal(p.tx.data, encode('095ea7b3', POOL, 251252));
  snapshot.wallet.pool_allowance_atoms = '1';
  assert.equal(makePlan(snapshot, quoted, ACCOUNT, 50).approval, '0');
});
test('sell floors proceeds and requires the precise internal claim holding', () => {
  const { snapshot, quoted } = fixture(); quoted.quote.side = 'sell';
  const p = makePlan(snapshot, quoted, ACCOUNT, 50);
  assert.equal(p.kind, 'sell'); assert.equal(p.limit, '248750');
  assert.equal(p.tx.data.slice(0, 10), '0xc39849c5');
  snapshot.wallet.positions[0].mask = 7;
  assert.throws(() => makePlan(snapshot, quoted, ACCOUNT, 50), /internal pool units/);
  assert.throws(() => boundFor({ ...quoted.quote, collateral_atoms: '1' }, 500), /zero/);
});
test('stale, closed, wrong account, unfunded and public manifests cannot produce a transaction', () => {
  for (const change of [
    f => { f.snapshot.environment = 'public_testnet'; }, f => { f.quoted.environment = 'public_testnet'; },
    f => { f.snapshot.trading_available = false; }, f => { f.snapshot.snapshot.stale = true; },
    f => { f.quoted.quote.valid_until = 0; }, f => { f.snapshot.wallet.address = CASH; },
    f => { f.snapshot.wallet.ausd_atoms = '0'; }, f => { f.quoted.quote.scope = 15; },
  ]) { const f = fixture(); change(f); assert.throws(() => makePlan(f.snapshot, f.quoted, ACCOUNT, 50)); }
});
test('chain ID alone cannot authorize the public network or another fork', async () => {
  const f = fixture(); f.overrides.eth_getBlockByNumber = () => ({ hash: '0x' + 'bb'.repeat(32) });
  await assert.rejects(assertContext(f.provider, f.snapshot, ACCOUNT), /same chain ID/);
  assert.equal(f.calls.some(c => c.method === 'eth_sendTransaction'), false);
});
test('account and chain mismatches stop before simulation or submission', async () => {
  for (const [method, value] of [['eth_accounts', [CASH]], ['eth_chainId', '0x1']]) {
    const f = fixture(); f.overrides[method] = () => value;
    await assert.rejects(assertContext(f.provider, f.snapshot, ACCOUNT));
    assert.equal(f.calls.some(c => c.method === 'eth_sendTransaction'), false);
  }
});
test('review simulates, pads gas, fixes a fee budget, and never submits', async () => {
  const f = fixture(); const p = await prepare(f.provider, f.snapshot, f.quoted, ACCOUNT, 50);
  assert.equal(BigInt(p.tx.gas), 120000n); assert.equal(BigInt(p.tx.gasPrice), 2000000000n);
  assert.equal(p.gasBudget, '240000000000000');
  assert.equal(f.calls.some(c => c.method === 'eth_sendTransaction'), false);
  f.snapshot.wallet.native_balance_wei = '0';
  await assert.rejects(prepare(f.provider, f.snapshot, f.quoted, ACCOUNT, 50), /local MON/);
});
test('confirmation rechecks context and simulation and sends exactly the reviewed fields once', async () => {
  const f = fixture(); const p = await prepare(f.provider, f.snapshot, f.quoted, ACCOUNT, 50);
  let recorded = false;
  await sendReviewed(f.provider, p, f.snapshot, () => true, () => { recorded = true; });
  assert.equal(recorded, true);
  assert.deepEqual(f.calls.filter(c => c.method === 'eth_sendTransaction'), [{ method: 'eth_sendTransaction', params: [p.tx] }]);
});
test('changed inputs during preflight, expired reviews and failed simulations cannot send', async () => {
  const f = fixture(); const p = makePlan(f.snapshot, f.quoted, ACCOUNT, 50);
  let current = true;
  f.overrides.eth_call = () => { current = false; return '0x' + (250001).toString(16).padStart(64, '0'); };
  await assert.rejects(sendReviewed(f.provider, p, f.snapshot, () => current), /changed/);
  p.quoteExpiry = 0;
  await assert.rejects(sendReviewed(f.provider, p, f.snapshot), /expired/);
  assert.equal(f.calls.some(c => c.method === 'eth_sendTransaction'), false);
});
test('rejected wallet submission is never retried', async () => {
  const f = fixture(); const p = makePlan(f.snapshot, f.quoted, ACCOUNT, 50);
  f.overrides.eth_sendTransaction = () => { throw Object.assign(new Error(), { code: 4001 }); };
  await assert.rejects(sendReviewed(f.provider, p, f.snapshot), { code: 4001 });
  assert.equal(f.calls.filter(c => c.method === 'eth_sendTransaction').length, 1);
  assert.match(walletMessage({ code: 4001 }), /rejected/);
});
test('receipt success must match exact input, sender, target, zero value and one bounded trade event', () => {
  const f = fixture(), p = makePlan(f.snapshot, f.quoted, ACCOUNT, 50);
  const event = { kind: 'trade', trader: ACCOUNT, scope: 3, mask: '8', is_buy: true, quantity_atoms: '1000000', collateral_atoms: '250001' };
  const tx = { status: 'succeeded', sender: ACCOUNT, to: POOL, input: p.tx.data, value_wei: '0', events: [event] };
  assert.equal(reconcile(p, tx), 'matched');
  for (const bad of [{ sender: CASH }, { to: CASH }, { input: '0x' }, { value_wei: '1' }, { events: [] }, { events: [event, event] }, { events: [{ ...event, collateral_atoms: '999999' }] }]) assert.equal(reconcile(p, { ...tx, ...bad }), 'mismatch');
  assert.equal(reconcile(p, { ...tx, status: 'reverted', events: [] }), 'reverted');
  assert.equal(reconcile(p, { status: 'unknown' }), 'pending');
});
