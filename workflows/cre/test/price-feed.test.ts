import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { decodeAbiParameters, encodeFunctionResult, parseAbi, parseAbiParameters, type Address, type Hex } from 'viem';
import {
  MAX_HEADER_READS, MULTICALL3, PRICE_FEED_SCHEMA, buildEvidence, decideGte, decodeFeedMulticall, decodePoolMulticall,
  encodeFeedMulticall, encodePoolMulticall, encodeReport, findObservationBlock, nextProbe, observationsHash, priceFeedConfigSchema,
  yesMaskFrom, type BlockRef, type FeedObservation, type PriceFeedConfig,
} from '../src/price-feed';
import { priceFeedConfigFromManifest } from '../scripts/price-feed-config';

const registry = JSON.parse(readFileSync(new URL('../../../config/collections.json', import.meta.url), 'utf8'));
const weekend = registry.collections.find((c: any) => c.label === 'Crypto weekend').manifest;
const config = priceFeedConfigFromManifest(weekend);

// Values the CRE simulator printed for the settled Crypto weekend pool (docs/cre-evidence/crypto-weekend-simulation.txt).
const block: BlockRef = { number: 110317694n, hash: '0x558cd759b36be21596d38480b6b00736586ff363845b394e2f38254b6f8a2e7c', timestamp: 1791072000 };
const prev: BlockRef = { number: 110317693n, hash: '0x4ae7eec124a0ba4b943e89494138183e4d18a853d2397b985d4a72cdf3c84a4f', timestamp: 1791071999 };
const feed = (i: number) => config.feeds[i].feed;
const obs: FeedObservation[] = [
  { eventIndex: 0, feed: feed(0), roundId: 18446744073710154457n, answer: 3387594n, updatedAt: 1791071976n, decimals: 8 },
  { eventIndex: 1, feed: feed(1), roundId: 18446744073710222551n, answer: 8473512000000n, updatedAt: 1791071947n, decimals: 8 },
  { eventIndex: 2, feed: feed(2), roundId: 18446744073709997900n, answer: 268738175423n, updatedAt: 1791069754n, decimals: 8 },
  { eventIndex: 3, feed: feed(3), roundId: 18446744073710101108n, answer: 11965640000n, updatedAt: 1791071655n, decimals: 8 },
];
const settledPool = { rulesHash: config.rulesHash, closesAt: config.closesAt, eventCount: 4, resolved: true, resolvedState: 8, voidMask: 0 };
const evidence = () => buildEvidence({ config, pool: settledPool, block, prev, obs });

describe('decideGte', () => {
  test('equal is Yes and one atom below is No', () => {
    expect(decideGte(270000000000n, 8, '2700')).toBe(true);
    expect(decideGte(269999999999n, 8, '2700')).toBe(false);
    expect(decideGte(270000000001n, 8, '2700')).toBe(true);
  });
  test('MON compares at four decimals without floating point', () => {
    expect(decideGte(2550000n, 8, '0.0255')).toBe(true);
    expect(decideGte(2549999n, 8, '0.0255')).toBe(false);
    expect(decideGte(3387594n, 8, '0.0343')).toBe(false);
    expect(decideGte(3430000n, 8, '0.0343')).toBe(true);
  });
  test('uses the feed decimals and refuses malformed thresholds', () => {
    expect(decideGte(2700n, 0, '2700')).toBe(true);
    expect(decideGte(2700n * 10n ** 18n, 18, '2700.000000000000000001')).toBe(false);
    for (const bad of ['', '-1', '1e3', '01', '1.', '.5', '0x10']) expect(() => decideGte(1n, 8, bad)).toThrow();
    expect(() => decideGte(1n, -1, '1')).toThrow();
    expect(() => decideGte(1n, 37, '1')).toThrow();
  });
});

