import { useEffect, useState } from 'react';
import { PERPL_API_URL, type PerplMarket } from '../perpl';

type Candle={t:number;c:number;v:string};
export default function PerplMarketChart({markets}:{markets:PerplMarket[]}) {
  const [id,setId]=useState(markets[0]?.id??0);
  const [days,setDays]=useState(1);
  const [candles,setCandles]=useState<Candle[]|null>(null);
  const [error,setError]=useState('');
  const selected=markets.find(m=>m.id===id);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    setCandles(null);setError('');
    const load=async()=>{
      const to=Date.now(),from=to-days*86_400_000,resolution=days===30?86400:3600;
      try {
        const response=await fetch(`${PERPL_API_URL}/v1/market-data/${id}/candles/${resolution}/${from}-${to}`,{signal:controller.signal});
        if(!response.ok)throw new Error(`Chart unavailable (${response.status})`);
        const body=await response.json();
        if(!Array.isArray(body.d))throw new Error('Invalid candle response');
        const rows=body.d.filter((c:any)=>Number.isSafeInteger(c?.t)&&Number.isSafeInteger(c?.c)&&c.c>=0&&typeof c.v==='string'&&/^\d+$/.test(c.v)).sort((a:Candle,b:Candle)=>a.t-b.t);
        if(active){setCandles(rows);setError('');}
      }catch {if(active)setError('Perpl chart data is unavailable. Market figures below are separate.');}
    };
    void load();const timer=setInterval(()=>void load(),60_000);
    return()=>{active=false;controller.abort();clearInterval(timer);};
  },[id,days]);
  const prices=candles?.map(c=>c.c)??[],low=Math.min(...prices),high=Math.max(...prices),range=high-low||1;
  const points=candles?.map((c,i)=>`${20+i/Math.max(1,candles.length-1)*760},${150-(c.c-low)/range*125}`).join(' ');
  return <section className="perpl-chart" aria-label="Perpl market history">
    <div className="perpl-chart-controls"><label>Market <select value={id} onChange={e=>setId(Number(e.target.value))}>{markets.map(m=><option value={m.id} key={m.id}>{m.symbol}</option>)}</select></label><div role="group" aria-label="Chart timeframe">{[1,7,30].map(d=><button key={d} type="button" aria-pressed={days===d} onClick={()=>setDays(d)}>{d===1?'24h':`${d}d`}</button>)}</div></div>
    {error?<p role="status">{error}</p>:candles===null?<p role="status">Loading market history…</p>:!candles.length?<p>No candles for this market in the selected period.</p>:<>
      <svg viewBox="0 0 800 180" role="img" aria-label={`${selected?.symbol} closing prices over ${days} days`}><line x1="20" x2="780" y1="150" y2="150" stroke="#334540"/><polyline points={points} fill="none" stroke="#d9f76d" strokeWidth="2" vectorEffect="non-scaling-stroke"/>{candles.length===1&&<circle cx="20" cy="150" r="3" fill="#d9f76d"/>}</svg>
      <p className="perpl-data-note">Candle close prices · {days===30?'Daily':'Hourly'} · {candles.length} samples · refreshes every minute. {selected?`Range ${(low/10**selected.priceDecimals).toLocaleString()}–${(high/10**selected.priceDecimals).toLocaleString()} USD.`:''}</p>
    </>}
  </section>;
}
