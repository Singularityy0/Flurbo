import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildConfig, kuruMarketsFrom } from '../scripts/generate-config.mjs';

const root = new URL('../../../', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('config/collections.json', root), 'utf8'));
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const listing = (n, patch = {}) => ({ schema: 'flurbo.kuru-listing.v1', status: 'verified_kuru_snapshot', chainId: 10143,
  pool: '0x' + String(n).repeat(40), eventIndex: 2, receipt: '0x' + 'aa'.repeat(20), market: '0x' + 'AB'.repeat(19) + 'c' + n, ...patch });
const listings = (...rows) => ({ schema: 'flurbo.kuru-listings.v1', listings: rows });

test('without Kuru listings the config still declares the market contract but indexes no market address', () => {
  const { yaml, kuruMarketsTs, kuruMarkets } = buildConfig({ registry });
  assert.equal(kuruMarkets, 0);
  assert.match(yaml, /^  - name: KuruMarket$/m);
  assert.match(yaml, /BaseWrapped\(address indexed owner, uint32 indexed scope, uint8 indexed mask, uint128 quantity\)/);
  assert.match(yaml, /BaseUnwrapped\(/);
  assert.match(yaml, /field_selection:\n  transaction_fields:\n    - hash/);
  assert.equal(yaml.match(/- name: KuruMarket/g).length, 1);
  assert.doesNotMatch(kuruMarketsTs, /"0x/);
});

test('listed Kuru markets become lowercase chain addresses and a pool and question map', () => {
  const { yaml, kuruMarketsTs, kuruMarkets } = buildConfig({ registry, kuruListings: listings(listing(2), listing(1)) });
  assert.equal(kuruMarkets, 2);
  assert.equal(yaml.match(/- name: KuruMarket/g).length, 2);
  const addresses = [...yaml.slice(yaml.lastIndexOf('- name: KuruMarket')).matchAll(/"(0x[0-9a-f]{40})"/g)].map(m => m[1]);
  assert.deepEqual(addresses, [...addresses].sort());
  assert.equal(addresses.length, 2);
  assert.ok(addresses.every(a => a === a.toLowerCase()));
  assert.match(kuruMarketsTs, /: \{ pool: "0x1{40}", eventIndex: 2 \}/);
  assert.match(kuruMarketsTs, /: \{ pool: "0x2{40}", eventIndex: 2 \}/);
});

test('unverified, duplicate, oversized or foreign listings are refused', () => {
  assert.deepEqual(kuruMarketsFrom(null), []);
  assert.throws(() => kuruMarketsFrom(listings(listing(1, { status: 'unverified_pilot_kuru' }))), /Invalid Kuru listings/);
  assert.throws(() => kuruMarketsFrom(listings(listing(1, { chainId: 1 }))), /Invalid Kuru listings/);
  assert.throws(() => kuruMarketsFrom(listings(listing(1), listing(1))), /Invalid Kuru listings/);
  assert.throws(() => kuruMarketsFrom(listings(listing(1, { market: '0x1234' }))), /Invalid Kuru listings/);
  assert.throws(() => kuruMarketsFrom(listings(listing(1, { eventIndex: 40 }))), /Invalid Kuru listings/);
  assert.throws(() => kuruMarketsFrom(listings(...Array.from({ length: 9 }, (_, i) => listing(i + 1, { market: '0x' + (i + 1).toString(16).padStart(40, '0') })))), /Invalid Kuru listings/);
  assert.throws(() => kuruMarketsFrom({ schema: 'flurbo.kuru-listings.v2', listings: [listing(1)] }), /Invalid Kuru listings/);
  assert.throws(() => kuruMarketsFrom(listings()), /Invalid Kuru listings/);
});

test('the committed config and market map are exactly what the generator produces', () => {
  const kuruFile = new URL('config/kuru-listings.json', root);
  const { yaml, kuruMarketsTs } = buildConfig({ registry, kuruListings: existsSync(kuruFile) ? JSON.parse(readFileSync(kuruFile, 'utf8')) : null });
  assert.equal(read('../config.yaml'), yaml, 'run npm run config in packages/envio-indexer');
  assert.equal(read('../src/kuru-markets.generated.ts'), kuruMarketsTs, 'run npm run config in packages/envio-indexer');
});

test('every active pool and resolver in the registry is indexed', () => {
  const yaml = read('../config.yaml');
  for (const row of registry.collections.filter(c => c.status === 'active')) {
    assert.ok(yaml.includes(row.manifest.pool.toLowerCase()), row.label);
    assert.ok(yaml.includes(row.manifest.resolver.toLowerCase()), row.label);
  }
});