describe('yesMaskFrom', () => {
  test('sets the bit of each Yes question', () => {
    expect(yesMaskFrom([{ eventIndex: 0, yes: false }, { eventIndex: 1, yes: false }, { eventIndex: 2, yes: false }, { eventIndex: 3, yes: true }])).toBe(8);
    expect(yesMaskFrom([{ eventIndex: 0, yes: true }, { eventIndex: 2, yes: true }])).toBe(5);
    expect(yesMaskFrom([])).toBe(0);
  });
  test('refuses repeated or out of range questions', () => {
    expect(() => yesMaskFrom([{ eventIndex: 1, yes: true }, { eventIndex: 1, yes: false }])).toThrow();
    expect(() => yesMaskFrom([{ eventIndex: 32, yes: true }])).toThrow();
    expect(() => yesMaskFrom([{ eventIndex: -1, yes: true }])).toThrow();
  });
});

// A synthetic chain at 2.5 blocks per second whose pace drifts smoothly; timestamps never decrease.
const chain = (n: bigint, drift = 3, period = 5000) => Math.floor(1_780_000_000 + Number(n) * 0.4 + drift * Math.sin(Number(n) / period));
const header = (n: bigint): BlockRef => ({ number: n, hash: ('0x' + n.toString(16).padStart(64, '0')) as Hex, timestamp: chain(n) });
const firstAtOrAfter = (target: number, head: bigint) => { let lo = 1n, hi = head; while (lo < hi) { const mid = (lo + hi) / 2n; if (chain(mid) >= target) hi = mid; else lo = mid + 1n; } return lo; };

describe('observation block search', () => {
  test('nextProbe stays strictly inside the bracket and refuses bad brackets', () => {
    const probe = nextProbe(1000, { n: 100n, t: 900 }, { n: 1100n, t: 1100 });
    expect(probe > 100n && probe < 1100n).toBe(true);
    expect(nextProbe(1000, { n: 10n, t: 999 }, { n: 12n, t: 1000 })).toBe(11n);
    expect(() => nextProbe(1000, { n: 10n, t: 1000 }, { n: 20n, t: 1100 })).toThrow();
    expect(() => nextProbe(1000, { n: 10n, t: 900 }, { n: 20n, t: 999 })).toThrow();
    expect(() => nextProbe(1000, { n: 10n, t: 900 }, { n: 11n, t: 1000 })).toThrow();
  });

  test('finds the first block at or after the target within eight header reads', () => {
    const head = 110_400_000n;
    for (const secondsBack of [20, 90, 3600, 6 * 3600, 86400, 4 * 86400, 20 * 86400]) {
      const target = chain(head) - secondsBack;
      let reads = 0;
      const found = findObservationBlock(target, at => { reads++; return header(at === 'finalized' ? head : at); });
      const expected = firstAtOrAfter(target, head);
      expect(found.block.number).toBe(expected);
      expect(found.prev.number).toBe(expected - 1n);
      expect(found.block.timestamp).toBeGreaterThanOrEqual(target);
      expect(found.prev.timestamp).toBeLessThan(target);
      expect(reads).toBeLessThanOrEqual(8);
    }
  });

  test('copes with a pace change and several blocks per second', () => {
    const head = 50_000_000n;
    for (const [drift, period] of [[30, 800], [0, 1000], [60, 20000]]) {
      const at = (n: bigint) => Math.floor(1_780_000_000 + Number(n) * 0.4 + drift * Math.sin(Number(n) / period));
      const target = at(head) - 7200;
      let lo = 1n, hi = head;
      while (lo < hi) { const mid = (lo + hi) / 2n; if (at(mid) >= target) hi = mid; else lo = mid + 1n; }
      const found = findObservationBlock(target, n => { const number = n === 'finalized' ? head : n; return { number, hash: '0x00' as Hex, timestamp: at(number) }; });
      expect(found.block.number).toBe(lo);
    }
  });

  test('stops instead of reading without limit, and refuses an unfinalized time', () => {
    const head = 110_400_000n;
    expect(() => findObservationBlock(chain(head) - 86400, at => header(at === 'finalized' ? head : at), 2)).toThrow('did not converge');
    expect(() => findObservationBlock(chain(head) + 60, at => header(at === 'finalized' ? head : at))).toThrow('not finalized');
    expect(MAX_HEADER_READS + 2).toBeLessThanOrEqual(15);
  });
});

