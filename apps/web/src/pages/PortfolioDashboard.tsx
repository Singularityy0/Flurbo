import {useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'wouter';
import {amount,describeClaimAnswers} from '../portfolio';
import {accountOwners,combineHoldings} from '../account-holdings';
import {loadPortfolio,type PoolRead} from '../portfolio-loader';
import {accountActivity,positionKey,realizedPerformance,type TradeActivity} from '../portfolio-performance';
import {readPilotPending,type PilotNamespace} from '../pilot';
import type {MarketGroup} from '../market-directory';
import {marketQuestion} from '../showcase-copy';
import Pilot from './Pilot';
import './portfolio.css';

type Selection={namespace:PilotNamespace;scope:number;mask:string};
const signed=(n:bigint)=>(n<0n?'-':n>0n?'+':'')+amount(String(n<0n?-n:n));
export default function PortfolioDashboard({account,wallets,groups}:{account:string;wallets:string[];groups:MarketGroup[]}){
  const [data,setData]=useState<Record<string,PoolRead>>({}),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0),[historyOnly,setHistoryOnly]=useState(false);
  const [tab,setTab]=useState<'Holdings'|'Activity'>('Holdings'),[filter,setFilter]=useState('All'),[page,setPage]=useState(0),[payoutBusy,setPayoutBusy]=useState(false);
  const [selection,setSelection]=useState<Selection|null>(()=>{
    for(const group of groups)try{const p=readPilotPending(group.namespace);if(p?.login===account&&p.review.requested.action==='redeem')return {namespace:group.namespace,scope:p.review.requested.scope!,mask:p.review.requested.mask!};}catch{return {namespace:group.namespace,scope:1,mask:'2'};}
    return null;
  });
  const identity=accountOwners(account,wallets).join(',');
  useEffect(()=>{
    const c=new AbortController();setBusy(true);
    if(!historyOnly)setData({});
    void loadPortfolio({account,wallets,groups,signal:c.signal,historyOnly,previous:data,publish:(namespace,value)=>setData(old=>({...old,[namespace]:value}))}).finally(()=>{if(!c.signal.aborted)setBusy(false);});
    return()=>c.abort();
  // data is the previous snapshot only when the user asks to continue history.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[account,identity,groups,revision]);
  const refresh=()=>{setHistoryOnly(false);setRevision(x=>x+1);};
  const rows=groups.flatMap(group=>{const read=data[group.namespace];return read?combineHoldings(Object.values(read.owners)).map(row=>({...row,group,read})):[];});
  const allHoldings=groups.every(g=>data[g.namespace]?.holdingsComplete),failed=Object.values(data).some(d=>d.error),allHistory=groups.every(g=>data[g.namespace]?.history?.complete&&!data[g.namespace]?.historyError);
  const trades=useMemo(()=>groups.flatMap(g=>accountActivity(g.namespace,g.pool,data[g.namespace]?.history?.logs||[],identity.split(','))).sort((a,b)=>a.block-b.block||a.index-b.index),[data,groups,identity]);
  const performance=useMemo(()=>realizedPerformance(trades),[trades]);
  const balances=new Map<string,bigint>();for(const read of Object.values(data))for(const [owner,values] of Object.entries(read.owners))for(const row of values)balances.set(positionKey(read.group.pool,owner,row.scope,row.mask),BigInt(row.quantity));
  const basisMatches=allHoldings&&[...balances].every(([key,q])=>(performance.inventory.get(key)?.quantity||0n)===q)&&[...performance.inventory].every(([key,v])=>(balances.get(key)||0n)===v.quantity);
  const pnlReady=allHistory&&performance.valid&&basisMatches;
  const payout=rows.reduce((sum,row)=>sum+BigInt(row.payoutAtoms||0),0n);
  const label=(namespace:string,scope:number)=>data[namespace]?.manifest?.publication.draft.events.filter((_e,i)=>scope&(1<<i)).map(marketQuestion).join(' + ')||'Prediction';
  const state=(row:typeof rows[number])=>row.payoutAtoms===null?'Awaiting settlement':BigInt(row.payoutAtoms)>0n?'Ready to collect':'No payout';
  const filtered=rows.filter(row=>filter==='All'||filter==='Ready to collect'&&BigInt(row.payoutAtoms||0)>0n||filter==='Unsettled'&&row.payoutAtoms===null||filter==='Settled'&&row.payoutAtoms!==null);
  const selectedRead=selection?data[selection.namespace]:null;
  const payoutOwners=selection&&selectedRead?wallets.filter(owner=>selectedRead.owners[owner.toLowerCase()]?.some(row=>row.scope===selection.scope&&row.mask===selection.mask&&BigInt(row.payoutAtoms||0)>0n)):[];
  const shown=[...trades].reverse().slice(page*20,page*20+20);
  return <div className="unified-portfolio portfolio-view">
    <div className="portfolio-dashboard-toolbar"><p>{busy?'Updating your account...':failed?'Some balances need another check.':'Your linked wallets, together.'}</p><button className="button button-outline" disabled={payoutBusy} onClick={refresh}>{busy?'Refresh again':'Refresh'}</button></div>
    {failed&&<p role="alert" className="portfolio-load-notice">Some shares could not be refreshed. Showing verified balances only. Refresh to retry.</p>}
    <div className="portfolio-summary-grid">
      <article><span>Positions</span><strong>{rows.length}{!allHoldings?' +':''}</strong><small>{allHoldings?'Individual and combined holdings':'Loading remaining balances'}</small></article>
      <article><span>Ready to collect</span><strong>{amount(String(payout))}</strong><small>Test AUSD{!allHoldings?' · Partial total':''}</small></article>
      <article><span>Realized PnL</span><strong>{pnlReady?signed(performance.realized):'Not available yet'}</strong><small>{pnlReady?'Test AUSD · Excludes gas':'Waiting for complete trading history'}</small></article>
    </div>
    <section className="portfolio-performance" aria-label="Realized PnL">
      <div className="portfolio-section-heading"><div><span className="eyebrow">Your performance</span><h2>Realized PnL</h2></div><span className="portfolio-tag">Test AUSD</span></div>
      {pnlReady&&performance.points.length>0?<PnlChart points={performance.points}/>:<div className="portfolio-chart-empty"><span aria-hidden="true" className="portfolio-chart-grid"/><p>{!pnlReady?'Your chart will appear when trading history is verified.':'No realized profit or loss yet.'}</p><small>{pnlReady?'Sales and collected payouts will appear here.':'Your holdings can be used while earlier activity loads.'}</small></div>}
      <details className="portfolio-method"><summary>How this is calculated</summary><p>Sale proceeds and collected payouts, minus the average purchase cost of those shares. Open positions and uncollected payouts are excluded. Test MON gas is excluded. Cost basis is calculated separately for each owning wallet before totals are combined.</p><p>History must be complete and match current holdings. Missing purchases, wrapped or transferred positions can prevent a reliable calculation. The chart follows confirmed sales and payouts, not daily account value.</p></details>
    </section>
    <div className="portfolio-tabs" aria-label="Portfolio views">{(['Holdings','Activity'] as const).map(value=><button key={value} aria-pressed={tab===value} onClick={()=>setTab(value)}>{value}{value==='Holdings'?' · '+rows.length:''}</button>)}</div>
    {tab==='Holdings'?<section aria-label="Your shares"><div className="portfolio-section-heading"><h2>Your shares</h2><label className="portfolio-filter">Show <select value={filter} onChange={e=>setFilter(e.target.value)}>{['All','Unsettled','Ready to collect','Settled'].map(f=><option key={f}>{f}</option>)}</select></label></div>
      <div className="portfolio-table unified-holdings"><table><thead><tr><th>Prediction</th><th>Shares</th><th>Result / payout</th></tr></thead><tbody>{filtered.map(row=><tr key={`${row.group.pool}:${row.scope}:${row.mask}`}><td><Link href={`/markets/${row.group.namespace}/${Math.log2(row.scope&-row.scope)}`}><strong>{label(row.group.namespace,row.scope)}</strong></Link><small>{describeClaimAnswers(row.scope,Number(row.mask))}</small></td><td><span className="holding-mobile-label" aria-hidden="true">Shares</span>{amount(row.quantity)}</td><td><span className="holding-mobile-label" aria-hidden="true">Result / payout</span><span>{state(row)}</span>{row.payoutAtoms!==null&&BigInt(row.payoutAtoms)>0n&&<><strong>{amount(row.payoutAtoms)} test AUSD</strong>{wallets.some(owner=>row.read.owners[owner.toLowerCase()]?.some(p=>p.scope===row.scope&&p.mask===row.mask&&BigInt(p.payoutAtoms||0)>0n))&&<button className="button button-dark holding-collect" disabled={payoutBusy||!!selection} onClick={()=>setSelection({namespace:row.group.namespace,scope:row.scope,mask:row.mask})}>Collect payout</button>}</>}</td></tr>)}</tbody></table></div>
      {!filtered.length&&<div className="portfolio-empty"><p role="status">{busy&&!allHoldings?'Checking your shares...':!allHoldings?'Balances are incomplete. Refresh to try again.':rows.length?'No positions match this filter.':'No shares yet. Your first prediction will appear here.'}</p><Link href="/markets" className="text-link">Explore markets</Link></div>}
    </section>:<section aria-label="Your trading activity"><div className="portfolio-section-heading"><h2>Your trades</h2><span>{allHistory?'Indexed activity':'History still loading'}</span></div><div className="portfolio-table portfolio-activity"><table><thead><tr><th>Prediction / action</th><th>Shares</th><th>Test AUSD</th><th>Transaction</th></tr></thead><tbody>{shown.map(trade=><tr key={`${trade.pool}:${trade.hash}:${trade.index}`}><td><span className="portfolio-tag">{trade.action}</span><strong>{label(trade.namespace,trade.scope)}</strong><small>{describeClaimAnswers(trade.scope,Number(trade.mask))}</small></td><td>{amount(String(trade.quantity))}</td><td>{trade.action==='Buy'?'-':'+'}{amount(String(trade.cash))}</td><td><a href={`https://testnet.monadexplorer.com/tx/${trade.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a><small>Block {trade.block.toLocaleString()}</small></td></tr>)}</tbody></table></div>{!shown.length&&<p className="portfolio-footnote">{allHistory?'No confirmed trades found for your linked wallets.':'Confirmed trades will appear as history loads.'}</p>}<div className="portfolio-pagination"><button className="button button-outline" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button className="button button-outline" disabled={(page+1)*20>=trades.length} onClick={()=>setPage(p=>p+1)}>Next</button></div></section>}
    {!allHistory&&<div className="portfolio-history-notice"><p>{busy?'Loading earlier activity in the background.':'More history is needed for your activity and PnL.'}</p><button className="button button-outline" disabled={busy||payoutBusy} onClick={()=>{setHistoryOnly(true);setRevision(x=>x+1);}}>Load more activity</button></div>}
    {selection&&<section className="portfolio-payout-panel"><Pilot key={`${selection.namespace}:${selection.scope}:${selection.mask}`} namespace={selection.namespace} payout={{scope:selection.scope,mask:selection.mask,owners:payoutOwners.map(x=>x.toLowerCase()),title:label(selection.namespace,selection.scope)+' · '+describeClaimAnswers(selection.scope,Number(selection.mask))}} onBusy={setPayoutBusy} onTradeConfirmed={refresh}/><button className="button button-outline" disabled={payoutBusy} onClick={()=>setSelection(null)}>Close payout</button></section>}
  </div>;
}

function PnlChart({points}:{points:{trade:TradeActivity;value:bigint}[]}){
  const box=useRef<HTMLDivElement>(null),[width,setWidth]=useState(760),[hover,setHover]=useState<number|null>(null);
  useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(Math.max(280,Math.min(1100,entries[0].contentRect.width))));if(box.current)observer.observe(box.current);return()=>observer.disconnect();},[]);
  const values=[0,...points.map(p=>Number(p.value)/1e6)],low=Math.min(...values),high=Math.max(...values),range=high-low||1;
  const tick=(n:number)=>new Intl.NumberFormat(undefined,{notation:Math.abs(n)>=10000?'compact':'standard',maximumFractionDigits:2}).format(n);
  const x=(i:number)=>60+i/Math.max(1,values.length-1)*(width-80),y=(v:number)=>200-(v-low)/range*160;
  const selected=hover===null?points.at(-1)!:points[hover]||points.at(-1)!;
  return <div className="portfolio-pnl-chart" ref={box}><svg viewBox={`0 0 ${width} 245`} role="img" aria-label={`Realized PnL after ${points.length} confirmed sales and payouts: ${signed(points.at(-1)!.value)} test AUSD`}>
    {[low,low+range/2,low+range].map((v,i)=><g key={i}><line x1="60" x2={width-20} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".12"/><text x="48" y={y(v)+4} textAnchor="end">{tick(v)}</text></g>)}
    <polyline points={values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--forest)" strokeWidth="3"/>
    {points.map((p,i)=><circle key={p.trade.hash+':'+p.trade.index} cx={x(i+1)} cy={y(Number(p.value)/1e6)} r="5" fill="var(--forest)" tabIndex={0} role="button" aria-label={`Exit ${i+1}: ${signed(p.value)} test AUSD`} onMouseEnter={()=>setHover(i)} onFocus={()=>setHover(i)} onClick={()=>setHover(i)}><title>{signed(p.value)} test AUSD · Block {p.trade.block}</title></circle>)}
    <text x="60" y="232">Start</text><text x={width-20} y="232" textAnchor="end">{points.length} confirmed exits</text>
  </svg><p className="portfolio-chart-caption">{signed(selected.value)} test AUSD <span>after {selected.trade.action.toLowerCase()} at block {selected.trade.block.toLocaleString()}</span></p></div>;
}
