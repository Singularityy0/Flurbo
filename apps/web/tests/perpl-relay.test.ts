import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { attachPerplRelay, enrollmentEnrollBody, enrollmentPayloadBody, forwardPerplEnrollment, loadPublicPerplContext, PERPL_ENROLL_ORIGIN } from '../server/perpl-relay.mjs';

const origin = 'https://flurbo.singu.online';
const store = { read: (id: string, expected: string) => id === 'good' && expected === origin ? { method: 'passkey' } : null };

test('enrollment forwarding only sends a testnet payload with the whitelisted origin', async () => {
  const address = '0x' + '11'.repeat(20);
  const publicKey = '0x' + '22'.repeat(32);
  assert.equal(enrollmentPayloadBody({ chain_id: 143, address, public_key: publicKey, scope_mask: 3, label: 'Flurbo' }), null);
  assert.deepEqual(enrollmentPayloadBody({ chain_id: 10143, address, public_key: publicKey, scope_mask: 3, label: 'Flurbo', extra: 'no' }), {
    chain_id: 10143, address, public_key: publicKey, scope_mask: 3, label: 'Flurbo',
  });
  assert.equal(enrollmentEnrollBody({ chain_id: 10143, address, mac: '0x' + 'ab'.repeat(32), signature: '0x' + 'cd'.repeat(65), pop_signature: '0x' + 'ef'.repeat(32), typed_data: [] }), null);
  let seen: { url?: string; origin?: string; body?: any } = {};
  const result = await forwardPerplEnrollment('payload', { chain_id: 10143, address, public_key: publicKey, scope_mask: 3, label: 'Flurbo' }, async (url, options) => {
    seen = { url: String(url), origin: (options as RequestInit).headers && (options as any).headers.Origin, body: JSON.parse(String((options as RequestInit).body)) };
    return Response.json({ typed_data: { primaryType: 'PerplRegisterApiKey' }, mac: '0x' + 'ab'.repeat(32) });
  });
  assert.equal(seen.origin, PERPL_ENROLL_ORIGIN);
  assert.match(seen.url ?? '', /\/v1\/api-key\/payload$/);
  assert.equal(seen.body.scope_mask, 3);
  assert.equal(result.status, 200);
  assert.equal((await forwardPerplEnrollment('other', { chain_id: 10143, address, public_key: publicKey, scope_mask: 3, label: 'Flurbo' })).status, 400);
  const enroll = { chain_id: 10143, address, typed_data: { primaryType: 'PerplRegisterApiKey' }, mac: '0x' + 'ab'.repeat(32), signature: '0x' + 'cd'.repeat(65), pop_signature: '0x' + 'ef'.repeat(64) };
  const missing = await forwardPerplEnrollment('enroll', enroll, async () => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }));
  assert.equal(missing.status, 404);
  assert.equal(missing.value.error, 'Not Found');
});

test('the context proxy only returns Monad testnet', async () => {
  const value = await loadPublicPerplContext(async () => Response.json({ chain: { chain_id: 10143 } }));
  assert.equal(value.chain.chain_id, 10143);
  await assert.rejects(() => loadPublicPerplContext(async () => Response.json({ chain: { chain_id: 143 } })));
  await assert.rejects(() => loadPublicPerplContext(async () => new Response('no', { status: 503 })));
});

test('the trade relay refuses an anonymous socket and forwards frames for a passkey session', async () => {
  const remote = new WebSocketServer({ port: 0 });
  await new Promise<void>(resolve => remote.on('listening', resolve));
  const upstreamPort = (remote.address() as { port: number }).port;
  let seen = '';
  const received = new Promise<void>(resolve => remote.on('connection', socket => {
    socket.on('message', data => { seen = String(data); socket.send(JSON.stringify({ mt: 19, sn: 4, as: [] })); resolve(); });
  }));
  const http = createServer();
  attachPerplRelay(http, { store, resolveOrigin: () => origin, connect: () => new WebSocket(`ws://127.0.0.1:${upstreamPort}`) });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as { port: number }).port;
  try {
    const denied = new WebSocket(`ws://127.0.0.1:${port}/api/perpl/trade`);
    const status = await new Promise(resolve => {
      denied.on('unexpected-response', (_req, res) => resolve(res.statusCode));
      denied.on('open', () => resolve(0));
    });
    assert.equal(status, 401);
    const client = new WebSocket(`ws://127.0.0.1:${port}/api/perpl/trade`, { headers: { Cookie: 'flurbo_session=good' } });
    const reply = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 5_000);
      client.on('message', data => { clearTimeout(timer); resolve(JSON.parse(String(data))); });
      client.on('unexpected-response', (_req, res) => reject(new Error(String(res.statusCode))));
    });
    await new Promise<void>((resolve, reject) => { client.once('open', () => resolve()); client.once('error', reject); });
    client.send(JSON.stringify({ mt: 29, api_key: 'token', signature: 'sig' }));
    await received;
    assert.match(seen, /"mt":29/);
    assert.equal((await reply).sn, 4);
    client.close();
  } finally {
    remote.close();
    await new Promise<void>(resolve => http.close(() => resolve()));
  }
});