describe('multicall encoding', () => {
  const multicall = parseAbi(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)']);
  const feedAbi = parseAbi([
    'function latestAnswer() view returns (int256)',
    'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
    'function decimals() view returns (uint8)',
  ]);
  const poolAbi = parseAbi([
    'function settlementRulesHash() view returns (bytes32)', 'function closesAt() view returns (uint64)', 'function eventCount() view returns (uint8)',
    'function resolved() view returns (bool)', 'function resolvedState() view returns (uint32)', 'function voidMask() view returns (uint32)',
  ]);
  const feedRows = (answers: bigint[], roundAnswers = answers) => answers.flatMap((answer, i) => [
    encodeFunctionResult({ abi: feedAbi, functionName: 'latestAnswer', result: answer }),
    encodeFunctionResult({ abi: feedAbi, functionName: 'latestRoundData', result: [100n + BigInt(i), roundAnswers[i], 0n, 1791071976n, 100n + BigInt(i)] }),
    encodeFunctionResult({ abi: feedAbi, functionName: 'decimals', result: 8 }),
  ]);
  const reply = (rows: Hex[], success = true) => encodeFunctionResult({ abi: multicall, functionName: 'aggregate3', result: rows.map(returnData => ({ success, returnData })) });

  test('the feed request targets Multicall3 selectors for every feed', () => {
    const data = encodeFeedMulticall(config.feeds);
    expect(data.startsWith('0x82ad56cb')).toBe(true); // aggregate3
    for (const rule of config.feeds) expect(data.toLowerCase()).toContain(rule.feed.slice(2).toLowerCase());
    expect(data).toContain('50d25bcd'); // latestAnswer, the selector the committed rules read
    expect(data).toContain('feaf968c'); // latestRoundData
    expect(MULTICALL3).toBe('0xcA11bde05977b3631167028862bE2a173976CA11');
  });

  test('decodes one observation per feed and rejects a disagreement or a non-positive answer', () => {
    const decoded = decodeFeedMulticall(reply(feedRows([3387594n, 8473512000000n, 268738175423n, 11965640000n])), config.feeds);
    expect(decoded.map(o => o.answer)).toEqual([3387594n, 8473512000000n, 268738175423n, 11965640000n]);
    expect(decoded[2]).toMatchObject({ eventIndex: 2, decimals: 8, roundId: 102n, updatedAt: 1791071976n });
    expect(() => decodeFeedMulticall(reply(feedRows([1n, 2n, 3n, 4n], [1n, 2n, 9n, 4n])), config.feeds)).toThrow('invalid answer');
    expect(() => decodeFeedMulticall(reply(feedRows([1n, 2n, 0n, 4n])), config.feeds)).toThrow('invalid answer');
    expect(() => decodeFeedMulticall(reply(feedRows([1n, 2n, 3n, 4n]).slice(0, 9)), config.feeds)).toThrow();
    expect(() => decodeFeedMulticall(reply(feedRows([1n, 2n, 3n, 4n]), false), config.feeds)).toThrow('failed');
  });

  test('decodes the pool state', () => {
    const rows = [
      encodeFunctionResult({ abi: poolAbi, functionName: 'settlementRulesHash', result: config.rulesHash }),
      encodeFunctionResult({ abi: poolAbi, functionName: 'closesAt', result: BigInt(config.closesAt) }),
      encodeFunctionResult({ abi: poolAbi, functionName: 'eventCount', result: 4 }),
      encodeFunctionResult({ abi: poolAbi, functionName: 'resolved', result: true }),
      encodeFunctionResult({ abi: poolAbi, functionName: 'resolvedState', result: 8 }),
      encodeFunctionResult({ abi: poolAbi, functionName: 'voidMask', result: 0 }),
    ];
    expect(decodePoolMulticall(reply(rows))).toEqual(settledPool);
    expect(encodePoolMulticall(config.pool).startsWith('0x82ad56cb')).toBe(true);
    expect(() => decodePoolMulticall(reply(rows.slice(0, 5)))).toThrow();
  });
});

