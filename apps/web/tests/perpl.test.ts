import assert from 'node:assert/strict';
import test from 'node:test';
import * as ed from '@noble/ed25519';
import {
  PERPL_AUSD, PERPL_EXCHANGE, apiKeySignIn, applyFrame, beginOrder, collateralAmount, emptyDesk,
  collateralText, createApiKeypair, enrollApiKey, enrollmentDigest, enrollmentEndpoint, enrollmentFailure, formatScaled, minimumLong, nextRequestId, orderOutcome, orderRequest, parseApiSecret, parseApiToken, parseEnrollmentPayload, parseEnrolledToken, parsePerplContext, proofOfPossession, scaleUnits,
  resumeDesk, tradeLeverage, wsSignInCanonical,
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

const enrollmentTyped = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }, { name: 'salt', type: 'bytes32' },
    ],
    PerplRegisterApiKey: [
      { name: 'signer', type: 'address' }, { name: 'statement', type: 'string' }, { name: 'publicKey', type: 'string' },
      { name: 'scope', type: 'string' }, { name: 'label', type: 'string' }, { name: 'expiresAt', type: 'string' },
      { name: 'ipCidrs', type: 'string' }, { name: 'origin', type: 'string' }, { name: 'builderId', type: 'string' },
      { name: 'maxBuilderFeePer100K', type: 'string' }, { name: 'time', type: 'uint64' },
    ],
  },
  primaryType: 'PerplRegisterApiKey',
  domain: {
    name: 'perpl.xyz', version: '1', chainId: '0x279f',
    verifyingContract: '0x0000000000000000000000000000000000000000',
    salt: '0x00000000000000000000000000000000000000006acea033def173c38d4949d4',
  },
  message: {
    builderId: '0', expiresAt: '0', ipCidrs: '', label: 'Flurbo', maxBuilderFeePer100K: '0',
    origin: 'https://flurbo.singu.online', publicKey: 'PsL2pFi77WLxd8ie8gI76cF2SSKKhBWcw_D2NpTrGo4', scope: '3',
    signer: '0x0000000000000000000000000000000000000001',
    statement: 'I authorize the creation of Perpl API key with the specified scope and parameters',
    time: '0x1a13721c8d9',
  },
};

test('hashes the enrollment typed data and proves possession of the Ed25519 secret', async () => {
  const parsed = parseEnrollmentPayload({ typed_data: enrollmentTyped, mac: '0x' + 'ab'.repeat(32) });
  assert.equal(parsed.typedData.primaryType, 'PerplRegisterApiKey');
  const digest = enrollmentDigest(parsed.typedData);
  assert.match(digest, /^0x[0-9a-f]{64}$/);
  const pair = await createApiKeypair();
  const pop = await proofOfPossession(pair.secret, parsed.typedData);
  assert.match(pop, /^0x[0-9a-f]{128}$/);
  assert.equal(await ed.verifyAsync(ed.etc.hexToBytes(pop.slice(2)), ed.etc.hexToBytes(digest.slice(2)), ed.etc.hexToBytes(pair.publicKeyHex.slice(2))), true);
  assert.equal(parseEnrolledToken({ api_key: { api_key: 'a'.repeat(20) } }), 'a'.repeat(20));
  assert.match(enrollmentFailure(409, {}), /already registered/);
  assert.throws(() => parseEnrollmentPayload({ typed_data: { ...enrollmentTyped, primaryType: 'Other' }, mac: '0x' + 'ab'.repeat(32) }));
});

test('the live site enrolls directly with Perpl, and localhost keeps the relay', () => {
  assert.equal(enrollmentEndpoint('payload', 'https://flurbo.singu.online'), 'https://testnet.perpl.xyz/api/v1/api-key/payload');
  assert.equal(enrollmentEndpoint('enroll', 'http://localhost:18767'), '/api/perpl/api-key/enroll');
  assert.match(enrollmentFailure(451, { error: 'Unavailable For Legal Reasons' }), /MetaMask connection/);
});

