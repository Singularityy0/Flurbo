import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePerplContext, preparePerplDeposit, PERPL_EXCHANGE, AUSD_TOKEN } from './perpl.ts';
const token = '0x' + '11'.repeat(20);
const context = () => ({ chain: { chain_id: 10143 }, instances: [{ id: 12, address: PERPL_EXCHANGE, collateral_token_id: 1, min_account_open_amount: '100000000' }],
  tokens: [{ id: 1, address: token, decimals: 6, symbol: 'AUSD' }], markets: [{ id: 32, instance_id: 12, symbol: 'ETH', state: { mrk: 234567 }, config: { is_open: true, price_decimals: 2 } }] });
test('reads live testnet context using token ID linkage, not stale README addresses', () => {
  const value = parsePerplContext(context(), token);
  assert.equal(value.minimumDeposit, '100000000'); assert.equal(value.markets[0].symbol, 'ETH');
});
test('refuses mainnet, wrong collateral, unknown exchange, malformed or duplicate markets', () => {
  const mutations = [
    (v: any) => { v.chain.chain_id = 143; }, (v: any) => { v.tokens[0].address = PERPL_EXCHANGE; },
    (v: any) => { v.tokens[0].decimals = 18; }, (v: any) => { v.instances[0].address = token; },
    (v: any) => { v.markets[0].state.mrk = 'secret'; }, (v: any) => { v.markets.push(v.markets[0]); },
  ];
  for (const mutate of mutations) { const value = context(); mutate(value); assert.throws(() => parsePerplContext(value, token)); }
});

test('account setup uses approve then createAccount, never an invented deposit call', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...context(), tokens: [{ id: 1, address: AUSD_TOKEN, decimals: 6, symbol: 'AUSD' }] }) }) as Response;
  let allowance = 0n;
  const owner = '0x' + '22'.repeat(20);
  const provider = { request: async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === 'eth_chainId') return '0x279f';
    if (method === 'eth_getBlockByNumber') return { number: '0x1', hash: '0x' + 'aa'.repeat(32), timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` };
    if (method === 'eth_call') {
      const tx = params?.[0] as { data: string };
      if (tx.data.startsWith('0xdd62ed3e')) return `0x${allowance.toString(16)}`;
      if (tx.data.startsWith('0x')) return '0x0';
    }
    if (method === 'eth_estimateGas') return '0x186a0';
    if (method === 'eth_gasPrice') return '0x1';
    throw new Error(`Unexpected ${method}`);
  } };
  try {
    const approve = await preparePerplDeposit(provider, owner, '100');
    assert.equal(approve.action, 'approve');
    assert.equal(approve.tx.to, AUSD_TOKEN);
    allowance = 100_000_000n;
    const create = await preparePerplDeposit(provider, owner, '100');
    assert.equal(create.action, 'deposit');
    assert.equal(create.tx.to, PERPL_EXCHANGE);
    assert.notEqual(create.tx.data, approve.tx.data);
  } finally { globalThis.fetch = originalFetch; }
});