describe('evidence', () => {
  test('reproduces what the CRE simulator printed for the settled Crypto weekend pool', () => {
    const result = evidence();
    expect(result.yesMask).toBe(8);
    expect(result.observations.map(o => o.yes)).toEqual([false, false, false, true]);
    expect(result.observations[2].answer).toBe('268738175423');
    expect(result.onchain).toEqual({ resolvedState: 8, voidMask: 0, matches: true });
    expect(result.observationsHash).toBe('0xf36d25279c0dc4a94fccf59105edab30ba22561b23857714228b5d3b84f08fff');
    expect(result.unsignedReport).toBe('0x0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000279f000000000000000000000000f8beba5827bfaaf6ace08a40cd9db740233ca9fee5a599dd8746121f4083239e034475878dbd7944ee735a67b946040b85a5078e000000000000000000000000000000000000000000000000000000006ac19700f36d25279c0dc4a94fccf59105edab30ba22561b23857714228b5d3b84f08fff0000000000000000000000000000000000000000000000000000000000000008');
    expect(result.notice).toContain('Settlement authority remains the bonded PilotResolver');
    expect(JSON.stringify(result).length).toBeLessThan(100_000);
  });

  test('reports a pool that is not resolved yet, and a disagreeing one', () => {
    expect(buildEvidence({ config, pool: { ...settledPool, resolved: false, resolvedState: 0 }, block, prev, obs }).onchain).toBeNull();
    expect(buildEvidence({ config, pool: { ...settledPool, resolvedState: 9 }, block, prev, obs }).onchain?.matches).toBe(false);
    expect(buildEvidence({ config, pool: { ...settledPool, voidMask: 2 }, block, prev, obs }).onchain?.matches).toBe(false);
  });

  test('refuses a rules hash mismatch, a close time mismatch, a stale block or the wrong boundary', () => {
    const build = (patch: object = {}, b: BlockRef = block, p: BlockRef = prev, o: FeedObservation[] = obs) =>
      () => buildEvidence({ config, pool: { ...settledPool, ...patch }, block: b, prev: p, obs: o });
    expect(build({ rulesHash: '0x' + '11'.repeat(32) })).toThrow('rules hash');
    expect(build({ closesAt: config.closesAt + 1 })).toThrow('close time');
    expect(build({ eventCount: 3 })).toThrow('question count');
    expect(build({}, { ...block, timestamp: 1791071999 }, { ...prev, timestamp: 1791071998 })).toThrow('before the committed observation time');
    expect(build({}, { ...block, number: 110317695n, timestamp: 1791072000 }, { ...prev, number: 110317694n, timestamp: 1791072000 })).toThrow('first at or after');
    expect(build({}, { ...block, number: 110317696n })).toThrow('first at or after');
    expect(build({}, block, prev, obs.slice(0, 3))).toThrow('exactly one');
    expect(build({}, block, prev, obs.map((o, i) => (i === 1 ? { ...o, eventIndex: 3 } : o)))).toThrow();
    expect(build({}, block, prev, obs.map((o, i) => (i === 2 ? { ...o, feed: feed(0) } : o)))).toThrow('Missing observation');
  });

  test('a different answer flips only its own bit and changes the observations hash', () => {
    const changed = obs.map(o => (o.eventIndex === 2 ? { ...o, answer: 270000000000n } : o));
    const result = buildEvidence({ config, pool: settledPool, block, prev, obs: changed });
    expect(result.yesMask).toBe(12);
    expect(result.onchain?.matches).toBe(false);
    expect(result.observationsHash).not.toBe(evidence().observationsHash);
    expect(observationsHash([...obs].reverse(), block)).toBe(observationsHash(obs, block));
  });

  test('the report decodes back to its seven receiver fields', () => {
    const hash = observationsHash(obs, block);
    const report = encodeReport(config, block.timestamp, hash, 8);
    expect(report.length).toBe(2 + 7 * 64);
    expect(decodeAbiParameters(parseAbiParameters('uint8 version, uint256 chainId, address pool, bytes32 rulesHash, uint64 observedAt, bytes32 observationsHash, uint32 terminalState'), report))
      .toEqual([2, 10143n, config.pool, config.rulesHash, BigInt(block.timestamp), hash, 8]);
  });
});

