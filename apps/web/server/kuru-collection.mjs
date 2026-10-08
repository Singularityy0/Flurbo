import { createPublicClient, http, parseAbi } from 'viem';

const addr = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const same = (a, b) => addr(a) && addr(b) && a.toLowerCase() === b.toLowerCase();
const word = (data, index = 0) => {
  if (typeof data !== 'string' || !/^0x(?:[0-9a-f]{64})+$/i.test(data) || data.length < 66 + index * 64)
    throw Error('Kuru returned invalid contract data.');
  return BigInt('0x' + data.slice(2 + index * 64, 66 + index * 64));
};
const poolAbi = parseAbi([
  'function funded() view returns (bool)', 'function resolved() view returns (bool)',
  'function closesAt() view returns (uint64)',
  'function baseTokens(uint32 scope,uint8 mask) view returns (address)',
  'function holdings(address owner,uint32 scope,uint256 mask) view returns (uint128)',
]);
const tokenAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)',
]);
const marginAbi = parseAbi([
  'function verifiedMarket(address market) view returns (bool)',
  'function getBalance(address owner,address token) view returns (uint256)',
]);
const marketAbi = parseAbi([
  'function s_orders(uint40 id) view returns (address owner,uint96 size,uint40 prev,uint40 next,uint40 flippedId,uint32 price,uint32 flippedPrice,bool isBuy)',
]);

export function parseKuruListing(raw) {
  if (!raw) return null;
  const listing = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (listing?.schema !== 'flurbo.kuru-listing.v1' ||
      listing.status !== 'verified_kuru_snapshot' || listing.chainId !== 10143 ||
      !Number.isInteger(listing.eventIndex) || listing.eventIndex < 0 || listing.eventIndex > 31 ||
      ![listing.pool, listing.receipt, listing.market, listing.cash, listing.margin].every(addr) ||
      !Number.isSafeInteger(listing.closesAt) || listing.closesAt <= 0 ||
      !Number.isSafeInteger(listing.verifiedBlock) || listing.verifiedBlock <= 0 ||
      !/^0x[0-9a-f]{64}$/i.test(listing.verifiedBlockHash || '') ||
      !/^0x[0-9a-f]{64}$/i.test(listing.rulesHash || '')) throw Error('Invalid Kuru listing configuration.');
  return listing;
}

export function listingForCollection(listing, manifest, eventIndex) {
  const receipts = manifest?.verification?.receipts || manifest?.receipts;
  return listing && manifest?.chainId === 10143 &&
    manifest?.status === 'verified_pilot_snapshot' &&
    Number(eventIndex) === listing.eventIndex && same(listing.pool, manifest.pool) &&
    same(listing.receipt, receipts?.[listing.eventIndex]) &&
    listing.rulesHash.toLowerCase() === manifest.rulesHash?.toLowerCase() &&
    listing.closesAt === manifest.publication?.draft?.closesAt
    ? listing : null;
}

