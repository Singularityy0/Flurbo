import assert from 'node:assert/strict';
import test from 'node:test';
import { tradingSocketUrl, wireTradingSocket } from '../src/perpl-connection.ts';

function fakeSocket() {
  return { readyState: 1, onopen: null as any, onmessage: null as any, onerror: null as any,
    sent: [] as string[], closed: false,
    send(value: string) { this.sent.push(value); }, close() { this.closed = true; } };
}
const key = { secret: new Uint8Array(32), token: 'test-token' };
const sign = async () => ({ mt: 29, chain_id: 10143, api_key: 'test-token', timestamp: '1', nonce: 'test-nonce', signature: 'test-signature' });

test('live trading uses Perpl directly; localhost uses its development relay', () => {
  assert.equal(tradingSocketUrl({ origin: 'https://flurbo.singu.online', protocol: 'https:', host: 'flurbo.singu.online' }), 'wss://testnet.perpl.xyz/ws/v1/trading');
  assert.equal(tradingSocketUrl({ origin: 'http://localhost:18767', protocol: 'http:', host: 'localhost:18767' }), 'ws://localhost:18767/api/perpl/trade');
});

test('opening and sending authentication do not enable orders; a wallet snapshot does', async () => {
  const socket = fakeSocket(); let ready = 0; const frames: unknown[] = [];
  const stop = wireTradingSocket(socket as any, key, { ready: () => ready++, frame: frame => frames.push(frame), error: message => assert.fail(message) }, sign);
  try {
    socket.onopen(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(JSON.parse(socket.sent[0]).mt, 29); assert.equal(ready, 0);
    socket.onmessage({ data: JSON.stringify({ mt: 3, status: { code: 0 } }) });
    assert.equal(ready, 0);
    socket.onmessage({ data: JSON.stringify({ mt: 19, sn: 1, as: [] }) });
    assert.equal(ready, 1); assert.equal(frames.length, 2);
  } finally { stop(); }
});

test('authentication rejection is surfaced before an order exists', () => {
  const socket = fakeSocket(); let error = '';
  const stop = wireTradingSocket(socket as any, key, { ready: () => assert.fail('ready'), frame: () => {}, error: message => error = message }, sign);
  try {
    socket.onmessage({ data: JSON.stringify({ mt: 3, status: { code: 403, error: 'Invalid API key' } }) });
    assert.match(error, /403.*Invalid API key/); assert.equal(socket.closed, true);
  } finally { stop(); }
});

test('a silent connection closes instead of leaving the account loading indefinitely', async () => {
  const socket = fakeSocket(); let error = '';
  const stop = wireTradingSocket(socket as any, key, { ready: () => assert.fail('ready'), frame: () => {}, error: message => error = message }, sign, 10);
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.match(error, /did not confirm/); assert.equal(socket.closed, true);
  } finally { stop(); }
});
