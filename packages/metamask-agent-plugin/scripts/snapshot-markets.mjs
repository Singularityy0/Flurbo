import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Bundles a read-only list of the Flurbo pools (from config/collections.json) into dist/markets-snapshot.json so
// `mm flurbo markets` works offline. It holds addresses, questions and close times only; no keys, no endpoints.
export function snapshotMarkets(registry) {
  if (registry?.schema !== 'flurbo.collections.v1' || !Array.isArray(registry.collections)) throw new Error('Not a Flurbo collections registry');
  return {
    schema: 'flurbo.markets-snapshot.v1',
    network: { name: 'Monad testnet', chainId: 10143 },
    markets: registry.collections.filter(row => row.status === 'active' && row.manifest?.status === 'verified_pilot_snapshot').map(row => ({
      label: String(row.label),
      pool: String(row.manifest.pool),
      closesAt: row.manifest.publication.draft.closesAt,
      settlement: row.settlement,
      questions: row.manifest.publication.draft.events.map((event, index) => ({ index, scope: 2 ** index, question: String(event.question ?? event.id ?? `Question ${index}`) })),
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const registry = JSON.parse(readFileSync(new URL('../../../config/collections.json', import.meta.url), 'utf8'));
  const snapshot = snapshotMarkets(registry);
  mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../dist/markets-snapshot.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`markets-snapshot.json: ${snapshot.markets.length} pools`);
}
