import {
  decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, parseAbiParameters,
  type Address, type Hex,
} from 'viem';
import { z } from 'zod';
import { factoredReportAbi } from './settlement';

// Chainlink price-feed observation for a Flurbo pool. Pure functions only: this module and price-feed-main.ts compile
// to WASM for the CRE runtime, so they import nothing but @chainlink/cre-sdk, viem and zod (never apps/web).
// CRE here is evidence orchestration. Settlement authority stays with the pool's bonded PilotResolver.
export const PRICE_FEED_SCHEMA = 'flurbo.cre-price-feed.v1';
export const PRICE_EVIDENCE_SCHEMA = 'flurbo.cre-price-evidence.v1';
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const REPORT_VERSION = 2;
export const TESTNET_CHAIN_ID = 10143;
export const SOURCE_CHAIN_ID = 143;
// ChainRead calls per execution are limited to 15: at most this many headers, one feed multicall, one pool multicall.
export const MAX_HEADER_READS = 12;
export const NOTICE = 'CRE observation. Settlement authority remains the bonded PilotResolver.';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v => !/^0x0{40}$/.test(v), 'address must be nonzero');
const hash32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const timestamp = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const feedRuleSchema = z.object({
  eventIndex: z.number().int().min(0).max(31),
  label: z.string().regex(/^[A-Za-z0-9 ./()_-]{1,48}$/),
  feed: address,
  operator: z.literal('gte'),
  threshold: z.string().regex(/^(0|[1-9]\d{0,17})(\.\d{1,18})?$/),
}).strict();

export type FeedRule = { eventIndex: number; label: string; feed: Address; operator: 'gte'; threshold: string };
export type PriceFeedConfig = {
  schema: typeof PRICE_FEED_SCHEMA; chainId: 10143; pool: Address; rulesHash: Hex;
  closesAt: number; observationAt: number; sourceChainId: 143; eventCount: number; feeds: FeedRule[];
  // Optional: a FlurboCreAttestation contract that records the report on Monad testnet. It has no settlement power.
  attestation?: { contract: Address };
};
export const priceFeedConfigSchema = z.object({
  schema: z.literal(PRICE_FEED_SCHEMA),
  chainId: z.literal(TESTNET_CHAIN_ID),
  pool: address,
  rulesHash: hash32,
  closesAt: timestamp,
  observationAt: timestamp,
  sourceChainId: z.literal(SOURCE_CHAIN_ID),
  eventCount: z.number().int().min(2).max(4),
  feeds: z.array(feedRuleSchema).min(2).max(4),
  attestation: z.object({ contract: address }).strict().optional(),
}).strict().superRefine((config, ctx) => {
  const indexes = config.feeds.map(feed => feed.eventIndex);
  if (new Set(indexes).size !== indexes.length) ctx.addIssue({ code: 'custom', message: 'event indexes must be unique' });
  if (indexes.some(index => index >= config.eventCount)) ctx.addIssue({ code: 'custom', message: 'event index is outside the pool' });
  if (new Set(config.feeds.map(feed => feed.feed.toLowerCase())).size !== config.feeds.length)
    ctx.addIssue({ code: 'custom', message: 'each question needs its own feed' });
  if (config.observationAt <= config.closesAt) ctx.addIssue({ code: 'custom', message: 'observation must be after trading closes' });
}) as unknown as z.ZodType<PriceFeedConfig>;

export type FeedObservation = { eventIndex: number; feed: Address; roundId: bigint; answer: bigint; updatedAt: bigint; decimals: number };
export type PoolState = {
  rulesHash: Hex; closesAt: number; eventCount: number; resolved: boolean; resolvedState: number; voidMask: number;
  // Present only when an attestation contract was read: observedAt is 0 until the pool has been attested.
  attested?: { yesMask: number; observedAt: number };
};
export type BlockRef = { number: bigint; hash: Hex; timestamp: number };

