import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { redisCommand } from '../server/redis-session.mjs';
import { agentStore, redisBackend, attributionKey } from '../server/agents/agent-store.mjs';

// Validates the agent store's Redis operations (SET NX PX locks, the Lua scripts, MGET) against a real
// Redis-compatible service before hosted rollout. Run it only against a test database or namespace:
//   FLURBO_AGENT_REDIS_CHECK=1 UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/check-agent-redis.mjs
// It writes only keys under flurbo:agents:v1: for a random throwaway account and random transaction
// hashes, never settlement-monitor, resolution or other keys, and deletes every key it wrote.
const PREFIX = 'flurbo:agents:v1:';

export async function checkAgentRedis(command, log = () => {}) {
  const written = new Set(), results = [];
  const guarded = async (op, ...args) => {
    const keys = op === 'EVAL' ? args.slice(2, 2 + Number(args[1])) : op === 'MGET' ? args : ['SET', 'GET', 'DEL', 'TTL', 'EXISTS'].includes(op) ? [args[0]] : null;
    if (!keys) throw new Error(`Unexpected command ${op}`);
    for (const key of keys) if (typeof key !== 'string' || !key.startsWith(PREFIX)) throw new Error('Refusing a key outside the agent namespace');
    if (op === 'SET' || op === 'EVAL') keys.forEach(k => written.add(k));
    return command(op, ...args);
  };
  const check = async (name, fn) => {
    try { await fn(); results.push([name, true]); log(`PASS ${name}`); }
    catch (e) { results.push([name, false]); log(`FAIL ${name}: ${e.message}`); }
  };
  const ok = (value, message) => { if (!value) throw new Error(message); };
  const account = '0x' + randomBytes(20).toString('hex'), hash = () => '0x' + randomBytes(32).toString('hex');
  const backend = redisBackend(guarded), store = agentStore(backend);
  try {
    const base = PREFIX + 'selfcheck:' + randomBytes(8).toString('hex');
    await check('lock is exclusive and released only by its token', async () => {
      const a = await backend.lock(base + ':lock', 5000), b = await backend.lock(base + ':lock', 5000);
      ok(a && !b, 'second lock was granted');
      await backend.unlock(base + ':lock', 'not-the-token'); ok(!await backend.lock(base + ':lock', 5000), 'wrong token released the lock');
      await backend.unlock(base + ':lock', a); const c = await backend.lock(base + ':lock', 5000); ok(c, 'lock not released'); await backend.unlock(base + ':lock', c);
    });
    await check('hourly counter increments and expires', async () => {
      ok(await backend.count(base + ':rate', 7200) === 1 && await backend.count(base + ':rate', 7200) === 2, 'count did not increment');
      const ttl = Number(await guarded('TTL', base + ':rate')); ok(ttl > 0 && ttl <= 7200, 'counter has no expiry');
    });
    const s = base + ':state', r = base + ':rev';
    await check('versioned read of missing keys', async () => { const [rev, value] = await backend.versioned(s, r); ok(rev === '0' && value === null, 'unexpected initial state'); });
    await check('compare-and-set saves once and refuses a stale revision', async () => {
      ok(await backend.save(s, r, '0', { n: 1 }) === 1, 'first save failed');
      ok(await backend.save(s, r, '0', { n: 2 }) === 0, 'stale save accepted');
      const [rev, value] = await backend.versioned(s, r); ok(rev === '1' && value.n === 1, 'state or revision wrong');
    });
    const h = hash(), key = attributionKey(10143, h), mine = { owner: 'a', agentId: 'x', proposalId: 'p', transaction: 'd' };
    await check('attribution claim is written atomically with the state', async () => {
      ok(await backend.save(s, r, '1', { n: 2 }, [{ key, value: mine, mode: 'claim' }]) === 1, 'claim save failed');
      ok(JSON.stringify(await backend.get(key)) === JSON.stringify(mine), 'attribution not stored');
    });
    await check('a conflicting claim refuses the whole write', async () => {
      ok(await backend.save(s, r, '2', { n: 3 }, [{ key, value: { ...mine, proposalId: 'q' }, mode: 'claim' }]) === -1, 'conflict not detected');
      const [rev, value] = await backend.versioned(s, r); ok(rev === '2' && value.n === 2, 'state changed despite conflict');
    });
    await check('the same claim again is accepted; backfill never overwrites', async () => {
      ok(await backend.save(s, r, '2', { n: 3 }, [{ key, value: mine, mode: 'claim' }, { key, value: { ...mine, proposalId: 'z' }, mode: 'backfill' }]) === 1, 'save failed');
      ok((await backend.get(key)).proposalId === 'p', 'backfill overwrote');
    });
    await check('release removes only the exact attribution', async () => {
      ok(await backend.save(s, r, '3', { n: 4 }, [{ key, value: { ...mine, proposalId: 'other' }, mode: 'release' }]) === 1 && await backend.get(key), 'released another attribution');
      ok(await backend.save(s, r, '4', { n: 5 }, [{ key, value: mine, mode: 'release' }]) === 1 && !await backend.get(key), 'did not release');
    });
    await check('concurrent claims of one transaction: exactly one wins', async () => {
      const h2 = hash(), k2 = attributionKey(10143, h2), s2 = base + ':race', r2 = base + ':race-rev';
      const outcomes = await Promise.all(['one', 'two'].map((p, i) => backend.save(s2 + i, r2 + i, '0', { p }, [{ key: k2, value: { ...mine, proposalId: p }, mode: 'claim' }])));
      ok(outcomes.filter(x => x === 1).length === 1 && outcomes.filter(x => x === -1).length === 1, `outcomes ${outcomes}`);
    });
    await check('store: create, mutate with attribution, archive, read back', async () => {
      const profile = await store.create(account, { name: 'Redis check', status: 'active' }), h3 = hash();
      await store.mutate(account, profile.id, (state, _p, tx) => { state.proposals.push({ id: 'p1', status: 'submitted', reviews: [], transactions: [] }); tx.attribute(h3, { proposalId: 'p1', transaction: 'd' }); return true; });
      written.add(attributionKey(10143, h3));
      ok(await store.archive(account, profile.id, 0), 'archive failed');
      const read = await store.get(account, profile.id);
      ok(read.profile.status === 'archived' && read.state.proposals[0].id === 'p1', 'archived agent not readable');
      ok((await store.listArchived(account)).length === 1 && (await store.list(account)).length === 0, 'indexes wrong');
    });
  } finally {
    for (const key of written) await command('DEL', key);
    // Store keys derived from the throwaway account.
    const left = [];
    for (const key of written) if (Number(await command('EXISTS', key))) left.push(key);
    log(left.length ? `CLEANUP left ${left.length} key(s)` : 'CLEANUP removed all test keys');
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.env.FLURBO_AGENT_REDIS_CHECK !== '1') { console.error('Set FLURBO_AGENT_REDIS_CHECK=1 and point UPSTASH_REDIS_REST_URL/TOKEN at a test database.'); process.exit(2); }
  const results = await checkAgentRedis(redisCommand(process.env), line => console.log(line));
  process.exit(results.every(([, passed]) => passed) ? 0 : 1);
}
