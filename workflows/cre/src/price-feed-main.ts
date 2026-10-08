import {
  blockNumber, bytesToHex, cre, decodeJson, encodeCallMsg, LAST_FINALIZED_BLOCK_NUMBER, protoBigIntToBigint, Runner,
  type HTTPPayload, type Runtime,
} from '@chainlink/cre-sdk';
import { zeroAddress, type Hex } from 'viem';
import { z } from 'zod';
import {
  MULTICALL3, buildEvidence, decodeFeedMulticall, decodePoolMulticall, encodeFeedMulticall, encodePoolMulticall,
  findObservationBlock, priceFeedConfigSchema, type BlockRef, type PriceFeedConfig,
} from './price-feed';

// Reads the committed Chainlink feeds on Monad mainnet at the first block at or after the pool's observation time,
// applies the pool's committed thresholds, and returns evidence next to the pool's own on-chain result.
// Allowed imports: @chainlink/cre-sdk, viem, zod and ./price-feed. Never import from apps/web: it breaks WASM compilation.
const MAINNET = cre.capabilities.EVMClient.SUPPORTED_CHAIN_SELECTORS['monad-mainnet'];
const TESTNET = cre.capabilities.EVMClient.SUPPORTED_CHAIN_SELECTORS['monad-testnet'];
// Matches finalitySeconds in the pool's committed rules.
const FINALITY_SECONDS = 60;
type Evm = InstanceType<typeof cre.capabilities.EVMClient>;
const httpInput = z.object({ observationBlock: z.string().regex(/^[1-9]\d{0,15}$/) }).strict();

function readHeader(runtime: Runtime<PriceFeedConfig>, evm: Evm, at: bigint | 'finalized'): BlockRef {
  const { header } = evm.headerByNumber(runtime, { blockNumber: at === 'finalized' ? LAST_FINALIZED_BLOCK_NUMBER : blockNumber(at) }).result();
  if (!header?.blockNumber) throw Error('The block header is unavailable.');
  return { number: protoBigIntToBigint(header.blockNumber), hash: bytesToHex(header.hash), timestamp: Number(header.timestamp) };
}

function multicall(runtime: Runtime<PriceFeedConfig>, evm: Evm, data: Hex, at: bigint | 'finalized'): Hex {
  const reply = evm.callContract(runtime, { call: encodeCallMsg({ from: zeroAddress, to: MULTICALL3, data }),
    blockNumber: at === 'finalized' ? LAST_FINALIZED_BLOCK_NUMBER : blockNumber(at) }).result();
  return bytesToHex(reply.data);
}

function observe(runtime: Runtime<PriceFeedConfig>, mainnet: Evm, testnet: Evm, block: BlockRef, prev: BlockRef): string {
  const { config } = runtime;
  const obs = decodeFeedMulticall(multicall(runtime, mainnet, encodeFeedMulticall(config.feeds), block.number), config.feeds);
  const pool = decodePoolMulticall(multicall(runtime, testnet, encodePoolMulticall(config.pool), 'finalized'));
  const evidence = buildEvidence({ config, pool, block, prev, obs });
  runtime.log(`Chainlink feed observation at Monad block ${block.number}: yes mask ${evidence.yesMask}; `
    + `${evidence.onchain ? (evidence.onchain.matches ? 'matches' : 'differs from') + ' the pool result' : 'pool not resolved yet'}. No transaction submitted.`);
  return JSON.stringify(evidence);
}

// Input {"observationBlock":"<decimal>"}: checks that this is the first block at or after the observation time.
function onHttp(runtime: Runtime<PriceFeedConfig>, payload: HTTPPayload): string {
  const input = httpInput.parse(decodeJson(payload.input));
  const mainnet = new cre.capabilities.EVMClient(MAINNET), testnet = new cre.capabilities.EVMClient(TESTNET);
  const number = BigInt(input.observationBlock);
  const block = readHeader(runtime, mainnet, number), prev = readHeader(runtime, mainnet, number - 1n);
  if (readHeader(runtime, mainnet, 'finalized').number < number) throw Error('The observation block is not finalized yet.');
  return observe(runtime, mainnet, testnet, block, prev);
}

// Finds the observation block itself once the observation time plus the rule's finality margin has passed.
function onCron(runtime: Runtime<PriceFeedConfig>): string {
  const now = Math.floor(runtime.now().getTime() / 1000);
  if (now < runtime.config.observationAt + FINALITY_SECONDS) return JSON.stringify({ status: 'waiting' });
  const mainnet = new cre.capabilities.EVMClient(MAINNET), testnet = new cre.capabilities.EVMClient(TESTNET);
  const { block, prev } = findObservationBlock(runtime.config.observationAt, at => readHeader(runtime, mainnet, at));
  return observe(runtime, mainnet, testnet, block, prev);
}

export async function main(): Promise<void> {
  const runner = await Runner.newRunner<PriceFeedConfig>({ configSchema: priceFeedConfigSchema });
  await runner.run(() => [
    cre.handler(new cre.capabilities.HTTPCapability().trigger({}), onHttp),
    cre.handler(new cre.capabilities.CronCapability().trigger({ schedule: '0 */10 * * * *' }), onCron),
  ]);
}

main();
