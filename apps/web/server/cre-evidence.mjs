import {readFileSync} from 'node:fs';
import {parseCreEvidence} from '../shared/cre-evidence.mjs';

// Chainlink CRE price-feed evidence is committed per pool at config/cre-evidence/<pool address, lower case>.json.
// It is returned only when it names this exact pool and rules hash; anything else is treated as absent.
const DIRECTORY = new URL('../../../config/cre-evidence/', import.meta.url);

export function creEvidenceForManifest(manifest, {directory = DIRECTORY, read = file => readFileSync(file, 'utf8')} = {}) {
  const pool = typeof manifest?.pool === 'string' ? manifest.pool.toLowerCase() : '';
  if (!/^0x[0-9a-f]{40}$/.test(pool) || !/^0x[0-9a-fA-F]{64}$/.test(manifest.rulesHash ?? '')) return null;
  let raw;
  try { raw = read(new URL(`${pool}.json`, directory)); } catch { return null; }
  const evidence = parseCreEvidence(raw);
  return evidence && evidence.pool.toLowerCase() === pool && evidence.rulesHash.toLowerCase() === manifest.rulesHash.toLowerCase() ? evidence : null;
}
