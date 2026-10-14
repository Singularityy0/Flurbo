import { useState } from 'react';
import type { PerplContext } from '../perpl';
import { formatScaled } from '../perpl';
import { ausd, estimatedPnl, type Portfolio } from '../perpl-portfolio';
import './perpl-portfolio.css';
import PerplProtocolHistory from './PerplProtocolHistory';
import PerplHistory from './PerplHistory';
import PerplMarketChart from './PerplMarketChart';

export default function PerplPortfolio({ portfolio, context, connected, stale, refreshed, apiKey, onClose }: {
  portfolio:Portfolio;context:PerplContext;connected:boolean;stale:boolean;refreshed:number|null;
  apiKey:{token:string;secret:Uint8Array}|null;
  onClose(position:Portfolio['positions'][number]):void;
}) {
  const [view,setView]=useState<'wallet'|'protocol'>('wallet');
  const market=(id:number)=>context.markets.find(m=>m.id===id);
  const money=(value:number)=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:4}):'—';
  const sum=(field:'dailyVolume'|'tvl')=>context.markets.every(m=>m[field]!==undefined)?ausd(context.markets.reduce((sum,m)=>sum+BigInt(m[field]!),0n).toString()):'—';
  const realized=portfolio.stats.length?ausd(portfolio.stats.reduce((sum,s)=>sum+BigInt(s.realized),0n).toString()):'—';
  return <section className="perpl-intelligence" aria-label="Perpl portfolio and protocol">
    <header><div><span className="eyebrow">Perpl · Monad testnet</span><h2>Trading intelligence</h2></div><span role="status">{connected&&!stale?'Account stream connected':'Account stream offline or stale'}</span></header>
    <div className="perpl-view-switch" role="group" aria-label="Analytics view">
      <button type="button" aria-pressed={view==='wallet'} onClick={()=>setView('wallet')}>My portfolio</button>
      <button type="button" aria-pressed={view==='protocol'} onClick={()=>setView('protocol')}>Protocol</button>
    </div>
    {view==='wallet'?<>
      <p className="perpl-wallet-address">{portfolio.wallet??'Connect your Perpl key above to load your wallet.'}</p>
      <div className="perpl-metric-grid"><div><small>Open positions</small><strong>{portfolio.positionsLoaded?portfolio.positions.length:'—'}</strong></div><div><small>Open orders</small><strong>{portfolio.ordersLoaded?portfolio.orders.length:'—'}</strong></div><div><small>Realized PnL · AUSD</small><strong>{realized}</strong></div><div><small>Reported trades</small><strong>{portfolio.stats.length?portfolio.stats.reduce((n,s)=>n+s.trades,0):'—'}</strong></div></div>
      {portfolio.balances.length>0&&<><h3>Margin accounts</h3><div className="perpl-table-scroll"><table><thead><tr><th>Account</th><th>Balance · AUSD</th><th>Locked · AUSD</th><th>Balance less locked · AUSD</th></tr></thead><tbody>{portfolio.balances.map(b=><tr key={b.account}><td>{b.account}</td><td>{ausd(b.balance)}</td><td>{b.locked===null?'Not supplied':ausd(b.locked)}</td><td>{b.locked===null?'Not supplied':ausd((BigInt(b.balance)-BigInt(b.locked)).toString())}</td></tr>)}</tbody></table></div><p className="perpl-data-note">Perpl account balances; balance less locked is not a guarantee of withdrawable funds. Position collateral and unrealized PnL are shown separately.</p></>}
      <h3>Open positions</h3>
      {!portfolio.positionsLoaded?<p>Waiting for Perpl positions. Connect above; an empty list is shown only after Perpl replies.</p>:!portfolio.positions.length?<p>No open positions in this wallet.</p>:<div className="perpl-table-scroll"><table><thead><tr><th>Market / account</th><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Leverage</th><th>Collateral · AUSD</th><th>Est. PnL · AUSD</th><th>Action</th></tr></thead><tbody>{portfolio.positions.map(p=>{const m=market(p.market);return <tr key={`${p.account}:${p.market}:${p.id}`}><td>{m?.symbol??p.market} / {p.account}</td><td>{p.side===1?'Long':'Short'}</td><td>{m?formatScaled(p.size,m.sizeDecimals):'—'}</td><td>{m?formatScaled(p.entry,m.priceDecimals):'—'}</td><td>{m?formatScaled(m.mark,m.priceDecimals):'—'}</td><td>{p.leverage/100}×</td><td>{ausd(p.collateral)}</td><td>{m?money(estimatedPnl(p,m)):'—'}</td><td><button type="button" disabled={!connected||stale} onClick={()=>onClose(p)}>Review close</button></td></tr>;})}</tbody></table></div>}
      <p className="perpl-data-note">PnL is a mark-price estimate before funding, fees and entry-price residue. It is not withdrawable balance. Exact liquidation prices are not supplied by this view.</p>
      {portfolio.stats.length>0&&<><h3>Account performance</h3><div className="perpl-table-scroll"><table><thead><tr><th>Account</th><th>Deposits · AUSD</th><th>Withdrawals · AUSD</th><th>Net deposits · AUSD</th><th>Fees · AUSD</th><th>Realized PnL · AUSD</th><th>Win rate</th></tr></thead><tbody>{portfolio.stats.map(s=><tr key={s.account}><td>{s.account}</td><td>{ausd(s.deposits)}</td><td>{ausd(s.withdrawals)}</td><td>{ausd((BigInt(s.deposits)-BigInt(s.withdrawals)).toString())}</td><td>{ausd(s.fees)}</td><td>{ausd(s.realized)}</td><td>{s.trades?`${s.winRate/100}%`:'—'}</td></tr>)}</tbody></table></div><p className="perpl-data-note">Statistics reported by Perpl for each account. Net deposits exclude trading PnL.</p></>}
      <h3>Open orders</h3>
      {!portfolio.ordersLoaded?<p>Waiting for Perpl orders.</p>:!portfolio.orders.length?<p>No resting orders.</p>:<div className="perpl-table-scroll"><table><thead><tr><th>Order</th><th>Account</th><th>Market</th><th>Size</th><th>Limit price</th></tr></thead><tbody>{portfolio.orders.map(o=>{const m=market(o.market);return <tr key={`${o.account}:${o.market}:${o.id}`}><td>{o.id}</td><td>{o.account}</td><td>{m?.symbol??o.market}</td><td>{m?formatScaled(o.size,m.sizeDecimals):'—'}</td><td>{m&&o.price?formatScaled(o.price,m.priceDecimals):'Market'}</td></tr>;})}</tbody></table></div>}
      <h3>Recent fills</h3><p className="perpl-data-note">Fills received during this connection, up to 100. Signed historical fills are shown below.</p>
      {!portfolio.fills.length?<p>No fills received yet.</p>:<div className="perpl-table-scroll"><table><thead><tr><th>Market</th><th>Size</th><th>Price</th><th>Fee · AUSD</th><th>Transaction</th></tr></thead><tbody>{[...portfolio.fills].reverse().map(f=>{const m=market(f.market);return <tr key={f.key}><td>{m?.symbol??f.market}</td><td>{m?formatScaled(f.size,m.sizeDecimals):'—'}</td><td>{m&&f.price!==null?formatScaled(f.price,m.priceDecimals):'—'}</td><td>{ausd(f.fee)}</td><td>{f.hash?<a href={`https://testnet.monadscan.com/tx/${f.hash}`} target="_blank" rel="noreferrer">{f.hash.slice(0,10)}…</a>:'Not supplied'}</td></tr>;})}</tbody></table></div>}
      <PerplHistory wallet={portfolio.wallet} apiKey={apiKey} context={context}/>
    </>:<>
      <p>Public market snapshot · {refreshed?`Updated ${new Date(refreshed).toLocaleTimeString()}`:'Loading'} · refreshes every 30 seconds.</p>
      <div className="perpl-metric-grid"><div><small>24h volume · AUSD</small><strong>{sum('dailyVolume')}</strong></div><div><small>Market TVL sum · AUSD</small><strong>{sum('tvl')}</strong></div><div><small>Markets</small><strong>{context.markets.length}</strong></div><div><small>Open markets</small><strong>{context.markets.filter(m=>m.open).length}</strong></div></div>
      <PerplMarketChart markets={context.markets}/><PerplProtocolHistory markets={context.markets}/>
      <div className="perpl-table-scroll"><table><thead><tr><th>Market</th><th>Mark</th><th>24h volume · AUSD</th><th>Open interest · asset</th><th>TVL · AUSD</th><th>Funding / interval</th></tr></thead><tbody>{context.markets.map(m=><tr key={m.id}><td>{m.symbol}</td><td>{formatScaled(m.mark,m.priceDecimals)}</td><td>{m.dailyVolume!==undefined?ausd(m.dailyVolume):'—'}</td><td>{m.openInterest!==undefined?formatScaled(m.openInterest,m.sizeDecimals):'—'}</td><td>{m.tvl!==undefined?ausd(m.tvl):'—'}</td><td>{m.fundingRate!==undefined?`${(m.fundingRate/10000).toFixed(4)}%`:'—'}{m.fundingInterval?` / ${m.fundingInterval/3600}h`:''}</td></tr>)}</tbody></table></div>
      <p className="perpl-data-note">Market TVL is summed from Perpl’s market records, not wallet deposits. Protocol-wide revenue, active users, long/short skew and liquidation totals require an additional indexer. They are not inferred from your wallet.</p>
    </>}
  </section>;
}
