import { indexer } from 'envio';
import { KURU_MARKETS } from '../kuru-markets.generated.js';

const id = (event: { srcAddress: string; block: { number: number }; logIndex: number }) => `${event.srcAddress}-${event.block.number}-${event.logIndex}`;

indexer.onEvent({ contract: 'PilotPool', event: 'Traded' }, async ({ event, context }) => {
  const poolId = event.srcAddress;
  const trader = event.params.trader;
  const amount = event.params.collateralAmount;
  const isBuy = event.params.isBuy;
  const pool = await context.Pool.getOrCreate({ id: poolId, tradeCount: 0, volumeAtoms: 0n, redeemedAtoms: 0n });
  const positionId = `${trader}-${poolId}`;
  const position = await context.TraderPosition.getOrCreate({ id: positionId, pool: poolId, trader,
    totalCostAtoms: 0n, totalProceedsAtoms: 0n, totalRedeemedAtoms: 0n, netCashflowAtoms: 0n, tradeCount: 0 });
  context.Pool.set({ ...pool, tradeCount: pool.tradeCount + 1, volumeAtoms: pool.volumeAtoms + amount });
  context.TraderPosition.set({ ...position, totalCostAtoms: position.totalCostAtoms + (isBuy ? amount : 0n),
    totalProceedsAtoms: position.totalProceedsAtoms + (isBuy ? 0n : amount),
    netCashflowAtoms: position.netCashflowAtoms + (isBuy ? -amount : amount), tradeCount: position.tradeCount + 1 });
  context.Trade.set({ id: id(event), pool: poolId, trader, side: isBuy ? 'BUY' : 'SELL', scope: Number(event.params.scope),
    mask: event.params.mask, quantityAtoms: event.params.quantity, amountAtoms: amount,
    blockNumber: event.block.number, timestamp: event.block.timestamp });
});

indexer.onEvent({ contract: 'PilotPool', event: 'Redeemed' }, async ({ event, context }) => {
  const poolId = event.srcAddress;
  const trader = event.params.owner;
  const amount = event.params.collateralAmount;
  const pool = await context.Pool.getOrCreate({ id: poolId, tradeCount: 0, volumeAtoms: 0n, redeemedAtoms: 0n });
  const positionId = `${trader}-${poolId}`;
  const position = await context.TraderPosition.getOrCreate({ id: positionId, pool: poolId, trader,
    totalCostAtoms: 0n, totalProceedsAtoms: 0n, totalRedeemedAtoms: 0n, netCashflowAtoms: 0n, tradeCount: 0 });
  context.Pool.set({ ...pool, redeemedAtoms: pool.redeemedAtoms + amount });
  context.TraderPosition.set({ ...position, totalRedeemedAtoms: position.totalRedeemedAtoms + amount,
    netCashflowAtoms: position.netCashflowAtoms + amount });
  context.Trade.set({ id: id(event), pool: poolId, trader, side: 'REDEEM', scope: Number(event.params.scope),
    mask: event.params.mask, quantityAtoms: event.params.quantity, amountAtoms: amount,
    blockNumber: event.block.number, timestamp: event.block.timestamp });
});

indexer.onEvent({ contract: 'PilotResolver', event: 'Asserted' }, async ({ event, context }) => {
  context.ResolutionEvent.set({ id: id(event), resolver: event.srcAddress, eventIndex: Number(event.params.eventIndex),
    phase: 'Asserted', outcome: Number(event.params.outcome), blockNumber: event.block.number, timestamp: event.block.timestamp });
});
indexer.onEvent({ contract: 'PilotResolver', event: 'Disputed' }, async ({ event, context }) => {
  context.ResolutionEvent.set({ id: id(event), resolver: event.srcAddress, eventIndex: Number(event.params.eventIndex),
    phase: 'Disputed', outcome: Number(event.params.outcome), blockNumber: event.block.number, timestamp: event.block.timestamp });
});
indexer.onEvent({ contract: 'PilotResolver', event: 'Finalized' }, async ({ event, context }) => {
  context.ResolutionEvent.set({ id: id(event), resolver: event.srcAddress, eventIndex: Number(event.params.eventIndex),
    phase: 'Finalized', outcome: Number(event.params.outcome), blockNumber: event.block.number, timestamp: event.block.timestamp });
});
indexer.onEvent({ contract: 'PilotResolver', event: 'Delivered' }, async ({ event, context }) => {
  context.ResolutionEvent.set({ id: id(event), resolver: event.srcAddress, eventIndex: undefined,
    phase: 'Delivered', outcome: undefined, blockNumber: event.block.number, timestamp: event.block.timestamp });
});

// Wrapping a claim into its receipt token, and back, is how pool positions reach Kuru.
for (const [event, kind] of [['BaseWrapped', 'WRAP'], ['BaseUnwrapped', 'UNWRAP']] as const) {
  indexer.onEvent({ contract: 'PilotPool', event }, async ({ event, context }) => {
    context.ReceiptFlow.set({ id: id(event), pool: event.srcAddress, owner: event.params.owner, kind, scope: Number(event.params.scope),
      mask: Number(event.params.mask), quantityAtoms: event.params.quantity, blockNumber: event.block.number,
      timestamp: event.block.timestamp, txHash: event.transaction.hash });
  });
}

// Kuru order books for YES receipts. Which pool and question a market belongs to comes from config/kuru-listings.json.
const kuruMarket = async (market: string, context: { KuruMarket: { get(id: string): Promise<any>; set(entity: any): void } }) => {
  const meta = KURU_MARKETS[market];
  if (!meta) return null;
  return (await context.KuruMarket.get(market)) ?? { id: market, pool: meta.pool, eventIndex: meta.eventIndex, fillCount: 0,
    baseVolumeAtoms: 0n, ordersCreated: 0, ordersCanceled: 0, lastPrice: undefined };
};

indexer.onEvent({ contract: 'KuruMarket', event: 'Trade' }, async ({ event, context }) => {
  const market = await kuruMarket(event.srcAddress, context);
  if (!market) return;
  context.KuruMarket.set({ ...market, fillCount: market.fillCount + 1, baseVolumeAtoms: market.baseVolumeAtoms + event.params.filledSize,
    lastPrice: event.params.price });
  context.KuruFill.set({ id: id(event), market: event.srcAddress, maker: event.params.makerAddress, taker: event.params.takerAddress,
    isBuy: event.params.isBuy, price: event.params.price, sizeAtoms: event.params.filledSize, blockNumber: event.block.number,
    timestamp: event.block.timestamp, txHash: event.transaction.hash });
});

indexer.onEvent({ contract: 'KuruMarket', event: 'OrderCreated' }, async ({ event, context }) => {
  const market = await kuruMarket(event.srcAddress, context);
  if (market) context.KuruMarket.set({ ...market, ordersCreated: market.ordersCreated + 1 });
});

indexer.onEvent({ contract: 'KuruMarket', event: 'OrderCanceled' }, async ({ event, context }) => {
  const market = await kuruMarket(event.srcAddress, context);
  if (market) context.KuruMarket.set({ ...market, ordersCanceled: market.ordersCanceled + 1 });
});
