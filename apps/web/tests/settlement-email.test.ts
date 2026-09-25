import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailConfig, resendDelivery, queueReport, drainEmails } from '../server/settlement-email.mjs';
import { settlementLease } from '../server/settlement-store.mjs';
import { notifyPool, runNotifications, watchdog } from '../scripts/notify-settlement.mjs';
import { monitorIdentity } from '../server/settlement-monitor.mjs';
import { pilotFixture, hash } from './pilot-fixture.ts';

const config = { from: 'alerts@example.com', to: ['operator@example.com'], key: 're_test-secret' };
const identity = 'test-pool';
const empty = () => ({ schema: 'flurbo.settlement-mail.v1', identity, signature: null, lastQueuedAt: 0, queue: [] });
const report = (checkedAt = 1000, active = true): any => ({ checkedAt, pool: 'pool', resolver: 'resolver',
  snapshot: { blockNumber: String(checkedAt) }, lifecycle: 'trading_closed', status: active ? 'attention_required' : 'observed',
  alerts: active ? [{ code: 'ASSERTION_REVIEW_REQUIRED', severity: 'critical', event: 0, deadline: 5000, message: 'Review evidence.' }] : [],
  events: [{ event: 0, question: 'Fixture?', phase: 'Asserted', proposal: 'YES', counter: 'Unset', result: 'Unset', votes: [0, 0, 0],
    deadline: 5000, evidenceHash: hash, counterEvidenceHash: hash, remainingSeconds: 5000 - checkedAt, action: 'Review assertion.' }],
});

// Models the atomic Redis lease operations, including expiration and fenced writes.
function redis() {
  const data = new Map<string, string>(), expires = new Map<string, number>();
  const clock = { ms: 0 }, fail = { save: false };
  const command = async (...args: any[]): Promise<any> => {
    for (const [k, at] of expires) if (at <= clock.ms) { data.delete(k); expires.delete(k); }
    if (args[0] === 'GET') return data.get(args[1]) ?? null;
    if (args[0] === 'SET') {
      if (data.has(args[1])) return null;
      data.set(args[1], args[2]); expires.set(args[1], clock.ms + 300000); return 'OK';
    }
    assert.equal(args[0], 'EVAL');
    const [, , , lock, key, token, operation, value] = args;
    if (data.get(lock) !== token) return 0;
    if (operation === 'release') { data.delete(lock); expires.delete(lock); return 1; }
    expires.set(lock, clock.ms + 300000);
    if (operation === 'save') { if (fail.save) throw new Error('storage failure'); data.set(key, value); }
    return 1;
  };
  return { command, data, clock, fail };
}

test('stable observations do not spam; deadline escalation, evidence, recovery and hourly reminders notify', () => {
  let state = queueReport(empty(), report(), config, 1000);
  assert.equal(state.queue.length, 1);
  state = queueReport(state, report(1300), config, 1300);
  assert.equal(state.queue.length, 1); // Block and countdown changes are irrelevant.
  state = queueReport(state, report(4600), config, 4600);
  assert.equal(state.queue.length, 2);
  const changed = report(4700); changed.events[0].evidenceHash = 'new evidence';
  assert.equal(queueReport(state, changed, config, 4700).queue.length, 3);
  const urgent = report(4800); urgent.alerts.push({ code: 'DEADLINE_WITHIN_10_MINUTES', severity: 'critical', event: 0, deadline: 5000, message: 'Act now.' });
  assert.equal(queueReport(state, urgent, config, 4800).queue.length, 3);
  assert.equal(queueReport(state, report(4800, false), config, 4800).queue.length, 3);
  assert.equal(queueReport(empty(), report(1000, false), config, 1000).queue.length, 0);
  assert.equal(queueReport(empty(), report(1000, false), config, 1000, { test: true }).queue.length, 1);
  const settled = report(1000, false);
  settled.alerts = [{ code: 'SETTLEMENT_DELIVERED', severity: 'info', message: 'Delivered.' }];
  assert.equal(queueReport(empty(), settled, config, 1000).queue.length, 1);
});