const multicallAbi = parseAbi([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
]);
const feedAbi = parseAbi([
  'function latestAnswer() view returns (int256)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
]);
const poolAbi = parseAbi([
  'function settlementRulesHash() view returns (bytes32)',
  'function closesAt() view returns (uint64)',
  'function eventCount() view returns (uint8)',
  'function resolved() view returns (bool)',
  'function resolvedState() view returns (uint32)',
  'function voidMask() view returns (uint32)',
]);
const attestationAbi = parseAbi([
  'function attestations(address pool) view returns (uint32 yesMask, uint64 observedAt, bytes32 observationsHash, bytes32 reportHash)',
]);
const observationsAbi = parseAbiParameters(
  'uint256 blockNumber, bytes32 blockHash, uint64 blockTimestamp, (uint8 eventIndex, address feed, uint80 roundId, int256 answer, uint256 updatedAt, uint8 decimals)[] observations',
);

const MAX_DECIMALS = 36;

/** Exact decimal comparison: answer / 10^decimals >= threshold. No floating point. */
export function decideGte(answer: bigint, decimals: number, threshold: string): boolean {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(threshold);
  if (!match || !Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) throw Error('Invalid threshold or feed decimals.');
  const fraction = match[2] ?? '';
  // answer / 10^decimals >= t / 10^k  <=>  answer * 10^k >= t * 10^decimals
  return answer * 10n ** BigInt(fraction.length) >= BigInt(match[1] + fraction) * 10n ** BigInt(decimals);
}

/** Bit i is set when event i resolved Yes. */
export function yesMaskFrom(results: { eventIndex: number; yes: boolean }[]): number {
  let mask = 0;
  const seen = new Set<number>();
  for (const { eventIndex, yes } of results) {
    if (!Number.isInteger(eventIndex) || eventIndex < 0 || eventIndex > 31 || seen.has(eventIndex)) throw Error('Invalid or repeated event index.');
    seen.add(eventIndex);
    if (yes) mask += 2 ** eventIndex;
  }
  return mask;
}

const call = (target: Address, data: Hex) => ({ target, allowFailure: false, callData: data });
const aggregate = (calls: ReturnType<typeof call>[]) => encodeFunctionData({ abi: multicallAbi, functionName: 'aggregate3', args: [calls] });
function unpack(data: Hex, expected: number): Hex[] {
  const rows = decodeFunctionResult({ abi: multicallAbi, functionName: 'aggregate3', data });
  if (rows.length !== expected || rows.some(row => !row.success)) throw Error('A multicall read failed.');
  return rows.map(row => row.returnData);
}

/** Multicall3 aggregate3 for every feed: latestAnswer() (the rule's own call), latestRoundData() and decimals(). */
export function encodeFeedMulticall(feeds: FeedRule[]): Hex {
  return aggregate(feeds.flatMap(rule => [
    call(rule.feed, encodeFunctionData({ abi: feedAbi, functionName: 'latestAnswer' })),
    call(rule.feed, encodeFunctionData({ abi: feedAbi, functionName: 'latestRoundData' })),
    call(rule.feed, encodeFunctionData({ abi: feedAbi, functionName: 'decimals' })),
  ]));
}

export function decodeFeedMulticall(data: Hex, feeds: FeedRule[]): FeedObservation[] {
  const rows = unpack(data, feeds.length * 3);
  return feeds.map((rule, i) => {
    const latest = decodeFunctionResult({ abi: feedAbi, functionName: 'latestAnswer', data: rows[i * 3] });
    const [roundId, answer, , updatedAt] = decodeFunctionResult({ abi: feedAbi, functionName: 'latestRoundData', data: rows[i * 3 + 1] });
    const decimals = decodeFunctionResult({ abi: feedAbi, functionName: 'decimals', data: rows[i * 3 + 2] });
    // The rule reads latestAnswer(); the round data adds provenance and must agree with it at the same block.
    if (latest !== answer || answer <= 0n) throw Error(`Feed for question ${rule.eventIndex} returned an invalid answer.`);
    return { eventIndex: rule.eventIndex, feed: rule.feed, roundId, answer, updatedAt, decimals };
  });
}