test('enrolls a trade key after the wallet signs the payload Perpl returned', async () => {
  const calls: { url: string; body: any }[] = [];
  const result = await enrollApiKey({
    address: '0x' + '11'.repeat(20),
    signTypedData: async typed => {
      assert.equal(typed.primaryType, 'PerplRegisterApiKey');
      return '0x' + '22'.repeat(65);
    },
    fetch: (async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      calls.push({ url: String(url), body });
      if (String(url).endsWith('/payload')) return Response.json({ typed_data: enrollmentTyped, mac: '0x' + 'ab'.repeat(32) });
      if (String(url).endsWith('/enroll')) {
        assert.match(body.pop_signature, /^0x[0-9a-f]{128}$/);
        assert.equal(body.signature, '0x' + '22'.repeat(65));
        assert.equal(body.typed_data.primaryType, 'PerplRegisterApiKey');
        return Response.json({ api_key: { api_key: 'z'.repeat(24) } });
      }
      throw new Error(String(url));
    }) as typeof fetch,
  });
  assert.equal(result.token, 'z'.repeat(24));
  assert.equal(result.secret.length, 32);
  assert.equal(calls[0].body.scope_mask, 3);
  assert.equal(calls[0].body.chain_id, 10143);
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
  let desk = beginOrder(emptyDesk(12), { serial: 1, requestId: 8, marketId: 16, accountId: 3, action: 1, phase: 'sent' });
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

test('a fill without a hash keeps the transaction hash from a later order update', () => {
  let desk = beginOrder(emptyDesk(12), { serial: 1, requestId: 8, marketId: 16, accountId: 3, action: 1, phase: 'sent' });
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 8, oid: 44, st: 2, sr: 0 }] });
  desk = applyFrame(desk, { mt: 25, d: [{ oid: 44, mkt: 16, acc: 3, s: 1, p: 1 }] });
  assert.equal(desk.order?.phase, 'filled');
  assert.match(orderOutcome(desk.order, false)?.text ?? '', /has not arrived/);
  const txid = '0x' + 'EF'.repeat(32);
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 8, oid: 44, st: 4, sr: 0, at: { b: 80, txid } }] });
  assert.equal(orderOutcome(desk.order, false)?.txid, txid.toLowerCase());
  assert.equal(orderOutcome(desk.order, false)?.text, 'Filled on Perpl.');
});

test('a fill that arrives before the order id is confirmed when the order update names it', () => {
  let desk = beginOrder(emptyDesk(12), { serial: 2, requestId: 9, marketId: 16, accountId: 3, action: 1, phase: 'sent' });
  desk = applyFrame(desk, { mt: 25, d: [{ oid: 50, mkt: 16, acc: 3, s: 1, at: { txid: '0x' + 'cd'.repeat(32) } }] });
  assert.equal(desk.order?.phase, 'sent');
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 9, oid: 50, st: 2, sr: 0 }] });
  assert.equal(desk.order?.phase, 'filled');
});

test('forwarding disabled and a read-only key are failures, not fills', () => {
  let desk = beginOrder(emptyDesk(12), { serial: 1, requestId: 4, marketId: 16, accountId: 3, action: 1, phase: 'admitted', gateway: 'Accepted for forwarding.' });
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 4, oid: 1, st: 7, sr: 34 }] });
  assert.equal(desk.order?.phase, 'failed');
  assert.match(orderOutcome(desk.order, false)?.text ?? '', /one-click trading/);
  desk = beginOrder(emptyDesk(12), { serial: 2, requestId: 5, marketId: 16, accountId: 3, action: 1, phase: 'sent' });
  desk = applyFrame(desk, { mt: 3, cid: 2, status: { code: 403, error: 'api key lacks trade scope' } });
  assert.equal(orderOutcome(desk.order, false)?.text, 'api key lacks trade scope');
});