describe('configuration', () => {
  test('is built from the verified Crypto weekend manifest', () => {
    expect(config.schema).toBe(PRICE_FEED_SCHEMA);
    expect(config.pool.toLowerCase()).toBe(weekend.pool);
    expect(config.rulesHash).toBe(weekend.rulesHash);
    expect(config.closesAt).toBe(1791050400);
    expect(config.observationAt).toBe(1791072000);
    expect(config.feeds.map(f => f.threshold)).toEqual(['0.0343', '84750', '2700', '118']);
    expect(config.feeds.map(f => f.label)).toEqual(['MON/USD', 'BTC/USD', 'ETH/USD', 'SOL/USD']);
    expect(priceFeedConfigSchema.safeParse(config).success).toBe(true);
  });

  test('refuses manifests whose rules are not Chainlink latestAnswer reads', () => {
    const clone = () => JSON.parse(JSON.stringify(weekend));
    const bad = (edit: (m: any) => void) => () => { const m = clone(); edit(m); return priceFeedConfigFromManifest(m); };
    expect(bad(m => { m.publication.settlementRules[1].source.adapter = 'json-api.v1'; })).toThrow('latestAnswer');
    expect(bad(m => { m.publication.settlementRules[1].source.reader.chainId = 10143; })).toThrow('latestAnswer');
    expect(bad(m => { m.publication.settlementRules[1].source.reader.call.data = '0x313ce567'; })).toThrow('latestAnswer');
    expect(bad(m => { m.publication.settlementRules[0].decision.operator = 'lte'; })).toThrow('greater-or-equal');
    expect(bad(m => { m.publication.settlementRules[3].source.reader.at += 60; })).toThrow('share one observation time');
    expect(bad(m => { m.status = 'unverified_pilot_deployment'; })).toThrow('verified');
  });

  test('schema is strict', () => {
    const parse = (patch: Partial<PriceFeedConfig> & Record<string, unknown>) => priceFeedConfigSchema.safeParse({ ...config, ...patch }).success;
    expect(parse({})).toBe(true);
    expect(parse({ extra: 1 })).toBe(false);
    expect(parse({ observationAt: config.closesAt })).toBe(false);
    expect(parse({ chainId: 1 })).toBe(false);
    expect(parse({ sourceChainId: 1 })).toBe(false);
    expect(parse({ eventCount: 1 })).toBe(false);
    expect(parse({ feeds: [config.feeds[0], { ...config.feeds[1], eventIndex: 0 }] })).toBe(false);
    expect(parse({ feeds: [config.feeds[0], { ...config.feeds[1], eventIndex: 7 }] })).toBe(false);
    expect(parse({ feeds: [config.feeds[0], { ...config.feeds[1], feed: config.feeds[0].feed }] })).toBe(false);
    expect(parse({ feeds: [config.feeds[0]] })).toBe(false);
    expect(parse({ feeds: [config.feeds[0], { ...config.feeds[1], threshold: '1e3' }] })).toBe(false);
    expect(parse({ pool: ('0x' + '0'.repeat(40)) as Address })).toBe(false);
  });
});

describe('WASM safety', () => {
  test('workflow files import only the CRE SDK, viem, zod and each other', () => {
    for (const file of ['price-feed.ts', 'price-feed-main.ts']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
      expect(specifiers.length).toBeGreaterThan(0);
      for (const specifier of specifiers) expect(['@chainlink/cre-sdk', 'viem', 'zod', './price-feed', './settlement']).toContain(specifier);
      expect(source).not.toMatch(/node:|process\.env|fetch\(|setTimeout/);
    }
  });
});
