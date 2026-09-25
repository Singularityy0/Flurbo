import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { privateKeyToAccount } from 'viem/accounts';
import { parseTransaction } from 'viem';
import { productionServer } from '../server/production.mjs';
import { TESTNET } from '../server/network.mjs';
import { transaction, type Action } from '../src/kuru.ts';
import { AuthController } from '../src/auth/controller.ts';
import { authPolicy } from '../src/auth/policy.ts';
import { meraProvider } from '../src/auth/mera-provider.ts';

const c = { pool: '0x' + '22'.repeat(20), cash: TESTNET.cash, receipt: '0x' + '33'.repeat(20), margin: '0x' + '44'.repeat(20), market: '0x' + '55'.repeat(20) };
const action: Action = { kind: 'deposit', asset: 'cash', amount: '1', price: '0.45', minOut: '0.4', order: '1' };
test('hosted Kuru reads require login and Mera raw submission is disabled', async () => {
  const origin = 'https://flurbo.singu.online', signer = privateKeyToAccount(('0x' + '11'.repeat(32)) as `0x${string}`);
  const store = { read: async (id: string) => id === 'fixture' ? { address: signer.address.toLowerCase(), method: 'passkey' } : null };
  const server = productionServer({ testingOperatorAccount:signer.address.toLowerCase(), origin, rpcUrl: TESTNET.rpc, learningDashboardUrl: 'http://127.0.0.1:18768' }, store);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const original = globalThis.fetch; let writes = 0;
  globalThis.fetch = async input => {
    if (String(input) === TESTNET.rpc) { writes++; return Response.json({ result: '0x' + 'ab'.repeat(32) }); }
    return Response.json({ environment: 'public_testnet', chain_id: 10143, contracts: c });
  };
  const request = (path: string, body?: any, login = true): Promise<number> => new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method: body ? 'POST' : 'GET', headers: { Host: 'flurbo.singu.online', Origin: origin, Cookie: login ? 'flurbo_session=fixture' : '', 'Content-Type': 'application/json' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  async function send(a: Action, account = signer.address, market = 'original') {
    const tx = transaction(a, account, c);
    const raw = await signer.signTransaction({ type: 'legacy', chainId: 10143, nonce: 0, to: tx.to as any, data: tx.data, gas: 100000n, gasPrice: 1000000000n, value: 0n });
    return request('/api/rpc', { market, method: 'eth_sendRawTransaction', params: [raw] });
  }
  try {
    for (const path of ['/api/kuru?wallet=' + signer.address, '/api/kuru-scan?conversion=1000000&fee=300000000000']) {
      assert.equal(await request(path, undefined, false), 401); assert.equal(await request(path), 200);
    }
    assert.equal(await request('/api/markets/learning/kuru?wallet=' + signer.address), 404);
    for (const kind of ['approve', 'deposit', 'withdraw', 'limit-buy', 'limit-sell', 'market-buy', 'market-sell', 'cancel'] as const) assert.equal(await send({ ...action, kind }), 403, kind);
    assert.equal(writes, 0);
    assert.equal(await send(action, c.pool), 403);
    assert.equal(await send(action, signer.address, 'learning'), 403);
    assert.equal(writes, 0);
  } finally { globalThis.fetch = original; await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('Mera refuses all reviewed Kuru actions', async () => {
  const controller = new AuthController({ policy: authPolicy('http://localhost:18767', true, true, true), client: {
    async createCredential() { throw Error('unused'); }, async getCredential() { return { credentialId: new Uint8Array([1]), prfOutput: new Uint8Array(32).fill(9) }; },
  } });
  const provider = meraProvider(controller), original = globalThis.fetch; let writes = 0;
  const hash = '0x' + 'aa'.repeat(32);
  globalThis.fetch = async (input, options) => {
    if (input === '/api/state') return Response.json({ environment: 'public_testnet', chain_id: 10143, contracts: c, snapshot: { block_number: 100, block_hash: hash } });
    const r = JSON.parse(options!.body as string);
    if (r.method === 'eth_sendRawTransaction') { const tx = parseTransaction(r.params[0]); assert.equal(tx.nonce, 121); writes++; return Response.json({ result: hash }); }
    return Response.json({ result: ({ eth_chainId: '0x279f', eth_getBlockByNumber: { hash }, eth_getTransactionCount: 121 } as any)[r.method] });
  };
  try {
    await controller.authenticate('login'); const owner = controller.getSnapshot().address!;
    const send = (a: Action, nonce = '0x79', account = owner) => provider.request({ method: 'eth_sendTransaction', params: [{ ...transaction(a, account, c), from: owner, nonce, gas: '0x186a0', gasPrice: '0x3b9aca00' }] });
    for (const kind of ['approve', 'deposit', 'withdraw', 'limit-buy', 'limit-sell', 'market-buy', 'market-sell', 'cancel'] as const) await assert.rejects(send({ ...action, kind }), /account access only/);
    await assert.rejects(send(action, '0x78'), /account access only/);
    await assert.rejects(send(action, '0x79', c.pool));
    controller.lockSigning(); await assert.rejects(send(action), /account access only/);
    assert.equal(writes, 0);
  } finally { globalThis.fetch = original; provider.destroy(); await controller.signOut(); }
});
