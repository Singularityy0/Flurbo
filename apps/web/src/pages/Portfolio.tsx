import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw, Layers3, History } from 'lucide-react';
import { Link } from 'wouter';
import { amount, describeClaim, rememberedWallet, walletKey, type Market, type Portfolio as Data } from '../portfolio';
import './portfolio.css';

export default function Portfolio({ account, market, history = false }: { account: string; market: Market; history?: boolean }) {
  const [wallet, setWallet] = useState(() => rememberedWallet(account));
  const [draft, setDraft] = useState(wallet);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let controller: AbortController, stopped = false, failures = 0, timer: ReturnType<typeof setTimeout>;
    setData(null); setError(''); setRetrying(false);
    async function load() {
      if (stopped) return;
      controller = new AbortController();
      setBusy(true);
      let retryable = true;
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const base = market === 'learning' ? '/api/markets/learning' : '/api';
        const query = new URLSearchParams({ wallet, [history ? 'history_page' : 'page']: String(page) });
        const response = await fetch(`${base}/portfolio?${query}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        // A successful response with invalid JSON can be a transient proxy error.
        if (response.ok) retryable = true;
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'Portfolio unavailable. Please retry.');
        retryable = false;
        if (value.market_id !== market || value.wallet_address !== wallet.toLowerCase() || !value.index || !value.snapshot) throw new Error('Portfolio response does not match this wallet and market.');
        if (!stopped) {
          failures = 0; setError(''); setRetrying(false);
          setData(value);
          if (!value.index.complete) timer = setTimeout(load, 1500);
        }
      } catch (e) {
        if (!stopped) {
          if (retryable && failures < 2) {
            failures++; setRetrying(true);
            timer = setTimeout(load, failures * 2000);
          } else {
            setRetrying(false);
            setError(retryable ? 'We could not verify your activity with Monad. Refresh to resume the scan. This read does not change your holdings.' : e instanceof Error ? e.message : 'Activity unavailable. Please refresh.');
          }
        }
      }
      finally { clearTimeout(timeout); if (!stopped) setBusy(false); }
    }
    void load();
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); };
  }, [wallet, market, history, page, refresh]);
  const complete = data?.index.complete;
  const total = (history ? data?.history_count : data?.position_count) || 0;
  const pageSize = data?.page_size || 20;
  const chooseWallet = (value: string) => {
    if (!/^0x[\da-f]{40}$/i.test(value)) { setError('Enter a public wallet address with 40 hexadecimal characters.'); return; }
    const next = value.toLowerCase(); setPage(0); setWallet(next); setDraft(next); setRefresh(n => n + 1);
    try { sessionStorage.setItem(walletKey(account), next); } catch { /* Read access works without storage. */ }
  };
  return <section className="portfolio-view" aria-label={history ? 'Trading history' : 'Portfolio'}>
    <form className="portfolio-wallet" onSubmit={event => { event.preventDefault(); chooseWallet(draft.trim()); }}>
      <div><label htmlFor="portfolio-wallet">Wallet to view</label><input id="portfolio-wallet" autoComplete="off" spellCheck={false} value={draft} onChange={event => setDraft(event.target.value)} /></div>
      <button className="button button-dark" type="submit">View wallet</button>
      <button className="button button-outline" type="button" onClick={() => chooseWallet(account)}>Use Mera wallet</button>
      <p>Read-only view. Your trading wallet is remembered for this browser session. Mera and MetaMask have separate holdings.</p>
    </form>
    <div className="portfolio-toolbar"><div><span className="eyebrow">{market === 'learning' ? 'Learning pool' : 'Original pool'}</span><p className="portfolio-address">{wallet}</p></div>
      <button className="button button-outline" disabled={busy} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={14} className={busy ? 'portfolio-spin' : ''}/>{busy ? 'Reading...' : 'Refresh'}</button></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {retrying && <p role="status">The network read was interrupted. Retrying from the last verified block...</p>}
    {!complete && (!error || data) && <div className="portfolio-empty" role="status"><Layers3 size={26}/><h2>{error ? 'Scan paused.' : `Finding your ${history ? 'activity' : 'positions'}.`}</h2><p>Reading pool activity from deployment. Your balances will appear when the scan is complete.</p>{data && <><progress aria-label="History scan progress" value={Math.max(0, data.index.through_block - data.index.from_block + 1)} max={Math.max(1, data.index.target_block - data.index.from_block + 1)}/><p>Scanned through block {data.index.through_block.toLocaleString()} of {data.index.target_block.toLocaleString()}. You can leave and resume later.</p></>}</div>}
    {complete && <>
      <p className="portfolio-freshness" role="status">{data.snapshot.stale ? 'This snapshot is older. Refresh for current balances.' : 'Read from Monad testnet'} · Block {data.snapshot.block_number.toLocaleString()}</p>
      {!history && <div className="portfolio-metrics"><article><span className="eyebrow">Available AUSD</span><strong>{amount(data.ausd_atoms)}</strong><p>Wallet funds shared across both pools</p></article><article><span className="eyebrow">Open positions</span><strong>{data.position_count}</strong><p>All nonzero internal claims in this pool</p></article>{data.receipt_atoms != null && <article><span className="eyebrow">Wrapped H YES</span><strong>{amount(data.receipt_atoms)}</strong><p>Wallet receipts, separate from pool claims</p></article>}</div>}
      <div className="portfolio-section-heading"><h2>{history ? 'Your activity.' : 'What you hold.'}</h2><Link href={history ? '/portfolio' : '/history'}>{history ? 'View portfolio' : 'View history'} <ArrowUpRight size={14}/></Link></div>
      {total === 0 ? <div className="portfolio-empty">{history ? <History size={28}/> : <Layers3 size={28}/>}<h3>{history ? 'No pool activity yet.' : 'No open positions here.'}</h3><p>{history ? 'Confirmed buys, sells, conversions and redemptions for this wallet will appear here.' : 'This wallet holds no internal claims in the selected pool. Check the other pool or explore a prediction.'}</p><Link className="button button-dark" href="/account">Explore & trade <ArrowUpRight size={14}/></Link></div> : history ?
        <div className="portfolio-table"><table><caption>Confirmed pool actions, newest first</caption><thead><tr><th>Action / prediction</th><th>Shares</th><th>AUSD</th><th>Transaction</th></tr></thead><tbody>{data.history!.map(event => <tr key={`${event.transaction_hash}:${event.log_index}`}><td><span className="portfolio-tag">{event.kind === 'trade' ? event.is_buy ? 'Bought' : 'Sold' : event.kind === 'redemption' ? 'Redeemed' : event.kind === 'wrap' ? 'Wrapped' : 'Unwrapped'}</span><strong>{describeClaim(event.scope, Number(event.mask))}</strong><small>Block {event.block_number.toLocaleString()}</small></td><td>{amount(event.quantity_atoms)}</td><td>{event.collateral_atoms == null ? 'No cash transfer' : `${event.kind === 'trade' && event.is_buy ? '-' : '+'}${amount(event.collateral_atoms)}`}</td><td><a href={`https://testnet.monadscan.com/tx/${event.transaction_hash}`} target="_blank" rel="noreferrer">{event.transaction_hash.slice(0, 8)}...{event.transaction_hash.slice(-6)} <ArrowUpRight size={13}/><span className="sr-only"> View transaction in explorer</span></a></td></tr>)}</tbody></table></div> :
        <div className="portfolio-table"><table><caption>All held combinations, verified against the selected pool</caption><thead><tr><th>Prediction</th><th>Shares held</th><th>Settlement</th><th>Redeemable AUSD</th></tr></thead><tbody>{data.positions!.map(position => <tr key={`${position.scope}:${position.mask}`}><td><strong>{describeClaim(position.scope, position.mask)}</strong><small>Synthetic events · {market === 'learning' ? 'Learning pool' : 'Original pool'}</small></td><td>{amount(position.quantity_atoms)}</td><td><span className="portfolio-tag">{position.settlement === 'pending' ? 'Awaiting outcome' : position.settlement === 'winning' ? 'Winning' : 'Losing'}</span></td><td>{position.redeemable_atoms == null ? 'Pending outcome' : amount(position.redeemable_atoms)}</td></tr>)}</tbody></table></div>}
      {total > pageSize && <nav className="portfolio-pagination" aria-label={history ? 'History pages' : 'Position pages'}><button className="button button-outline" disabled={page === 0 || busy} onClick={() => setPage(n => n - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(total / pageSize)}</span><button className="button button-outline" disabled={(page + 1) * pageSize >= total || busy} onClick={() => setPage(n => n + 1)}>Next</button></nav>}
      <p className="portfolio-footnote">{history ? 'Shows successful actions emitted by this pool. Approvals, pending or failed transactions, wallet transfers and Kuru order history are not included. Confirmation does not imply finality.' : 'Includes every internal claim discovered from this pool’s events, including combinations outside the composer selection. Wrapped tokens and Kuru inventory are separate; available AUSD is not a portfolio valuation or profit.'}</p>
    </>}
  </section>;
}