/** The pool's own reads, plus attestations(pool) on the attestation contract when one is configured (one ChainRead either way). */
export function encodePoolMulticall(pool: Address, attestation?: Address): Hex {
  const calls = (['settlementRulesHash', 'closesAt', 'eventCount', 'resolved', 'resolvedState', 'voidMask'] as const)
    .map(functionName => call(pool, encodeFunctionData({ abi: poolAbi, functionName })));
  if (attestation) calls.push(call(attestation, encodeFunctionData({ abi: attestationAbi, functionName: 'attestations', args: [pool] })));
  return aggregate(calls);
}

export function decodePoolMulticall(data: Hex, withAttestation = false): PoolState {
  const rows = unpack(data, withAttestation ? 7 : 6);
  const attested = withAttestation ? (() => {
    const [yesMask, observedAt] = decodeFunctionResult({ abi: attestationAbi, functionName: 'attestations', data: rows[6] });
    return { yesMask: Number(yesMask), observedAt: Number(observedAt) };
  })() : undefined;
  return {
    ...(attested ? { attested } : {}),
    rulesHash: decodeFunctionResult({ abi: poolAbi, functionName: 'settlementRulesHash', data: rows[0] }),
    closesAt: Number(decodeFunctionResult({ abi: poolAbi, functionName: 'closesAt', data: rows[1] })),
    eventCount: Number(decodeFunctionResult({ abi: poolAbi, functionName: 'eventCount', data: rows[2] })),
    resolved: decodeFunctionResult({ abi: poolAbi, functionName: 'resolved', data: rows[3] }),
    resolvedState: Number(decodeFunctionResult({ abi: poolAbi, functionName: 'resolvedState', data: rows[4] })),
    voidMask: Number(decodeFunctionResult({ abi: poolAbi, functionName: 'voidMask', data: rows[5] })),
  };
}

/**
 * Next block number to read while searching for the first block whose timestamp is at or after target.
 * lo is a block before target and hi a block at or after it. Wide gaps use linear interpolation of block time;
 * narrow gaps bisect, so the bracket always shrinks.
 */
export function nextProbe(target: number, lo: { n: bigint; t: number }, hi: { n: bigint; t: number }): bigint {
  if (!(lo.t < target) || !(hi.t >= target) || hi.n - lo.n < 2n) throw Error('The block bracket cannot be searched.');
  const gap = hi.n - lo.n;
  let probe = gap <= 8n ? lo.n + gap / 2n : lo.n + (BigInt(target - lo.t) * gap) / BigInt(hi.t - lo.t);
  if (probe <= lo.n) probe = lo.n + 1n;
  if (probe >= hi.n) probe = hi.n - 1n;
  return probe;
}

/**
 * Finds the first block at or after target and the block before it. readHeader('finalized') must return the last
 * finalized header. Gives up after maxReads header reads so one execution stays inside the ChainRead limit.
 */
export function findObservationBlock(
  target: number, readHeader: (at: bigint | 'finalized') => BlockRef, maxReads = MAX_HEADER_READS,
): { block: BlockRef; prev: BlockRef } {
  let reads = 0;
  const read = (at: bigint | 'finalized') => {
    if (++reads > maxReads) throw Error('The observation block search did not converge.');
    return readHeader(at);
  };
  let hi = read('finalized');
  if (hi.timestamp < target) throw Error('The observation time is not finalized yet.');
  // First step back assumes at most three blocks per second, doubling until a block before target is found.
  let step = BigInt(Math.max(8, (hi.timestamp - target + 1) * 3));
  let lo: BlockRef | null = null;
  while (!lo) {
    if (hi.number <= 1n) throw Error('The observation time is before the first block.');
    const guess = hi.number > step ? hi.number - step : 1n;
    const header = read(guess);
    if (header.timestamp < target) lo = header;
    else { hi = header; step *= 2n; }
  }
  while (hi.number - lo.number > 1n) {
    const header = read(nextProbe(target, { n: lo.number, t: lo.timestamp }, { n: hi.number, t: hi.timestamp }));
    if (header.timestamp < target) lo = header;
    else hi = header;
  }
  return { block: hi, prev: lo };
}

