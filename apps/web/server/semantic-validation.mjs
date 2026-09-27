import { createHash } from 'node:crypto';
import { validateClaim } from '../shared/claims.mjs';

// Operator-reviewed predicates only. Client text/model output never establishes a relationship.
// Values are integer observation atoms; identical observation IDs mean identical source, instrument,
// timestamp/window, sampling, units and rounding, documented by the operator in sourceRule.
const hex = (v, n) => typeof v === 'string' && new RegExp(`^0x[0-9a-f]{${n}}$`).test(v);
const integer = v => typeof v === 'string' && /^-?(0|[1-9][0-9]{0,35})$/.test(v);
const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const bad = message => { throw Object.assign(new Error(message), { status: 400, code: 'INVALID_SEMANTIC_INPUT' }); };
const truth = (value, p) => ({ lt: value < BigInt(p.value), lte: value <= BigInt(p.value), gt: value > BigInt(p.value), gte: value >= BigInt(p.value), eq: value === BigInt(p.value) })[p.operator];

export function semanticRegistry(raw = process.env.FLURBO_SEMANTIC_RULES_JSON || '') {
  if (!raw) return [];
  const v = JSON.parse(raw);
  if (v?.schema !== 'flurbo.semantic-rules.v1' || !Array.isArray(v.markets) || v.markets.length > 50) throw Error('Invalid semantic rules configuration');
  const seen = new Set();
  return v.markets.map(m => {
    if (!hex(m.pool, 40) || !hex(m.rulesHash, 64) || seen.has(m.pool) || !Array.isArray(m.predicates) || m.predicates.length > 4) throw Error('Invalid semantic market binding');
    seen.add(m.pool);
    const ids = new Set();
    const predicates = m.predicates.map(p => {
      if (!Number.isInteger(p.event) || p.event < 0 || p.event > 3 || ids.has(p.event) || typeof p.observation !== 'string' || !/^[a-zA-Z0-9:_./-]{1,160}$/.test(p.observation)
        || !['lt', 'lte', 'gt', 'gte', 'eq'].includes(p.operator) || !integer(p.value) || typeof p.sourceRule !== 'string' || p.sourceRule.length < 10 || p.sourceRule.length > 2000) throw Error('Invalid semantic predicate');
      ids.add(p.event);
      return { event: p.event, observation: p.observation, operator: p.operator, value: p.value, sourceRule: p.sourceRule };
    }).sort((a, b) => a.event - b.event);
    return { pool: m.pool, rulesHash: m.rulesHash, predicates };
  });
}

export function assessSemantics(manifest, input, registry = semanticRegistry(), now = Math.floor(Date.now() / 1000)) {
  if (!input || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'mask,quantityAtoms,scope' || typeof input.mask !== 'string'
    || !/^[1-9][0-9]{0,2}$/.test(input.mask) || typeof input.quantityAtoms !== 'string' || !/^[1-9][0-9]{0,8}$/.test(input.quantityAtoms) || BigInt(input.quantityAtoms) > 100_000_000n) bad('Choose a supported claim and quantity.');
  const count = manifest.publication.draft.events.length;
  if (!Number.isInteger(count) || count < 1 || count > 4) throw Error('Unsupported semantic deployment');
  try { validateClaim(input.scope, input.mask, count); } catch { bad('Choose a supported claim and quantity.'); }
  const pool = manifest.pool.toLowerCase(), rulesHash = manifest.rulesHash;
  const entry = registry.find(m => m.pool === pool);
  if (entry && (entry.rulesHash !== rulesHash || entry.predicates.some(p => p.event >= count))) throw Error('Semantic rules do not match this deployment');
  const predicates = entry?.predicates || [], selected = Array.from({ length: count }, (_, i) => i).filter(i => input.scope & (1 << i));
  const groups = new Map();
  for (const p of predicates) groups.set(p.observation, [...(groups.get(p.observation) || []), p]);
  const feasible = state => [...groups.values()].every(group => {
    const candidates = new Set(group.flatMap(p => [BigInt(p.value) - 1n, BigInt(p.value), BigInt(p.value) + 1n]));
    return [...candidates].some(value => group.every(p => truth(value, p) === Boolean(state & (1 << p.event))));
  });
  const pays = state => {
    const local = selected.reduce((s, event, i) => s | (state & (1 << event) ? 1 << i : 0), 0);
    return Boolean(BigInt(input.mask) & (1n << BigInt(local)));
  };
  const matrix = Array.from({ length: 1 << count }, (_, state) => ({ state, admissible: feasible(state), pays: pays(state) }));
  const admissible = matrix.filter(s => s.admissible);
  if (!admissible.length) throw Error('Semantic rules exclude every state');
  const collision = !admissible.some(s => s.pays);
  const coverage = selected.every(i => predicates.some(p => p.event === i)) ? 'complete' : predicates.length ? 'partial' : 'unknown';
  const quantity = BigInt(input.quantityAtoms);
  // Exact existing uniform-VOID fractions. Do not use feasibility filtering here: old contracts do not.
  const voidPayouts = [];
  for (let invalid = 1; invalid < 1 << count; invalid++) for (let yes = 0; yes < 1 << count; yes++) {
    if (yes & invalid) continue;
    const completions = matrix.filter(s => (s.state & ~invalid) === yes);
    // Only assert semantic consistency for observed, non-VOID answers.
    if (!completions.some(s => s.admissible)) continue;
    voidPayouts.push(quantity * BigInt(completions.filter(s => s.pays).length) / BigInt(completions.length));
  }
  const maxVoid = voidPayouts.reduce((a, b) => a > b ? a : b, 0n);
  return { schema: 'flurbo.semantic-assessment.v1', pool, rulesHash, scope: input.scope, mask: input.mask, quantityAtoms: input.quantityAtoms,
    status: collision ? 'collision' : coverage === 'complete' ? 'no_declared_collision' : 'unknown', code: collision ? 'SEMANTIC_COLLISION' : coverage === 'complete' ? null : 'SEMANTICS_UNKNOWN',
    coverage, rulesDigest: digest(entry || { pool, rulesHash, predicates: [] }), checkedAt: now, expiresAt: now + 60,
    ordinaryMinimumPayoutAtoms: (admissible.every(s => s.pays) ? quantity : 0n).toString(), ordinaryMaximumPayoutAtoms: (collision ? 0n : quantity).toString(),
    maximumVoidPayoutAtoms: maxVoid.toString(), matrix, predicates,
    notice: collision ? 'These answers have no winning ordinary outcome under the configured rules. Existing VOID payouts may differ. Automated purchases are blocked.'
      : coverage === 'complete' ? 'No collision under the configured predicates. This is not a forecast or a profit guarantee.' : 'Semantic relationships are not fully configured for these events. This check does not establish real-world feasibility.' };
}

export function requireSemanticPurchase(manifest, input, registry) {
  const result = assessSemantics(manifest, input, registry);
  if (result.status === 'collision') throw Object.assign(new Error(result.notice), { status: 409, code: 'SEMANTIC_COLLISION' });
  return result;
}
