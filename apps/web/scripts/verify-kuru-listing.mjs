import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createPublicClient, http, parseAbi } from 'viem';

const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const same = (a, b) => address(a) && address(b) && a.toLowerCase() === b.toLowerCase();
const poolAbi = parseAbi([
  'function funded() view returns (bool)',
  'function resolved() view returns (bool)',
  'function closesAt() view returns (uint64)',
  'function resolver() view returns (address)',
  'function collateral() view returns (address)',
  'function settlementRulesHash() view returns (bytes32)',
  'function baseTokens(uint32 scope,uint8 mask) view returns (address)',
]);
const receiptAbi = parseAbi([
  'function pool() view returns (address)',
  'function scope() view returns (uint32)',
  'function mask() view returns (uint8)',
  'function decimals() view returns (uint8)',
]);
const marginAbi = parseAbi(['function verifiedMarket(address market) view returns (bool)']);
const resolverAbi = parseAbi(['function creator() view returns (address)']);

function marketParams(data) {
  if (!/^0x(?:[0-9a-f]{64}){11}$/i.test(data || '')) throw Error('Kuru market parameters are malformed.');
  return Array.from({ length: 11 }, (_, i) => BigInt('0x' + data.slice(2 + i * 64, 66 + i * 64)));
}

export async function verifyKuruListing({ manifest, deployment, client, now = Date.now() }) {
  const eventIndex = deployment?.eventIndex;
  const receipts = manifest?.verification?.receipts || manifest?.receipts;
  if (manifest?.status !== 'verified_pilot_snapshot' || manifest?.chainId !== 10143 ||
      deployment?.status !== 'unverified_pilot_kuru' || !Number.isInteger(eventIndex) ||
      eventIndex < 0 || eventIndex >= manifest.publication?.draft?.events?.length ||
      !Array.isArray(receipts) || !same(deployment.pool, manifest.pool) ||
      !same(deployment.receipt, receipts[eventIndex]) ||
      ![deployment.market, deployment.margin, deployment.cash, deployment.operator].every(address)) {
    throw Error('Kuru deployment does not match a verified collection and canonical receipt.');
  }
  if (await client.getChainId() !== 10143) throw Error('Kuru RPC is not Monad testnet.');
  const blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber });
  const at = { blockNumber };
  const pool = deployment.pool, receipt = deployment.receipt, market = deployment.market;
  const call = (abi, contract, functionName, args = []) =>
    client.readContract({ abi, address: contract, functionName, args, ...at });
  const [code, funded, resolved, closesAt, resolver, cash, rulesHash, canonical,
    receiptPool, scope, mask, decimals, verified, creator] = await Promise.all([
    client.getCode({ address: market, ...at }),
    call(poolAbi, pool, 'funded'), call(poolAbi, pool, 'resolved'),
    call(poolAbi, pool, 'closesAt'), call(poolAbi, pool, 'resolver'),
    call(poolAbi, pool, 'collateral'), call(poolAbi, pool, 'settlementRulesHash'),
    call(poolAbi, pool, 'baseTokens', [2 ** eventIndex, 2]),
    call(receiptAbi, receipt, 'pool'), call(receiptAbi, receipt, 'scope'),
    call(receiptAbi, receipt, 'mask'), call(receiptAbi, receipt, 'decimals'),
    call(marginAbi, deployment.margin, 'verifiedMarket', [market]),
    call(resolverAbi, manifest.resolver, 'creator'),
  ]);
  if (!code || code === '0x') throw Error('Kuru market has no deployed code. A dry-run address cannot be published.');
  if (!funded || resolved || Number(closesAt) <= Math.floor(now / 1000) ||
      Number(closesAt) !== manifest.publication?.draft?.closesAt ||
      !same(resolver, manifest.resolver) || !same(cash, deployment.cash) ||
      !same(creator, deployment.operator) ||
      rulesHash.toLowerCase() !== manifest.rulesHash.toLowerCase() ||
      !same(canonical, receipt) || !same(receiptPool, pool) ||
      Number(scope) !== 2 ** eventIndex || Number(mask) !== 2 || Number(decimals) !== 6 || !verified) {
    throw Error('Kuru market or pool does not match the published collection.');
  }
  const result = await client.call({ to: market, data: '0x90c9427c', ...at });
  const p = marketParams(result.data);
  const expected = [1000000n, 1000000n, BigInt(receipt), 6n, BigInt(cash), 6n,
    100n, 10000n, 100000000n, 30n, 10n];
  if (p.some((value, i) => value !== expected[i])) throw Error('Kuru pair parameters do not match the reviewed deployment.');
  if ((await client.getBlock({ blockNumber })).hash !== block.hash) throw Error('Verification block changed.');
  return {
    schema: 'flurbo.kuru-listing.v1', status: 'verified_kuru_snapshot', chainId: 10143,
    pool, eventIndex, receipt, market, cash, margin: deployment.margin,
    rulesHash, closesAt: Number(closesAt), verifiedBlock: Number(blockNumber),
    verifiedBlockHash: block.hash,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, deploymentPath] = process.argv.slice(2);
  if (!manifestPath || !deploymentPath) {
    process.stderr.write('Usage: node verify-kuru-listing.mjs <collection-manifest.json> <kuru-deployment.json>\n');
    process.exitCode = 2;
  } else {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8'));
      const rpcUrl = process.env.FLURBO_ALCHEMY_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';
      const client = createPublicClient({ transport: http(rpcUrl) });
      process.stdout.write(JSON.stringify(await verifyKuruListing({ manifest, deployment, client }), null, 2) + '\n');
    } catch (error) {
      process.stderr.write((error instanceof Error ? error.message : 'Kuru verification failed') + '\n');
      process.exitCode = 1;
    }
  }
}