/** keccak256(abi.encode(blockNumber, blockHash, blockTimestamp, observations[])) with observations sorted by event index. */
export function observationsHash(obs: FeedObservation[], block: BlockRef): Hex {
  const sorted = [...obs].sort((a, b) => a.eventIndex - b.eventIndex);
  return keccak256(encodeAbiParameters(observationsAbi, [block.number, block.hash, BigInt(block.timestamp),
    sorted.map(o => ({ eventIndex: o.eventIndex, feed: o.feed, roundId: o.roundId, answer: o.answer, updatedAt: o.updatedAt, decimals: o.decimals }))]));
}

/** Seven ABI words, version 2, in the layout of FactoredCreSettlementReceiver.SettlementReport (terminalState = yes mask). */
export function encodeReport(config: PriceFeedConfig, observedAt: number, obsHash: Hex, yesMask: number): Hex {
  return encodeAbiParameters(factoredReportAbi, [REPORT_VERSION, BigInt(config.chainId), config.pool, config.rulesHash,
    BigInt(observedAt), obsHash, yesMask]);
}

/** True when an attestation contract is configured and has not yet recorded this pool. */
export function shouldAttest(config: PriceFeedConfig, pool: PoolState): boolean {
  return config.attestation !== undefined && pool.attested !== undefined && pool.attested.observedAt === 0;
}

export type PriceFeedEvidence = {
  schema: typeof PRICE_EVIDENCE_SCHEMA; pool: Address; rulesHash: Hex;
  block: { number: string; hash: Hex; timestamp: number }; previousBlock: { number: string; hash: Hex; timestamp: number };
  observations: { eventIndex: number; label: string; feed: Address; roundId: string; answer: string; decimals: number; updatedAt: string; threshold: string; yes: boolean }[];
  yesMask: number; observationsHash: Hex; unsignedReport: Hex;
  onchain: { resolvedState: number; voidMask: number; matches: boolean } | null; notice: string;
};

const ref = (b: BlockRef) => ({ number: b.number.toString(), hash: b.hash, timestamp: b.timestamp });

export function buildEvidence(input: { config: PriceFeedConfig; pool: PoolState; block: BlockRef; prev: BlockRef; obs: FeedObservation[] }): PriceFeedEvidence {
  const { config, pool, block, prev, obs } = input;
  if (pool.rulesHash.toLowerCase() !== config.rulesHash.toLowerCase()) throw Error('The pool rules hash does not match the workflow configuration.');
  if (pool.closesAt !== config.closesAt) throw Error('The pool close time does not match the workflow configuration.');
  if (pool.eventCount !== config.eventCount) throw Error('The pool question count does not match the workflow configuration.');
  if (block.timestamp < config.observationAt) throw Error('The observation block is before the committed observation time.');
  if (prev.timestamp >= config.observationAt || prev.number + 1n !== block.number) throw Error('The block is not the first at or after the observation time.');
  if (obs.length !== config.feeds.length) throw Error('Every question needs exactly one feed observation.');
  const rows = config.feeds.map(rule => {
    const seen = obs.find(o => o.eventIndex === rule.eventIndex);
    if (!seen || seen.feed.toLowerCase() !== rule.feed.toLowerCase()) throw Error(`Missing observation for question ${rule.eventIndex}.`);
    return { rule, seen, yes: decideGte(seen.answer, seen.decimals, rule.threshold) };
  });
  const yesMask = yesMaskFrom(rows.map(({ rule, yes }) => ({ eventIndex: rule.eventIndex, yes })));
  const hash = observationsHash(obs, block);
  return {
    schema: PRICE_EVIDENCE_SCHEMA, pool: config.pool, rulesHash: config.rulesHash,
    block: ref(block), previousBlock: ref(prev),
    observations: rows.map(({ rule, seen, yes }) => ({ eventIndex: rule.eventIndex, label: rule.label, feed: rule.feed,
      roundId: seen.roundId.toString(), answer: seen.answer.toString(), decimals: seen.decimals, updatedAt: seen.updatedAt.toString(),
      threshold: rule.threshold, yes })),
    yesMask, observationsHash: hash, unsignedReport: encodeReport(config, block.timestamp, hash, yesMask),
    onchain: pool.resolved ? { resolvedState: pool.resolvedState, voidMask: pool.voidMask,
      matches: pool.resolvedState === yesMask && pool.voidMask === 0 } : null,
    notice: NOTICE,
  };
}