test('a timed out accepted email retries the identical body and idempotency key', async () => {
  let state = queueReport(empty(), report(), config, 1000), calls: any[] = [];
  const send = resendDelivery(config, async (url: any, options: any) => {
    assert.equal(url, 'https://api.resend.com/emails'); calls.push(options);
    if (calls.length === 1) throw new Error('Provider accepted but response lost re_test-secret');
    return Response.json({ id: 'provider-message-id' });
  });
  const save = async (next: any) => { state = structuredClone(next); };
  await assert.rejects(drainEmails(state, { send, save, renew: async () => {}, now: () => 1100 }), /pending delivery retained/);
  assert.equal(state.queue.length, 1);
  const result = await drainEmails(state, { send, save, renew: async () => {}, now: () => 1200 });
  assert.equal(result.state.queue.length, 0);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
});

test('failed acknowledgement persistence reuses the pending item; expired or lost leases prevent sends', async () => {
  const state = queueReport(empty(), report(), config, 1000);
  let sends = 0;
  const send = async () => { sends++; return 'accepted-id'; };
  await assert.rejects(drainEmails(state, { send, save: async () => { throw new Error('disk'); }, renew: async () => {}, now: () => 1100 }));
  assert.equal(state.queue.length, 1);
  await assert.rejects(drainEmails(state, { send, save: async () => {}, renew: async () => {}, now: () => 1000 + 23 * 3600 }), /manual reconciliation/);
  await assert.rejects(drainEmails(state, { send, save: async () => {}, renew: async () => { throw new Error('lease lost'); }, now: () => 1100 }));
  assert.equal(sends, 1);
});

test('Redis lease excludes concurrent workers and fences a paused worker after expiration', async () => {
  const r = redis(), first = await settlementLease(r.command, identity);
  await assert.rejects(settlementLease(r.command, identity), /already running/);
  await first.save({ good: true });
  r.clock.ms = 300001;
  const second = await settlementLease(r.command, identity);
  await assert.rejects(first.save({ bad: true }), /lease lost/);
  await assert.rejects(first.release(), /lease lost/);
  assert.deepEqual(await second.load(), { good: true });
  await second.release();
});

function observed(manifest: any, now: number, active = true) {
  return { report: { ...report(now, active), pool: manifest.pool, resolver: manifest.resolver },
    checkpoint: { schema: 'flurbo.settlement-checkpoint.v1', identity: monitorIdentity(manifest), checkedAt: now,
      snapshot: { blockNumber: '100', blockHash: hash, timestamp: now }, delivered: false,
      cases: Array.from({ length: manifest.publication.draft.events.length }, () => ({ phase: 0, result: 0, votes: [0, 0, 0] })) } };
}

test('hosted job persists before sending, preserves the checkpoint on failed reads and emails recovery', async () => {
  const f = pilotFixture(), r = redis(); let time = 1000, sends = 0;
  const options = { manifest: f.manifest, rpc: f.rpc, command: r.command, config, now: () => time,
    send: async () => { sends++; return 'accepted-id'; }, inspect: async () => observed(f.manifest, time) };
  r.fail.save = true;
  await assert.rejects(notifyPool(options)); assert.equal(sends, 0);
  r.fail.save = false;
  assert.equal((await notifyPool(options)).acceptedEmails, 1);
  const stateKey = [...r.data.keys()].find(k => k.endsWith(':state'))!;
  const checkpoint = JSON.parse(r.data.get(stateKey)!).checkpoint;
  time = 1300;
  const failed = await notifyPool({ ...options, inspect: async () => { throw new Error('secret RPC'); } });
  assert.equal(failed.status, 'check_failed');
  assert.deepEqual(JSON.parse(r.data.get(stateKey)!).checkpoint, checkpoint);
  time = 1600;
  assert.equal((await notifyPool(options)).acceptedEmails, 1);
  assert.equal(sends, 3);
});

test('queue capacity, recipient changes and corrupt state fail closed', async () => {
  let state: any = empty();
  for (let i = 0; i < 20; i++) state = queueReport(state, report(1000 + i), config, 1000 + i, { test: true });
  assert.throws(() => queueReport(state, report(), config, 1100, { test: true }), /queue full/);
  const f = pilotFixture(), r = redis();
  const options = { manifest: f.manifest, rpc: f.rpc, command: r.command, config, now: () => 1000,
    send: async () => { throw new Error('offline'); }, inspect: async () => observed(f.manifest, 1000) };
  await assert.rejects(notifyPool(options));
  await assert.rejects(notifyPool({ ...options, config: { ...config, to: ['changed@example.com'] } }), /Reconcile/);
  const key = [...r.data.keys()].find(k => k.endsWith(':state'))!;
  r.data.set(key, '{broken');
  await assert.rejects(notifyPool(options));
  assert.equal(r.data.get(key), '{broken');
});