test('each Perpl action uses the documented order frame', () => {
  const common = { marketId: 16, accountId: 3, requestId: 8, serial: 4, leverage: 100 };
  assert.equal(orderRequest({ ...common, action: 2, size: 1, price: 0 }).t, 2);
  assert.equal(orderRequest({ ...common, action: 3, size: scaleUnits('0.001', 3), price: scaleUnits('65000.0', 1) }).fl, 0);
  assert.equal(orderRequest({ ...common, action: 4, size: 1, price: 0 }).fl, 4);
  assert.deepEqual(orderRequest({ ...common, action: 5, orderId: 44 }), { mt: 22, sn: 4, rq: 8, mkt: 16, acc: 3, t: 5, oid: 44, s: 0, fl: 0, lv: 0, lb: 0 });
  assert.equal(orderRequest({ ...common, action: 6, amount: collateralText('12.5') }).a, '12.5');
  assert.equal(orderRequest({ ...common, action: 7, orderId: 44, size: 2, price: 10 }).t, 7);
  assert.throws(() => orderRequest({ ...common, action: 5 }), /order id/);
  assert.throws(() => orderRequest({ ...common, action: 7, orderId: 44, size: 2, price: 0 }), /limit price/);
  assert.throws(() => collateralText('0'), /collateral/);
  let desk = beginOrder(emptyDesk(12), { serial: 1, requestId: 8, marketId: 16, accountId: 3, action: 5, phase: 'sent' });
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 8, oid: 44, st: 5, sr: 0 }] });
  assert.equal(desk.order?.phase, 'closed');
  assert.equal(orderOutcome(desk.order, false)?.text, 'Perpl canceled that order. This is not a fill.');
  desk = beginOrder(emptyDesk(12), { serial: 2, requestId: 9, marketId: 16, accountId: 3, action: 1, phase: 'sent' });
  desk = applyFrame(desk, { mt: 24, d: [{ rq: 9, oid: 45, st: 5, sr: 0 }] });
  assert.equal(desk.order?.phase, 'failed');
});

test('request ids advance past the account cursor and a skipped heartbeat is not final', () => {
  const order = minimumLong({ marketId: 16, accountId: 3, requestId: nextRequestId(7, 7), serial: 1, leverage: 100 });
  assert.deepEqual(order, { mt: 22, sn: 1, rq: 8, mkt: 16, acc: 3, t: 1, p: 0, s: 1, fl: 4, lv: 100, lb: 0 });
  assert.equal(applyFrame(emptyDesk(12), { mt: 19, sn: 1, as: [] }).listed, true);
  assert.equal(applyFrame(emptyDesk(12), { mt: 19, sn: 1, as: [] }).accounts.length, 0);
  let desk = applyFrame(emptyDesk(12), { mt: 19, sn: 3, as: [{ id: 3, in: 12, fw: true, fr: false, lfr: 7, b: '1000000' }] });
  desk = applyFrame(desk, { mt: 100, sn: 4, h: 80 });
  assert.equal(desk.stale, false);
  desk = applyFrame(desk, { mt: 100, sn: 6, h: 81 });
  assert.equal(desk.stale, true);
  assert.equal(desk.accounts[0].balance, '1000000');
});

test('a reconnect keeps an admitted order and drops the old heartbeat', () => {
  const previous = {
    ...emptyDesk(12), serial: 4, head: 9, stale: true, lastSequence: 40,
    order: { serial: 4, requestId: 8, marketId: 16, accountId: 3, action: 1 as const, orderId: 77, phase: 'admitted' as const, gateway: 'Accepted for forwarding.' },
    earlyFills: [{ oid: 77, marketId: 16, accountId: 3, price: 1, size: 1, txid: '0x' + 'ab'.repeat(32), block: 2 }],
  };
  const kept = resumeDesk(previous, 12);
  assert.equal(kept.order?.orderId, 77);
  assert.equal(kept.order?.phase, 'admitted');
  assert.equal(kept.serial, 4);
  assert.equal(kept.earlyFills.length, 1);
  assert.equal(kept.lastSequence, undefined);
  assert.equal(kept.head, 0);
  assert.equal(kept.stale, false);
  assert.equal(resumeDesk({ ...previous, order: { ...previous.order, phase: 'failed' } }, 12).order, null);
  assert.equal(resumeDesk(previous, 99).order, null);
});
