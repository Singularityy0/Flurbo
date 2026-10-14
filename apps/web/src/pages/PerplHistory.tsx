import { useEffect, useRef, useState } from 'react';
import { ausd } from '../perpl-portfolio';
import { drawdown,eventKey,historyPages,mergeHistory,performance,readPerpl,type HistoryKind,type HistoryResult,type HistoryRow } from '../perpl-history';
import type { PerplContext } from '../perpl';
import { formatScaled } from '../perpl';

type Bundle=Record<HistoryKind,HistoryResult>;
type CurvePoint={t:number;v:string};
type SavedProfile={address:string;time:number;realized:string;winRate:number|null;profitFactor:number|null;drawdown:string;exits:number;complete:boolean};
const WATCH='flurbo.perpl.watch.v1';
function savedProfiles():SavedProfile[]{try{const data=JSON.parse(localStorage.getItem(WATCH)||'[]');return Array.isArray(data)?data.filter(p=>p&&/^0x[0-9a-f]{40}$/i.test(p.address)&&typeof p.realized==='string'&&Number.isSafeInteger(p.time)&&/^-?\d{1,40}$/.test(p.realized)&&(p.winRate===null||typeof p.winRate==='number'&&Number.isFinite(p.winRate))&&(p.profitFactor===null||typeof p.profitFactor==='number'&&Number.isFinite(p.profitFactor))&&typeof p.complete==='boolean').slice(0,10):[];}catch{return [];}}
function Chart({points,label}:{points:CurvePoint[];label:string}){
  const valid=points.filter(p=>Number.isSafeInteger(p.t)&&/^-?\d+$/.test(p.v)).sort((a,b)=>a.t-b.t);
  if(!valid.length)return <p>No {label.toLowerCase()} samples in this period.</p>;
  const values=valid.map(p=>Number(p.v)/1e6),low=Math.min(...values),high=Math.max(...values),range=high-low||1;
  return <><svg className="perpl-history-chart" viewBox="0 0 800 180" role="img" aria-label={label}><line x1="20" x2="780" y1="150" y2="150" stroke="#334540"/><polyline points={values.map((v,i)=>`${20+i/Math.max(1,values.length-1)*760},${150-(v-low)/range*125}`).join(' ')} fill="none" stroke="#d9f76d" strokeWidth="2"/></svg><p className="perpl-data-note">{new Date(valid[0].t).toLocaleDateString()}–{new Date(valid.at(-1)!.t).toLocaleDateString()} · {label} · AUSD</p></>;
}
export default function PerplHistory({wallet,apiKey,context}:{wallet:string|null;apiKey:{token:string;secret:Uint8Array}|null;context:PerplContext}){
  const [bundle,setBundle]=useState<Bundle|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  const [kind,setKind]=useState<'equity'|'pnl'>('equity'),[period,setPeriod]=useState('week'),[curve,setCurve]=useState<CurvePoint[]|null>(null),[curveError,setCurveError]=useState('');
  const [watch,setWatch]=useState(savedProfiles),[query,setQuery]=useState(''),[compare,setCompare]=useState<string[]>([]);
  const generation=useRef(0),moreController=useRef<AbortController|null>(null);
  const market=(id:unknown)=>context.markets.find(m=>m.id===id);
  useEffect(()=>{
    generation.current++;moreController.current?.abort();setBusy(false);setBundle(null);setError('');if(!apiKey||!wallet)return;
    const controller=new AbortController();let active=true;setBusy(true);
    void Promise.all((['fills','position-history','account-history'] as HistoryKind[]).map(async k=>[k,await historyPages(apiKey,k,controller.signal)] as const))
      .then(entries=>{if(active)setBundle(Object.fromEntries(entries) as Bundle);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'History unavailable');})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;controller.abort();moreController.current?.abort();};
  },[apiKey,wallet,attempt]);
  useEffect(()=>{
    setCurve(null);setCurveError('');if(!apiKey||!wallet)return;
    const controller=new AbortController();let active=true;
    void readPerpl(apiKey,`/v1/trading/portfolio/${kind}/${period}`,controller.signal).then(body=>{
      if(!Array.isArray(body.chart))throw new Error('Invalid portfolio curve');
      const points=body.chart.filter((p:any)=>p&&Number.isSafeInteger(p.t)&&typeof p.v==='string'&&/^-?\d+$/.test(p.v)) as CurvePoint[];
      if(active)setCurve(points);
    }).catch(e=>{if(active)setCurveError(e instanceof Error?e.message:'Curve unavailable');});
    return()=>{active=false;controller.abort();};
  },[apiKey,wallet,kind,period,attempt]);
  const metrics=bundle?performance(bundle['position-history'].rows):null;
  const complete=!!bundle&&Object.values(bundle).every(value=>value.complete);
  const dd=kind==='equity'&&curve?drawdown(curve):null;
  const results=watch.filter(p=>p.address.toLowerCase().includes(query.trim().toLowerCase()));
  const date=(row:HistoryRow)=>{const at=row.at as {t?:number}|undefined;return at?.t?new Date(at.t).toLocaleString():'Not supplied';};
  async function more(){if(!bundle||!apiKey||busy)return;const epoch=generation.current;const controller=new AbortController();moreController.current=controller;setBusy(true);setError('');try{const entries=await Promise.all(Object.entries(bundle).map(async([name,b])=>{
    if(b.complete)return[name,b];const next=await historyPages(apiKey,name as HistoryKind,controller.signal,b.next);return[name,{...next,rows:mergeHistory(b.rows,next.rows)}];
  }));if(epoch===generation.current&&!controller.signal.aborted)setBundle(Object.fromEntries(entries) as Bundle);}catch(e){if(epoch===generation.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'History unavailable');}finally{if(epoch===generation.current&&!controller.signal.aborted)setBusy(false);}}
  function save(){if(!wallet||!metrics)return;try{
    const profile:SavedProfile={address:wallet,time:Date.now(),realized:metrics.total,winRate:metrics.winRate,profitFactor:metrics.profitFactor,drawdown:dd?.amount??'',exits:metrics.exits,complete};
    const next=[profile,...watch.filter(p=>p.address.toLowerCase()!==wallet.toLowerCase())].slice(0,10);localStorage.setItem(WATCH,JSON.stringify(next));setWatch(next);
  }catch{setError('This browser could not save the wallet summary.');}}
  return <section className="perpl-history" aria-label="Perpl historical performance">
    <div className="perpl-chart-controls"><h3>History & performance</h3><button type="button" disabled={!apiKey||!wallet||busy} onClick={()=>setAttempt(n=>n+1)}>Refresh history</button></div>
    {!wallet||!apiKey?<p>Connect your Perpl key to read this wallet’s private history.</p>:<>
      {busy&&<p role="status">Loading signed Perpl history…</p>}{error&&<p role="alert">{error}</p>}
      {bundle&&<>
        <p className="perpl-data-note">{complete?'History loaded to the oldest available record.':'Partial history: more pages remain. Statistics cover loaded events only.'} Performance is per exit event, not per lifetime position; it includes reported funding and subtracts entry and closing fees.</p>
        {!complete&&<button type="button" disabled={busy} onClick={()=>void more()}>Load more history</button>}
        {metrics&&<div className="perpl-metric-grid"><div><small>Net realized exits · AUSD</small><strong>{ausd(metrics.total)}</strong></div><div><small>Exit win rate</small><strong>{metrics.winRate===null?'—':`${metrics.winRate.toFixed(1)}%`}</strong></div><div><small>Profit factor</small><strong>{metrics.noLosses?'No losses':metrics.profitFactor===null?'—':metrics.profitFactor.toFixed(2)}</strong></div><div><small>Longest win / loss streak</small><strong>{metrics.bestWin} / {metrics.bestLoss}</strong></div><div><small>Average exit hold time</small><strong>{metrics.holdMs===null?'—':`${(metrics.holdMs/3600000).toFixed(1)}h`}</strong></div><div><small>Best / worst market</small><strong>{market(metrics.bestMarket)?.symbol??'—'} / {market(metrics.worstMarket)?.symbol??'—'}</strong></div></div>}
        <h3>Historical fills</h3><div className="perpl-table-scroll"><table><thead><tr><th>Time</th><th>Market</th><th>Action</th><th>Size</th><th>Price</th><th>Fee · AUSD</th></tr></thead><tbody>{bundle.fills.rows.map(row=>{const m=market(row.mkt);return <tr key={eventKey(row)}><td>{date(row)}</td><td>{m?.symbol??String(row.mkt)}</td><td>{Number(row.t)===1?'Open long':Number(row.t)===2?'Open short':Number(row.t)===3?'Close long':Number(row.t)===4?'Close short':String(row.t)}</td><td>{m&&typeof row.s==='number'?formatScaled(row.s,m.sizeDecimals):'—'}</td><td>{m&&typeof row.p==='number'?formatScaled(row.p,m.priceDecimals):'—'}</td><td>{typeof row.f==='string'?ausd(row.f):'—'}</td></tr>;})}</tbody></table></div>
        <h3>Deposits, withdrawals & liquidation events</h3><div className="perpl-table-scroll"><table><thead><tr><th>Time</th><th>Account</th><th>Event</th><th>Amount · AUSD</th><th>Balance · AUSD</th></tr></thead><tbody>{bundle['account-history'].rows.filter(row=>[1,2,5].includes(Number(row.et))).map(row=><tr key={eventKey(row)}><td>{date(row)}</td><td>{String(row.id)}</td><td>{row.et===1?'Deposit':row.et===2?'Withdrawal':'Liquidation'}</td><td>{typeof row.a==='string'?ausd(row.a):'—'}</td><td>{typeof row.b==='string'?ausd(row.b):'—'}</td></tr>)}</tbody></table></div>
      </>}
      <div className="perpl-chart-controls"><label>Portfolio chart <select value={kind} onChange={e=>setKind(e.target.value as 'equity'|'pnl')}><option value="equity">Equity</option><option value="pnl">PnL</option></select></label><div role="group" aria-label="Portfolio timeframe">{[['day','24h'],['week','7d'],['month','30d'],['all','All time']].map(([value,label])=><button key={value} type="button" aria-pressed={period===value} onClick={()=>setPeriod(value)}>{label}</button>)}</div></div>
      {curveError?<p role="status">{curveError}</p>:curve?<Chart points={curve} label={kind==='equity'?'Equity curve':'PnL curve'}/>:<p>Loading portfolio curve…</p>}
      {dd&&<p>Maximum sampled equity drawdown: {ausd(dd.amount)} AUSD ({dd.percent.toFixed(2)}%) in this period. Deposits and withdrawals can affect this equity measure.</p>}
      <button type="button" disabled={!metrics} onClick={save}>Save wallet summary</button>
    </>}
    <h3>Watch & compare saved wallets</h3><p className="perpl-data-note">Saved summaries stay on this device and include no API keys. They are snapshots, not live public profiles. Connect each wallet with its own key before saving it.</p>
    <label>Search saved wallet addresses<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="0x…" spellCheck={false}/></label>
    <div>{results.map(profile=><label className="perpl-watch-row" key={profile.address}><input type="checkbox" checked={compare.includes(profile.address)} onChange={()=>setCompare(old=>old.includes(profile.address)?old.filter(a=>a!==profile.address):[...old,profile.address].slice(-3))}/><span>{profile.address}</span><small>{new Date(profile.time).toLocaleString()}</small></label>)}</div>
    {compare.length>0&&<div className="perpl-table-scroll"><table><thead><tr><th>Wallet</th><th>Saved</th><th>Realized exits · AUSD</th><th>Win rate</th><th>Profit factor</th><th>Coverage</th></tr></thead><tbody>{watch.filter(p=>compare.includes(p.address)).map(p=><tr key={p.address}><td>{p.address.slice(0,8)}…{p.address.slice(-4)}</td><td>{new Date(p.time).toLocaleString()}</td><td>{ausd(p.realized)}</td><td>{p.winRate===null?'—':`${p.winRate.toFixed(1)}%`}</td><td>{p.profitFactor===null?'—':p.profitFactor.toFixed(2)}</td><td>{p.complete?'Complete available history':'Partial'}</td></tr>)}</tbody></table></div>}
  </section>;
}