export async function readKuruCollection({ listing, manifest, wallet, before = 0, rpcUrl, client: suppliedClient, now = Date.now() }) {
  if (!listingForCollection(listing, manifest, listing?.eventIndex) || !addr(wallet) ||
      !Number.isSafeInteger(before) || before < 0 || before >= 2 ** 40) throw Error('Invalid Kuru collection request.');
  const client = suppliedClient || createPublicClient({ transport: http(rpcUrl) });
  if (await client.getChainId() !== 10143) throw Error('Kuru RPC is not Monad testnet.');
  const checkpoint = await client.getBlock({ blockNumber: BigInt(listing.verifiedBlock) });
  if (checkpoint.hash?.toLowerCase() !== listing.verifiedBlockHash.toLowerCase()) throw Error('Kuru listing checkpoint changed.');
  const blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber });
  const at = { blockNumber }, contracts = {
    pool: listing.pool, receipt: listing.receipt, market: listing.market,
    cash: listing.cash, margin: listing.margin,
  };
  const read = (abi, address, functionName, args = []) =>
    client.readContract({ abi, address, functionName, args, ...at });
  const raw = (address, data) => client.call({ to: address, data, ...at }).then(result => result.data);
  const [code, canonical, verified, params, funded, resolved, closesAt,
    cashBalance, receiptBalance, cashAllowance, receiptAllowance, marginCash,
    marginReceipt, poolYes, top, counter] = await Promise.all([
    client.getCode({ address: listing.market, ...at }),
    read(poolAbi, listing.pool, 'baseTokens', [2 ** listing.eventIndex, 2]),
    read(marginAbi, listing.margin, 'verifiedMarket', [listing.market]),
    raw(listing.market, '0x90c9427c'),
    read(poolAbi, listing.pool, 'funded'), read(poolAbi, listing.pool, 'resolved'),
    read(poolAbi, listing.pool, 'closesAt'),
    read(tokenAbi, listing.cash, 'balanceOf', [wallet]),
    read(tokenAbi, listing.receipt, 'balanceOf', [wallet]),
    read(tokenAbi, listing.cash, 'allowance', [wallet, listing.margin]),
    read(tokenAbi, listing.receipt, 'allowance', [wallet, listing.margin]),
    read(marginAbi, listing.margin, 'getBalance', [wallet, listing.cash]),
    read(marginAbi, listing.margin, 'getBalance', [wallet, listing.receipt]),
    read(poolAbi, listing.pool, 'holdings', [wallet, 2 ** listing.eventIndex, 2]),
    raw(listing.market, '0xb4de8b70'), raw(listing.market, '0x2bf1360e'),
  ]);
  if (!code || code === '0x' || !same(canonical, listing.receipt) || !verified ||
      word(params, 0) !== 1000000n || word(params, 1) !== 1000000n ||
      word(params, 2) !== BigInt(listing.receipt) || word(params, 3) !== 6n ||
      word(params, 4) !== BigInt(listing.cash) || word(params, 5) !== 6n ||
      word(params, 6) !== 100n || word(params, 7) !== 10000n ||
      word(params, 8) !== 100000000n || word(params, 9) !== 30n ||
      word(params, 10) !== 10n || Number(closesAt) !== listing.closesAt)
    throw Error('Kuru pair no longer matches its verified listing.');
  const count = Number(word(counter));
  if (!Number.isSafeInteger(count) || count >= 2 ** 40) throw Error('Invalid Kuru order counter.');
  const last = before ? Math.min(count, before - 1) : count;
  const ids = Array.from({ length: Math.min(20, last) }, (_, i) => last - i);
  const orders = [];
  for (const id of ids) {
    const [owner, size, , , flippedId, price, flippedPrice, isBuy] =
      await read(marketAbi, listing.market, 's_orders', [id]);
    if (!same(owner, wallet) || BigInt(size) === 0n || BigInt(flippedId) !== 0n ||
        BigInt(flippedPrice) !== 0n || Number(price) <= 0 || Number(price) > 1000000) continue;
    const head = await raw(listing.market, (isBuy ? '0xe6d29b51' : '0x0e2e2ffe') +
      BigInt(price).toString(16).padStart(64, '0'));
    if (word(head) === 0n || word(head) > BigInt(id)) continue;
    orders.push({ id: String(id), side: isBuy ? 'buy' : 'sell',
      remaining_atoms: String(size), price_units: String(price) });
  }
  const fromBlock = blockNumber > BigInt(listing.verifiedBlock + 99)
    ? blockNumber - 99n : BigInt(listing.verifiedBlock);
  const logs = await client.getLogs({ address: listing.market, fromBlock, toBlock: blockNumber });
  if (logs.length > 2000) throw Error('Kuru activity exceeds the bounded reader.');
  if ((await client.getBlock({ blockNumber })).hash !== block.hash) throw Error('Kuru snapshot changed.');
  const stale = Math.abs(now / 1000 - Number(block.timestamp)) > 45;
  return {
    environment: 'public_testnet', chain_id: 10143, contracts: {...contracts,eventIndex:listing.eventIndex},
    trading_available: funded && !resolved && Number(block.timestamp) < Number(closesAt),
    snapshot: { block_number: Number(blockNumber), block_hash: block.hash,
      timestamp: Number(block.timestamp), stale },
    wallet: { address: wallet, ausd_atoms: String(cashBalance), receipt_atoms: String(receiptBalance), pool_yes_atoms: String(poolYes),
      cash_margin_allowance_atoms: String(cashAllowance),
      receipt_margin_allowance_atoms: String(receiptAllowance),
      margin_available_ausd_atoms: String(marginCash),
      margin_available_receipt_atoms: String(marginReceipt) },
    kuru: { best_bid_wad: word(top) === (1n << 256n) - 1n ? null : String(word(top)),
      best_ask_wad: word(top, 1) === 0n ? null : String(word(top, 1)) },
    orders, orders_page: { through_id: String(last),
      next_before: ids.length && ids.at(-1) > 1 ? String(ids.at(-1)) : null },
    activity: { from_block: Number(fromBlock), to_block: Number(blockNumber),
      logs: logs.map(log => ({ ...log, blockNumber: Number(log.blockNumber),
        logIndex: Number(log.logIndex), transactionIndex: Number(log.transactionIndex) })) },
  };
}
