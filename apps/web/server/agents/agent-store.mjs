import { createHash, randomUUID } from 'node:crypto';

// Agent persistence, isolated by authenticated Mera account. Every key is derived from a hash of the
// session's account address, so one account cannot name, read or modify another account's agents.
// The owner is never taken from request input.
const accountDigest = account => {
  if (typeof account !== 'string' || !/^0x[0-9a-f]{40}$/.test(account.toLowerCase())) throw new Error('Authenticated account required');
  return createHash('sha256').update(account.toLowerCase()).digest('hex');
};
const PREFIX = 'flurbo:agents:v1:';
// decisions and recentPaper bound the activity feed only. Proposals that issued a review are never
// dropped (a review can be sent at any time, so it must stay recoverable); resolved ones beyond the
// newest `fullProposals` are compacted. Accounting lives in running totals.
export const AGENT_LIMITS = Object.freeze({ agents: 10, agentsIncludingArchived: 50, decisions: 100, recentPaper: 100, fullProposals: 50,
  reviewsPerAgent: 200, evaluationsPerHour: 30, lockMs: 10_000, lockAttempts: 40, lockRetryMs: 25, conflictRetries: 3 });
export const STATE_SCHEMA = 'flurbo.agent-state.v2';
// Ownership scheme of the stored state. States below it are reconciled (ownership claimed, duplicate
// purchases uncounted) before they are read or changed.
const OWNERSHIP = 2;
// The v1 store capped all records at 100; a legacy list that full may have lost older records.
const LEGACY_CAP = 100;

const RELEASE = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
const WINDOW = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
// One atomic step: compare the agent's revision and every ownership record, then write the state, its
// revision and the new ownership records. KEYS: state, revision, ownership keys. ARGV: expected
// revision, state, next revision, then one value per ownership key. An ownership key that already
// holds a different value refuses the whole write (-1); the same value is accepted unchanged.
const SAVE = `if (redis.call('GET',KEYS[2]) or '0')~=ARGV[1] then return 0 end
for i=3,#KEYS do local e=redis.call('GET',KEYS[i]) if e and e~=ARGV[i+1] then return -1 end end
for i=3,#KEYS do redis.call('SET',KEYS[i],ARGV[i+1],'NX') end
redis.call('SET',KEYS[1],ARGV[2]) redis.call('SET',KEYS[2],ARGV[3]) return 1`;

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
    // Returns [revision, value] from one consistent read.
    versioned: async (key, revKey) => { const [value, rev] = await command('MGET', key, revKey); return [rev === null ? '0' : String(rev), value === null ? null : JSON.parse(value)]; },
    // 1 saved, 0 revision changed, -1 ownership conflict.
    save: async (key, revKey, expected, value, owned = []) => Number(await command('EVAL', SAVE, 2 + owned.length, key, revKey, ...owned.map(c => c.key),
      expected, JSON.stringify(value), String(Number(expected) + 1), ...owned.map(c => JSON.stringify(c.value)))),
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
    versioned: async (key, revKey) => { const v = live(key); return [String(live(revKey) ?? '0'), v === undefined ? null : structuredClone(v)]; },
    save: async (key, revKey, expected, value, owned = []) => {
      if (String(live(revKey) ?? '0') !== expected) return 0;
      if (owned.some(c => { const e = live(c.key); return e !== undefined && JSON.stringify(e) !== JSON.stringify(c.value); })) return -1;
      for (const c of owned) if (live(c.key) === undefined) data.set(c.key, structuredClone(c.value));
      data.set(key, structuredClone(value)); data.set(revKey, String(Number(expected) + 1)); return 1;
    },
  };
}

export const emptyState = () => ({ schema: STATE_SCHEMA, ownership: OWNERSHIP, decisions: [], proposals: [],
  paper: { fills: 0, costAtoms: '0', claims: {}, recent: [] }, live: { confirmedPurchases: 0, costAtoms: '0', unknownCost: 0 } });

