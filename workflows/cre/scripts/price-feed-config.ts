import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getAddress } from 'viem';
import { PRICE_FEED_SCHEMA, SOURCE_CHAIN_ID, TESTNET_CHAIN_ID, priceFeedConfigSchema, type FeedRule, type PriceFeedConfig } from '../src/price-feed';

// Builds the Chainlink price-feed workflow configuration from a verified pool manifest (target/deployments/<id>-testnet.json
// or a collection entry in config/collections.json). Nothing is typed by hand: feeds, thresholds, rules hash and the
// observation time all come from the rules the pool committed at deployment.
//   bun workflows/cre/scripts/price-feed-config.ts --manifest target/deployments/<id>-testnet.json --out target/deployments/<id>-cre-price.json
const LATEST_ANSWER = '0x50d25bcd';

function labelFor(rule: any): string {
  const match = /^chainlink-([a-z0-9]{2,10})-usd-monad$/.exec(rule?.source?.id ?? '');
  return match ? `${match[1].toUpperCase()}/USD` : String(rule.eventId).slice(0, 48);
}

export function priceFeedConfigFromManifest(manifest: any): PriceFeedConfig {
  if (manifest?.status !== 'verified_pilot_snapshot' || manifest.chainId !== TESTNET_CHAIN_ID) throw Error('A verified Monad testnet pool manifest is required.');
  const rules: any[] = manifest.publication?.settlementRules;
  if (!Array.isArray(rules) || rules.length < 2 || rules.length > 4) throw Error('The manifest has no committed settlement rules.');
  if (manifest.publication.draft?.events?.length !== rules.length) throw Error('The manifest events do not match its settlement rules.');
  const times = new Set<number>();
  const feeds: FeedRule[] = rules.map((rule, eventIndex) => {
    const reader = rule?.source?.reader;
    if (rule?.source?.adapter !== 'evm-rpc.v1' || reader?.chainId !== SOURCE_CHAIN_ID || reader.metric !== 'call'
      || reader.call?.data !== LATEST_ANSWER || reader.call?.returns !== 'int256')
      throw Error(`Question ${eventIndex} is not a Chainlink latestAnswer read on chain ${SOURCE_CHAIN_ID}.`);
    if (rule.decision?.type !== 'number' || rule.decision.operator !== 'gte') throw Error(`Question ${eventIndex} is not a greater-or-equal number rule.`);
    if (reader.until !== undefined) throw Error(`Question ${eventIndex} observes a range, not one block.`);
    times.add(reader.at);
    return { eventIndex, label: labelFor(rule), feed: getAddress(reader.call.to), operator: 'gte', threshold: String(rule.decision.value) };
  });
  if (times.size !== 1) throw Error('The questions do not share one observation time.');
  return priceFeedConfigSchema.parse({
    schema: PRICE_FEED_SCHEMA, chainId: TESTNET_CHAIN_ID, pool: getAddress(manifest.pool), rulesHash: manifest.rulesHash,
    closesAt: manifest.publication.draft.closesAt, observationAt: [...times][0], sourceChainId: SOURCE_CHAIN_ID, eventCount: rules.length, feeds,
  });
}

if (import.meta.main) {
  const flag = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
  const manifestPath = flag('manifest'), out = flag('out');
  if (!manifestPath || !out) throw Error('Use --manifest <pool manifest.json> --out <config.json>');
  const config = priceFeedConfigFromManifest(JSON.parse(await readFile(resolve(manifestPath), 'utf8')));
  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(resolve(out), JSON.stringify(config, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'written', out, pool: config.pool, observationAt: config.observationAt, feeds: config.feeds.map(f => `${f.label} >= ${f.threshold}`) }, null, 2));
}
