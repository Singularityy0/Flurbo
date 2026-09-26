import { createHash, randomUUID } from 'node:crypto';

// Agent persistence, isolated by authenticated Mera account. Every key is derived from a hash of the
// session's account address, so one account cannot name, read or modify another account's agents.
// The owner is never taken from request input.
const accountKey = account => {
  if (typeof account !== 'string' || !/^0x[0-9a-f]{40}$/.test(account.toLowerCase())) throw new Error('Authenticated account required');
  return 'flurbo:agents:v1:' + createHash('sha256').update(account.toLowerCase()).digest('hex');
};
export const AGENT_LIMITS = Object.freeze({ agents: 10, records: 100, evaluationsPerHour: 30, lockMs: 10_000 });

const RELEASE = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
const WINDOW = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";

// Backends expose the same small surface. Redis (Upstash REST) when hosted; memory only for local
// development and tests, and never when hosted.
export function redisBackend(command) {
  return {
    durable: true,
    get: async key => { const raw = await command('GET', key); return raw === null ? null : JSON.parse(raw); },
    set: (key, value) => command('SET', key, JSON.stringify(value)),
    del: key => command('DEL', key),
    lock: async (key, ms) => { const token = randomUUID(); return await command('SET', key, token, 'NX', 'PX', ms) === 'OK' ? token : null; },
    unlock: (key, token) => command('EVAL', RELEASE, 1, key, token),
    count: async (key, seconds) => Number(await command('EVAL', WINDOW, 1, key, String(seconds))),
  };
}
export function memoryBackend(now = Date.now) {
  const data = new Map(), expiry = new Map();
  const live = key => { if (expiry.has(key) && expiry.get(key) <= now()) { data.delete(key); expiry.delete(key); } return data.get(key); };
  return {
    durable: false,
    get: async key => { const v = live(key); return v === undefined ? null : structuredClone(v); },
    set: async (key, value) => { data.set(key, structuredClone(value)); expiry.delete(key); },
    del: async key => { data.delete(key); expiry.delete(key); },
    lock: async (key, ms) => { if (live(key) !== undefined) return null; const token = randomUUID(); data.set(key, token); expiry.set(key, now() + ms); return token; },
    unlock: async (key, token) => { if (live(key) === token) { data.delete(key); expiry.delete(key); } },
    count: async (key, seconds) => { const n = (live(key) ?? 0) + 1; data.set(key, n); if (n === 1) expiry.set(key, now() + seconds * 1000); return n; },
  };
}

export function agentStore(backend) {
  const k = account => {
    const base = accountKey(account);
    return { index: base + ':index', lock: base + ':lock', agent: id => `${base}:agent:${id}`, records: id => `${base}:records:${id}`, rate: hour => `${base}:rate:${hour}` };
  };
  const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
  // Serialise mutations per account. Contention is reported, never waited out silently.
  async function locked(account, fn) {
    const keys = k(account), token = await backend.lock(keys.lock, AGENT_LIMITS.lockMs);
    if (!token) { const e = new Error('Another change to your agents is in progress. Retry shortly.'); e.status = 409; throw e; }
    try { return await fn(keys); } finally { await backend.unlock(keys.lock, token); }
  }
  return {
    durable: backend.durable,
    async list(account) {
      const keys = k(account), ids = (await backend.get(keys.index)) ?? [];
      const profiles = await Promise.all(ids.map(id => backend.get(keys.agent(id))));
      return profiles.filter(Boolean);
    },
    async get(account, id) {
      if (!validId(id)) return null;
      const keys = k(account), profile = await backend.get(keys.agent(id));
      return profile ? { profile, records: (await backend.get(keys.records(id))) ?? [] } : null;
    },
    async create(account, profile) {
      return locked(account, async keys => {
        const ids = (await backend.get(keys.index)) ?? [];
        if (ids.length >= AGENT_LIMITS.agents) { const e = new Error(`An account can have at most ${AGENT_LIMITS.agents} agents.`); e.status = 409; throw e; }
        const id = randomUUID(), saved = { ...profile, id };
        await backend.set(keys.agent(id), saved); await backend.set(keys.records(id), []); await backend.set(keys.index, [...ids, id]);
        return saved;
      });
    },
    async update(account, id, change) {
      if (!validId(id)) return null;
      return locked(account, async keys => {
        const current = await backend.get(keys.agent(id));
        if (!current) return null;
        const next = await change(current);
        await backend.set(keys.agent(id), next);
        return next;
      });
    },
    async remove(account, id) {
      if (!validId(id)) return false;
      return locked(account, async keys => {
        const ids = (await backend.get(keys.index)) ?? [];
        if (!ids.includes(id)) return false;
        await backend.set(keys.index, ids.filter(x => x !== id)); await backend.del(keys.agent(id)); await backend.del(keys.records(id));
        return true;
      });
    },
    // Records are newest first and capped. `change` receives the current list and returns [list, result].
    async records(account, id, change) {
      if (!validId(id)) return null;
      return locked(account, async keys => {
        if (!await backend.get(keys.agent(id))) return null;
        const [next, result] = await change((await backend.get(keys.records(id))) ?? []);
        await backend.set(keys.records(id), next.slice(0, AGENT_LIMITS.records));
        return result;
      });
    },
    async allowEvaluation(account, nowMs = Date.now()) {
      const hour = Math.floor(nowMs / 3_600_000);
      return (await backend.count(k(account).rate(hour), 7200)) <= AGENT_LIMITS.evaluationsPerHour;
    },
  };
}