// What recovery needs from a review: the exact transaction and what it was for. Receipt verification
// uses only the transaction.
export const compactReview = review => ({ action: review.action, amountAtoms: review.amountAtoms, expiresAt: review.expiresAt, transaction: review.transaction });
const TX_FIELDS = ['from', 'to', 'data', 'chainId', 'value'];
export const transactionDigest = tx => createHash('sha256').update(TX_FIELDS.map(f => String(tx[f]).toLowerCase()).join('|')).digest('hex');
// Verified ownership of an on-chain transaction, one per chain and hash across all agents and accounts.
// Only a receipt check that matched the proposal's reviewed transaction writes it.
export const ownershipKey = (chainId, hash) => `${PREFIX}owner:${chainId}:${hash.toLowerCase()}`;
export const VERIFIED = Object.freeze(['confirmed', 'reverted']);

const paperClaimKey = claim => `${claim.chainId}:${claim.pool}:${claim.scope}:${claim.mask}`;
// Add one paper fill (JSON form) to the running totals and its claim's aggregate.
export function addPaperFill(paper, fill) {
  const key = paperClaimKey(fill.claim), c = paper.claims[key] ?? { claim: fill.claim, quantityAtoms: '0', costAtoms: '0', fills: 0, lastBlock: '0' };
  paper.claims[key] = { claim: c.claim, quantityAtoms: (BigInt(c.quantityAtoms) + BigInt(fill.quantityAtoms)).toString(),
    costAtoms: (BigInt(c.costAtoms) + BigInt(fill.costAtoms)).toString(), fills: c.fills + 1,
    lastBlock: (BigInt(fill.snapshotBlock) > BigInt(c.lastBlock) ? BigInt(fill.snapshotBlock) : BigInt(c.lastBlock)).toString() };
  paper.fills += 1; paper.costAtoms = (BigInt(paper.costAtoms) + BigInt(fill.costAtoms)).toString();
}
// Count one confirmed agent-originated purchase exactly once, and take it back out exactly once.
export function addConfirmedPurchase(live, tx) {
  if (tx.accounted) return tx;
  live.confirmedPurchases += 1;
  if (tx.paidAtoms === null || tx.paidAtoms === undefined) live.unknownCost += 1;
  else live.costAtoms = (BigInt(live.costAtoms) + BigInt(tx.paidAtoms)).toString();
  return { ...tx, accounted: true };
}
export function removeConfirmedPurchase(live, tx) {
  if (!tx.accounted) return tx;
  live.confirmedPurchases -= 1;
  if (tx.paidAtoms === null || tx.paidAtoms === undefined) live.unknownCost -= 1;
  else live.costAtoms = (BigInt(live.costAtoms) - BigInt(tx.paidAtoms)).toString();
  return { ...tx, accounted: false };
}
// A proposal is confirmed only by a purchase it owns.
export const ownsPurchase = p => p.transactions.some(t => t.action === 'buy' && t.status === 'confirmed' && !t.attributedElsewhere);

// Every review a proposal issued, current or replaced, without duplicates.
function reviewsOf(p) {
  const out = [];
  for (const v of [p.review, ...(p.superseded ?? []), ...p.transactions.map(t => t.review)])
    if (v?.transaction && !out.some(x => transactionDigest(x.transaction) === transactionDigest(v.transaction))) out.push(compactReview(v));
  return out;
}
// Earlier v2 states kept only a few replaced reviews; bring them up to date.
function normalize(state) {
  for (const p of state.proposals) { if (!p.reviews) p.reviews = reviewsOf(p); delete p.superseded; }
  return state;
}

// Records written before v2 were one capped list. They are converted on read and saved on the next
// change. Totals are rebuilt from what that list still holds. A list at the old cap may have lost older
// records, so its totals are marked incomplete rather than presented as the full history.
export function migrateLegacy(list) {
  const state = { ...emptyState(), ownership: 0 }, decisions = list.filter(r => r.kind === 'decision');
  state.decisions = decisions;
  for (const r of [...list].reverse()) if (r.kind === 'paper') addPaperFill(state.paper, r.fill);
  state.paper.recent = list.filter(r => r.kind === 'paper');
  for (const r of state.paper.recent) { const d = decisions.find(x => x.id === r.decisionId); if (d) d.paperFillId = r.id; }
  state.proposals = list.filter(r => r.kind === 'proposal').map(r => {
    const source = decisions.find(d => d.id === r.decisionId);
    const transactions = r.transactions.map(t => (r.status === 'confirmed' && t.action === 'buy' && t.status === 'confirmed' ? addConfirmedPurchase(state.live, t) : t));
    return { ...r, version: r.version ?? 1, decision: r.decision ?? source?.decision ?? null, transactions };
  });
  if (list.length >= LEGACY_CAP) { state.live.incomplete = true; state.paper.incomplete = true; }
  return state;
}