test('email and watchdog transports reject redirects/errors and do not expose credentials', async () => {
  assert.throws(() => emailConfig({ FLURBO_MONITOR_EMAIL_TO: 'victim@example.com\nbcc:other@example.com' }));
  const item = queueReport(empty(), report(), config, 1000).queue[0];
  const send = resendDelivery(config, async () => new Response('re_test-secret', { status: 429 }));
  await assert.rejects(send(item), error => !String(error).includes('re_test-secret'));
  assert.throws(() => watchdog({ FLURBO_MONITOR_HEALTHCHECK_URL: 'http://localhost/internal' }));
  const urls: string[] = [];
  const ping = watchdog({ FLURBO_MONITOR_HEALTHCHECK_URL: 'https://hc-ping.com/00000000-0000-0000-0000-000000000000' },
    async (url: string, init: any) => { urls.push(url); assert.equal(init.redirect, 'error'); assert.equal(init.body, undefined); return new Response('OK'); });
  await ping(false); await ping(true);
  assert.ok(!urls[0].endsWith('/fail')); assert.ok(urls[1].endsWith('/fail'));
});

test('runner handles both pools, signals failed reads to watchdog, and redacts configuration errors', async () => {
  const r = redis(), pilot = pilotFixture().manifest, rehearsal = structuredClone(pilot);
  rehearsal.publication.mode = 'rehearsal'; rehearsal.rulesHash = '0x' + 'ab'.repeat(32);
  const env = { FLURBO_PILOT_MANIFEST_JSON: JSON.stringify(pilot), FLURBO_REHEARSAL_MANIFEST_JSON: JSON.stringify(rehearsal),
    UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'storage-secret',
    FLURBO_MONITOR_EMAIL_FROM: config.from, FLURBO_MONITOR_EMAIL_TO: config.to[0], FLURBO_MONITOR_RESEND_KEY: config.key,
    FLURBO_MONITOR_HEALTHCHECK_URL: 'https://hc-ping.com/00000000-0000-0000-0000-000000000000' };
  const pings: string[] = [], output: string[] = [];
  const request = async (url: string, init: any) => {
    if (url.includes('upstash.io')) return Response.json({ result: await r.command(...JSON.parse(init.body)) });
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'accepted-id' });
    pings.push(url); return new Response('OK');
  };
  const options = { env, args: [], request, now: () => 1000, output: (s: string) => output.push(s),
    inspect: async ({ manifest }: any) => observed(manifest, 1000) };
  assert.equal(await runNotifications(options), 0);
  assert.equal(output.length, 2);
  const extra=structuredClone(rehearsal);extra.pool='0x'+'aa'.repeat(20);extra.resolver='0x'+'bb'.repeat(20);
  extra.codeHashes[extra.pool]=rehearsal.codeHashes[rehearsal.pool];extra.codeHashes[extra.resolver]=rehearsal.codeHashes[rehearsal.resolver];
  const extraEnv={...env,FLURBO_PRACTICE_COLLECTIONS_JSON:JSON.stringify([{label:'October practice',manifest:extra}])};
  const before=output.length;assert.equal(await runNotifications({...options,env:extraEnv}),0);
  assert.equal(output.length-before,3);assert.ok(output.some(line=>JSON.parse(line).pool===extra.pool));
  assert.ok(!pings.at(-1)!.endsWith('/fail'));
  assert.equal(await runNotifications({...options,env:{...env,FLURBO_PRACTICE_COLLECTIONS_JSON:JSON.stringify([{label:'Duplicate',manifest:rehearsal}])}}),2);
  assert.equal(await runNotifications({ ...options, inspect: async () => { throw new Error('storage-secret'); } }), 2);
  assert.ok(pings.at(-1)!.endsWith('/fail'));
  assert.ok(!output.join('').includes('storage-secret'));
  assert.equal(await runNotifications({ ...options, env: { ...env, FLURBO_MONITOR_RESEND_KEY: '' } }), 2);
});
