import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { fetchKuruFills, kuruPriceAusd, type EnvioKuruFill } from '../envio';

type State = { status: 'loading' | 'ready' | 'error'; fills: EnvioKuruFill[] };

const receipts = (atoms: string) => {
  try { const n = BigInt(atoms); return `${n / 1_000_000n}.${String(n % 1_000_000n).padStart(6, '0').replace(/0+$/, '') || '0'}`; } catch { return 'Unavailable'; }
};

// Fills on this Kuru book as the Envio indexer saw them. The order book above is read from the chain; this list is history.
export default function KuruFills({ market }: { market: string }) {
  const [state, setState] = useState<State>({ status: 'loading', fills: [] });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', fills: [] });
    void fetchKuruFills(market, 10, undefined, controller.signal)
      .then(fills => { if (!controller.signal.aborted) setState({ status: 'ready', fills }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', fills: [] }); });
    return () => controller.abort();
  }, [market, refresh]);
  return <details className="detail-panel disclosure" aria-label="Recent fills">
    <summary>Recent fills · Envio</summary>
    <p className="market-caption">Indexed history may lag the chain. The order book above and your balances come from Monad directly.</p>
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefresh(value => value + 1)}>Refresh fills</button>
    {state.status === 'loading' && <p role="status">Loading indexed fills…</p>}
    {state.status === 'error' && <p role="status">Indexed fills are unavailable right now.</p>}
    {state.status === 'ready' && state.fills.length === 0 && <p>No indexed fills for this order book yet.</p>}
    {state.status === 'ready' && state.fills.length > 0 && <ol>
      {state.fills.map(fill => {
        const price = kuruPriceAusd(fill.price);
        return <li key={fill.id}>
          {receipts(fill.sizeAtoms)} receipts{price ? ` at ${price} test AUSD` : ''} · block {fill.blockNumber}
          {' · '}<a className="text-link" href={`https://testnet.monadscan.com/tx/${fill.txHash}`} target="_blank" rel="noreferrer">transaction <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.75} /></a>
        </li>;
      })}
    </ol>}
  </details>;
}