export function agentStore(backend, { unresolved = () => true, chainId = 10143 } = {}) {
  const k = account => {
    const owner = accountDigest(account), base = PREFIX + owner;
    return { owner, index: base + ':index', archived: base + ':archived', lock: base + ':lock', agent: id => `${base}:agent:${id}`, legacy: id => `${base}:records:${id}`,
      state: id => `${base}:state:${id}`, rev: id => `${base}:rev:${id}`, rate: hour => `${base}:rate:${hour}` };
  };
  const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
  const conflict = (message, code) => { const e = new Error(message); e.status = 409; e.code = code; return e; };
  const busy = () => conflict('Another change to your agents is in progress. Retry shortly.', 'BUSY');
  // Serialise mutations per account. Critical sections are short (no network calls to the chain), so a
  // briefly held lock is waited for; persistent contention is reported, never waited out silently.
  async function locked(account, fn) {
    const keys = k(account);
    let token = null;
    for (let i = 0; i < AGENT_LIMITS.lockAttempts && !token; i++) {
      token = await backend.lock(keys.lock, AGENT_LIMITS.lockMs);
      if (!token) await new Promise(r => setTimeout(r, AGENT_LIMITS.lockRetryMs + Math.floor(Math.random() * AGENT_LIMITS.lockRetryMs)));
    }
    if (!token) throw busy();
    try { return await fn(keys); } finally { await backend.unlock(keys.lock, token); }
  }
  async function readState(keys, id) {
    const [rev, state] = await backend.versioned(keys.state(id), keys.rev(id));
    if (state) return [rev, normalize(state)];
    const legacy = await backend.get(keys.legacy(id));
    return [rev, legacy ? normalize(migrateLegacy(legacy)) : emptyState()];
  }
  // Bound the feed. Proposals that never issued a review may be dropped once resolved; the rest are
  // compacted, keeping every review and transaction needed for recovery and accounting.
  function retain(state) {
    state.decisions = state.decisions.slice(0, AGENT_LIMITS.decisions);
    state.paper.recent = state.paper.recent.slice(0, AGENT_LIMITS.recentPaper);
    let resolved = 0;
    state.proposals = state.proposals.filter(p => {
      if (unresolved(p) || ++resolved <= AGENT_LIMITS.fullProposals) return true;
      if (!p.reviews.length) return false;
      delete p.decision; if (p.review) p.review = compactReview(p.review);
      return true;
    });
    return state;
  }
  // Ownership reads and claims for one change. Claims are written in the same atomic step as the state.
  function ownership(keys, id) {
    const claims = new Map();
    const valueFor = (proposalId, transaction) => ({ owner: keys.owner, agentId: id, proposalId, transaction });
    return {
      claims,
      owner: keys.owner,
      read: async hash => claims.get(hash.toLowerCase())?.value ?? backend.get(ownershipKey(chainId, hash)),
      owns: (value, proposalId, transaction) => JSON.stringify(value) === JSON.stringify(valueFor(proposalId, transaction)),
      claim: (hash, proposalId, transaction) => claims.set(hash.toLowerCase(), { key: ownershipKey(chainId, hash), value: valueFor(proposalId, transaction) }),
    };
  }
  // Bring an older state to the ownership scheme, idempotently. A transaction verified by a receipt
  // check (confirmed or reverted) claims ownership if nobody holds it; if another proposal already owns
  // it, it is marked as attributed elsewhere and any purchase it counted is taken back out, so the same
  // purchase is never counted twice. Running it again changes nothing.
  async function reconcile(state, own) {
    for (const p of state.proposals) {
      for (let i = 0; i < p.transactions.length; i++) {
        const t = p.transactions[i];
        if (!VERIFIED.includes(t.status) || t.attributedElsewhere) continue;
        const digest = transactionDigest(t.review.transaction), existing = await own.read(t.hash);
        if (!existing) own.claim(t.hash, p.id, digest);
        else if (!own.owns(existing, p.id, digest)) p.transactions[i] = { ...removeConfirmedPurchase(state.live, t), attributedElsewhere: true };
      }
      if (p.status === 'confirmed' && !ownsPurchase(p)) p.status = 'attributed-elsewhere';
    }
    state.ownership = OWNERSHIP;
  }
  async function commit(keys, id, rev, state, own) {
    const saved = await backend.save(keys.state(id), keys.rev(id), rev, retain(state), [...own.claims.values()]);
    if (saved === -1) { const e = conflict('This transaction was verified for another proposal at the same moment. Retry.', 'OWNERSHIP_RACE'); e.retry = true; throw e; }
    if (saved !== 1) throw busy();
    await backend.del(keys.legacy(id));
  }
  // One atomic change to an agent's decisions, proposals and totals. `change(state, profile, own)` edits
  // the state in place and returns a result; if it throws, nothing is written. If another server claimed
  // the same transaction first, the whole change is re-read and re-run, so it sees that owner.
  async function mutate(account, id, change) {
    if (!validId(id)) return null;
    for (let attempt = 1; ; attempt++) {
      try {
        return await locked(account, async keys => {
          const profile = await backend.get(keys.agent(id));
          if (!profile) return null;
          const [rev, state] = await readState(keys, id), own = ownership(keys, id);
          if ((state.ownership ?? 0) < OWNERSHIP) await reconcile(state, own);
          const result = await change(state, profile, own);
          await commit(keys, id, rev, state, own);
          return result;
        });
      } catch (e) {
        if (!e.retry || attempt >= AGENT_LIMITS.conflictRetries) throw e;
      }
    }
  }
  return {
    durable: backend.durable,
    mutate,
    async list(account) {
      const keys = k(account), ids = (await backend.get(keys.index)) ?? [];
      return (await Promise.all(ids.map(id => backend.get(keys.agent(id))))).filter(Boolean);
    },
    async listArchived(account) {
      const keys = k(account), ids = (await backend.get(keys.archived)) ?? [];
      return (await Promise.all(ids.map(id => backend.get(keys.agent(id))))).filter(Boolean);
    },
    // Archived agents stay readable so their transactions can still be recorded and verified. An older
    // state is reconciled (and saved) before it is shown, so duplicated totals are never presented.
    async get(account, id) {
      if (!validId(id)) return null;
      const keys = k(account), profile = await backend.get(keys.agent(id));
      if (!profile) return null;
      let [, state] = await readState(keys, id);
      if ((state.ownership ?? 0) < OWNERSHIP) {
        if (await mutate(account, id, () => true) === null) return null;
        [, state] = await readState(keys, id);
      }
      return { profile, state };
    },
    async create(account, profile) {
      return locked(account, async keys => {
        const ids = (await backend.get(keys.index)) ?? [], archived = (await backend.get(keys.archived)) ?? [];
        if (ids.length >= AGENT_LIMITS.agents) throw conflict(`An account can have at most ${AGENT_LIMITS.agents} agents.`, 'AGENT_LIMIT');
        if (ids.length + archived.length >= AGENT_LIMITS.agentsIncludingArchived) throw conflict(`An account can create at most ${AGENT_LIMITS.agentsIncludingArchived} agents, including archived ones.`, 'AGENT_LIMIT');
        const id = randomUUID(), saved = { ...profile, id };
        await backend.set(keys.agent(id), saved); await backend.set(keys.index, [...ids, id]);
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
    // Deleting archives: the agent stops evaluating and proposing and its activity feed is cleared, but
    // its proposals, reviews, transactions and totals are kept, so a transaction that was already sent
    // can still be recorded, verified and counted once.
    async archive(account, id, at) {
      if (!validId(id)) return false;
      // Marked archived first, so no new work starts; the feed is cleared afterwards.
      const archived = await locked(account, async keys => {
        const ids = (await backend.get(keys.index)) ?? [], profile = await backend.get(keys.agent(id));
        if (!ids.includes(id) || !profile) return false;
        await backend.set(keys.agent(id), { ...profile, status: 'archived', archivedAt: at, updatedAt: at });
        await backend.set(keys.archived, [...((await backend.get(keys.archived)) ?? []), id]);
        await backend.set(keys.index, ids.filter(x => x !== id));
        return true;
      });
      if (archived) await mutate(account, id, state => { state.decisions = []; state.paper.recent = []; return true; });
      return archived;
    },
    async allowEvaluation(account, nowMs = Date.now()) {
      const hour = Math.floor(nowMs / 3_600_000);
      return (await backend.count(k(account).rate(hour), 7200)) <= AGENT_LIMITS.evaluationsPerHour;
    },
  };
}
