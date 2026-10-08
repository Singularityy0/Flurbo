// Validates the evidence the Chainlink CRE price-feed workflow prints (workflows/cre/src/price-feed.ts).
// It is shown in the app next to the pool's own result; it never settles anything.
export const CRE_EVIDENCE_SCHEMA = 'flurbo.cre-price-evidence.v1';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/, HASH = /^0x[0-9a-fA-F]{64}$/, DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const THRESHOLD = /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$/, LABEL = /^[A-Za-z0-9 ./()_-]{1,48}$/;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const uint = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;

function blockRef(value) {
  if (!exact(value, ['number', 'hash', 'timestamp']) || !DECIMAL.test(value.number) || value.number === '0' ||
      !HASH.test(value.hash) || !uint(value.timestamp, 2 ** 40)) return null;
  return { number: value.number, hash: value.hash, timestamp: value.timestamp };
}

/** Returns a clean copy of valid evidence, or null. Consistency is checked, not just shape. */
export function parseCreEvidence(raw) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!exact(value, ['schema', 'pool', 'rulesHash', 'block', 'previousBlock', 'observations', 'yesMask', 'observationsHash', 'unsignedReport', 'onchain', 'notice']) ||
      value.schema !== CRE_EVIDENCE_SCHEMA || !ADDRESS.test(value.pool) || !HASH.test(value.rulesHash) ||
      !HASH.test(value.observationsHash) || typeof value.notice !== 'string' || value.notice.length > 200 ||
      typeof value.unsignedReport !== 'string' || !/^0x[0-9a-fA-F]{448}$/.test(value.unsignedReport) ||
      !Array.isArray(value.observations) || value.observations.length < 2 || value.observations.length > 4 || !uint(value.yesMask, 15)) return null;
  const block = blockRef(value.block), previousBlock = blockRef(value.previousBlock);
  if (!block || !previousBlock || BigInt(previousBlock.number) + 1n !== BigInt(block.number) || previousBlock.timestamp > block.timestamp) return null;
  const seen = new Set();
  let mask = 0;
  const observations = [];
  for (const row of value.observations) {
    if (!exact(row, ['eventIndex', 'label', 'feed', 'roundId', 'answer', 'decimals', 'updatedAt', 'threshold', 'yes']) ||
        !uint(row.eventIndex, 3) || seen.has(row.eventIndex) || typeof row.label !== 'string' || !LABEL.test(row.label) ||
        !ADDRESS.test(row.feed) || !DECIMAL.test(row.roundId) || !DECIMAL.test(row.answer) || !DECIMAL.test(row.updatedAt) ||
        !uint(row.decimals, 36) || typeof row.threshold !== 'string' || !THRESHOLD.test(row.threshold) || typeof row.yes !== 'boolean') return null;
    seen.add(row.eventIndex);
    if (row.yes) mask += 2 ** row.eventIndex;
    observations.push({ eventIndex: row.eventIndex, label: row.label, feed: row.feed, roundId: row.roundId, answer: row.answer,
      decimals: row.decimals, updatedAt: row.updatedAt, threshold: row.threshold, yes: row.yes });
  }
  if (mask !== value.yesMask) return null;
  // The unsigned report is seven ABI words; the first is the version, the last the yes mask, and it must name this pool and rules.
  const words = value.unsignedReport.slice(2).match(/.{64}/g);
  if (BigInt('0x' + words[0]) !== 2n || BigInt('0x' + words[6]) !== BigInt(value.yesMask) ||
      words[2].slice(24).toLowerCase() !== value.pool.slice(2).toLowerCase() || '0x' + words[3] !== value.rulesHash.toLowerCase() ||
      '0x' + words[5] !== value.observationsHash.toLowerCase() || BigInt('0x' + words[4]) !== BigInt(block.timestamp)) return null;
  let onchain = null;
  if (value.onchain !== null) {
    const o = value.onchain;
    if (!exact(o, ['resolvedState', 'voidMask', 'matches']) || !uint(o.resolvedState, 15) || !uint(o.voidMask, 15) || typeof o.matches !== 'boolean' ||
        o.matches !== (o.resolvedState === value.yesMask && o.voidMask === 0)) return null;
    onchain = { resolvedState: o.resolvedState, voidMask: o.voidMask, matches: o.matches };
  }
  return { schema: CRE_EVIDENCE_SCHEMA, pool: value.pool, rulesHash: value.rulesHash, block, previousBlock, observations,
    yesMask: value.yesMask, observationsHash: value.observationsHash, unsignedReport: value.unsignedReport, onchain, notice: value.notice };
}

export const MONAD_MAINNET_EXPLORER = 'https://monadscan.com';
export const blockUrl = number => `${MONAD_MAINNET_EXPLORER}/block/${number}`;
