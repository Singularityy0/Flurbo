import assert from 'node:assert/strict';
import test from 'node:test';
import * as ed from '@noble/ed25519';
import {
  PERPL_AUSD, PERPL_EXCHANGE, apiKeySignIn, applyFrame, beginOrder, collateralAmount, emptyDesk,
  formatScaled, minimumLong, nextRequestId, orderOutcome, parseApiSecret, parseApiToken, parsePerplContext,
  tradeLeverage, wsSignInCanonical,
} from '../src/perpl.ts';

const context = () => ({ chain: { chain_id: 10143 }, instances: [{ id: 12, address: PERPL_EXCHANGE, collateral_token_id: 1, min_account_open_amount: '100000000' }],
  tokens: [{ id: 1, address: PERPL_AUSD, decimals: 6, symbol: 'AUSD' }],
  markets: [{ id: 16, instance_id: 12, symbol: 'BTC', order_ttl_blocks: 20, state: { mrk: 813447 }, config: { is_open: true, price_decimals: 1, size_decimals: 5, initial_margin: 1500 } }] });

test('reads the pinned testnet exchange and collateral', () => {
  const value = parsePerplContext(context());
  assert.equal(value.instanceId, 12);
  assert.equal(value.minimumDeposit, '100000000');
  assert.equal(collateralAmount(value.minimumDeposit), '100');
  assert.equal(value.markets[0].symbol, 'BTC');
  assert.equal(formatScaled(value.markets[0].mark, value.markets[0].priceDecimals), '81344.7');
  assert.equal(formatScaled(1, value.markets[0].sizeDecimals), '0.00001');
  assert.equal(tradeLeverage(value.markets[0].initialMargin), 100);
});

test('refuses a different network, collateral, exchange, or market shape', () => {
  const mutations = [
    (v: any) => { v.chain.chain_id = 143; },
    (v: any) => { v.tokens[0].address = PERPL_EXCHANGE; },
    (v: any) => { v.instances[0].address = PERPL_AUSD; },
    (v: any) => { v.markets[0].order_ttl_blocks = 0; },
    (v: any) => { v.markets.push(v.markets[0]); },
  ];
  for (const mutate of mutations) { const value = context(); mutate(value); assert.throws(() => parsePerplContext(value)); }
});

test('keeps the API token and the 32-byte secret in separate fields', () => {
  assert.equal(parseApiToken('a'.repeat(20)), 'a'.repeat(20));
  assert.equal(parseApiSecret('ab'.repeat(32)).length, 32);
  assert.throws(() => parseApiToken('ab'.repeat(32)), /private key/);
  assert.throws(() => parseApiSecret('zz'));
});

test('signs the testnet trading socket with the documented canonical string', async () => {
  const secret = parseApiSecret('11'.repeat(32));
  const canonical = wsSignInCanonical('1751932800000', '9Nq0Yp3kZ2c1aVb7');
  assert.equal(canonical, '10143\ntrading-ws-signin\n1751932800000\n9Nq0Yp3kZ2c1aVb7');
  const frame = await apiKeySignIn(secret, 'a'.repeat(20), 1751932800000, '9Nq0Yp3kZ2c1aVb7');
  assert.equal(frame.mt, 29);
  assert.equal(frame.chain_id, 10143);
  const pad = frame.signature.length % 4 === 0 ? '' : '='.repeat(4 - (frame.signature.length % 4));
  const binary = atob(frame.signature.replaceAll('-', '+').replaceAll('_', '/') + pad);
  const signature = Uint8Array.from(binary, char => char.charCodeAt(0));
  assert.equal(await ed.verifyAsync(signature, new TextEncoder().encode(canonical), await ed.getPublicKeyAsync(secret)), true);
});

test('a gateway acknowledgement is not a fill; the fill record is', () => {
  let desk = beginOrder(emptyDesk(12), { serial: 1, requestId: 8, marketId: 16, accountId: 3, phase: 'sent' });
  desk = applyFrame(desk, { mt: 3, cid: 1, status: { code: 0, error: '' } });
  assert.equal(desk.order?.phase, 'admitted');
  assert.equal(orderOutcome(desk.order, false)?.tone, 'wait');
  assert.match(orderOutcome(desk.order, false)?.text ?? '', /not a fill/);
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 8, oid: 44, st: 4, sr: 0 }] });
  assert.equal(desk.order?.phase, 'admitted');
  assert.match(orderOutcome(desk.order, false)?.text ?? '', /not a fill/);
  const txid = '0x' + 'ab'.repeat(32);
  desk = applyFrame(desk, { mt: 25, d: [{ oid: 44, mkt: 16, acc: 3, s: 1, p: 813447, at: { b: 70, txid } }] });
  assert.equal(desk.order?.phase, 'filled');
  assert.equal(orderOutcome(desk.order, false)?.tone, 'ok');
  assert.equal(orderOutcome(desk.order, true)?.txid, txid);
});

test('a fill that arrives before the order id is confirmed when the order update names it', () => {
  let desk = beginOrder(emptyDesk(12), { serial: 2, requestId: 9, marketId: 16, accountId: 3, phase: 'sent' });
  desk = applyFrame(desk, { mt: 25, d: [{ oid: 50, mkt: 16, acc: 3, s: 1, at: { txid: '0x' + 'cd'.repeat(32) } }] });
  assert.equal(desk.order?.phase, 'sent');
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 9, oid: 50, st: 2, sr: 0 }] });
  assert.equal(desk.order?.phase, 'filled');
});

test('forwarding disabled and a read-only key are failures, not fills', () => {
  let desk = beginOrder(emptyDesk(12), { serial: 1, requestId: 4, marketId: 16, accountId: 3, phase: 'admitted', gateway: 'Accepted for forwarding.' });
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 4, oid: 1, st: 7, sr: 34 }] });
  assert.equal(desk.order?.phase, 'failed');
  assert.match(orderOutcome(desk.order, false)?.text ?? '', /one-click trading/);
  desk = beginOrder(emptyDesk(12), { serial: 2, requestId: 5, marketId: 16, accountId: 3, phase: 'sent' });
  desk = applyFrame(desk, { mt: 3, cid: 2, status: { code: 403, error: 'api key lacks trade scope' } });
  assert.equal(orderOutcome(desk.order, false)?.text, 'api key lacks trade scope');
});

test('request ids advance past the account cursor and a skipped heartbeat is not final', () => {
  const order = minimumLong({ marketId: 16, accountId: 3, requestId: nextRequestId(7, 7), serial: 1, leverage: 100 });
  assert.deepEqual(order, { mt: 22, sn: 1, rq: 8, mkt: 16, acc: 3, t: 1, p: 0, s: 1, fl: 4, lv: 100, lb: 0 });
  let desk = applyFrame(emptyDesk(12), { mt: 19, sn: 3, as: [{ id: 3, in: 12, fw: true, fr: false, lfr: 7, b: '1000000' }] });
  desk = applyFrame(desk, { mt: 100, sn: 4, h: 80 });
  assert.equal(desk.stale, false);
  desk = applyFrame(desk, { mt: 100, sn: 6, h: 81 });
  assert.equal(desk.stale, true);
  assert.equal(desk.accounts[0].balance, '1000000');
});
