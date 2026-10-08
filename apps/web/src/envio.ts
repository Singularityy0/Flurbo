// Historical indexer data is useful for activity displays; current quotes and
// balances always come from the pool through a fresh chain read.
export const DEFAULT_ENVIO_ENDPOINT = '/envio';

export type EnvioTrade = {
  id: string;
  side: 'BUY' | 'SELL' | 'REDEEM';
  scope: number;
  mask: string;
  quantityAtoms: string;
  amountAtoms: string;
  blockNumber: number;
  timestamp: number;
};

export type EnvioKuruFill = {
  id: string;
  isBuy: boolean;
  price: string;
  sizeAtoms: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
};

export type EnvioTraderPosition = {
  pool: string;
  trader: string;
  totalCostAtoms: string;
  totalProceedsAtoms: string;
  totalRedeemedAtoms: string;
  netCashflowAtoms: string;
  tradeCount: number;
};

export async function fetchPortfolioPositions(
  pools: string[], traders: string[], endpoint = DEFAULT_ENVIO_ENDPOINT, signal?: AbortSignal
): Promise<EnvioTraderPosition[]> {
  const data = await queryIndexer<{ TraderPosition: EnvioTraderPosition[] }>(
    { kind: 'portfolio', pools, traders }, endpoint, signal
  );
  if (!Array.isArray(data.TraderPosition)) throw new Error('Indexed activity is unavailable.');
  return data.TraderPosition;
}

async function queryIndexer<T>(input: object, endpoint: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: signal || AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error('Indexed activity is unavailable.');
  const result = await res.json();
  if (!result || result.errors || !result.data) throw new Error('Indexed activity is unavailable.');
  return result.data as T;
}

export async function fetchRecentTrades(
  pool: string,
  limit = 5,
  endpoint = DEFAULT_ENVIO_ENDPOINT,
  signal?: AbortSignal
): Promise<EnvioTrade[]> {
  const data = await queryIndexer<{ Trade: EnvioTrade[] }>({ kind: 'trades', pool, limit }, endpoint, signal);
  if (!Array.isArray(data.Trade)) throw new Error('Indexed activity is unavailable.');
  return data.Trade;
}

export async function fetchKuruFills(
  market: string,
  limit = 5,
  endpoint = DEFAULT_ENVIO_ENDPOINT,
  signal?: AbortSignal
): Promise<EnvioKuruFill[]> {
  const data = await queryIndexer<{ KuruFill: EnvioKuruFill[] }>({ kind: 'kuru-fills', market, limit }, endpoint, signal);
  if (!Array.isArray(data.KuruFill)) throw new Error('Indexed activity is unavailable.');
  return data.KuruFill;
}

// Kuru emits prices either in its 1e6 price precision (0.46 is 460000) or in 1e18 fixed point. A probability-like price
// of at most 1 test AUSD per receipt cannot be confused between the two, so anything else is shown as unavailable.
export function kuruPriceAusd(raw: string): string | null {
  let value: bigint;
  try { value = BigInt(raw); } catch { return null; }
  const scale = value > 0n && value <= 1_000_000n ? 1_000_000n : value > 1_000_000n && value <= 10n ** 18n ? 10n ** 18n : 0n;
  if (!scale) return null;
  const micro = (value * 1_000_000n) / scale;
  return `${micro / 1_000_000n}.${String(micro % 1_000_000n).padStart(6, '0')}`;
}

export async function fetchTraderPosition(
  pool: string,
  trader: string,
  endpoint = DEFAULT_ENVIO_ENDPOINT,
  signal?: AbortSignal
): Promise<EnvioTraderPosition | null> {
  const data = await queryIndexer<{ TraderPosition_by_pk: EnvioTraderPosition | null }>(
    { kind: 'position', pool, trader }, endpoint, signal
  );
  return data.TraderPosition_by_pk ?? null;
}
