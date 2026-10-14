import { useEffect, useState } from 'react';
import { PERPL_API_URL, type PerplMarket } from '../perpl';
import { ausd } from '../perpl-portfolio';

export default function PerplProtocolHistory({markets}:{markets:PerplMarket[]}) {
  const [days,setDays]=useState(7),[data,setData]=useState<{id:number;volume:string;trades:number}[]|null>(null),[error,setError]=useState('');
  const identity=markets.map(m=>m.id).join(',');
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    async function load(){
      setError('');setData(null);
      try{
        const end=Math.floor(Date.now()/86400000)*86400000,start=end-days*86400000;
        const ids=identity.split(',').map(Number),rows:{id:number;volume:string;trades:number}[]=[];
        // Limit simultaneous requests, rather than fan out to every market.
        for(let i=0;i<ids.length;i+=4){
          rows.push(...await Promise.all(ids.slice(i,i+4).map(async id=>{
            const response=await fetch(`${PERPL_API_URL}/v1/market-data/${id}/candles/86400/${start}-${end-1}`,{signal:controller.signal,credentials:'omit'});
            if(!response.ok)throw new Error(`Volume history unavailable (${response.status}).`);
            const body=await response.json();
            if(!Array.isArray(body.d))throw new Error('Invalid volume history.');
            let volume=0n,trades=0;const seen=new Set<number>();
            for(const c of body.d){
              if(!Number.isSafeInteger(c.t)||typeof c.v!=='string'||!/^\d{1,40}$/.test(c.v)||!Number.isSafeInteger(c.n)||c.n<0)throw new Error('Invalid volume candle.');
              if(c.t<start||c.t>=end||seen.has(c.t))continue;
              seen.add(c.t);volume+=BigInt(c.v);trades+=c.n;
            }
            return {id,volume:volume.toString(),trades};
          })));
        }
        if(active)setData(rows);
      }catch(e){if(active&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Volume history unavailable.');}
    }
    void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);
    return()=>{active=false;controller.abort();clearInterval(timer);};
  },[identity,days]);
  return <section className="perpl-history" aria-label="Protocol volume history">
    <div className="perpl-chart-controls"><h3>Protocol volume history</h3><div role="group" aria-label="Protocol volume timeframe">{[1,7,30].map(n=><button key={n} aria-pressed={days===n} onClick={()=>setDays(n)}>{n} complete days</button>)}</div></div>
    <p className="perpl-data-note">UTC daily candles across listed markets; excludes today’s unfinished day. Refreshes every minute. Trade count is executions, not unique users. No all-time total is claimed.</p>
    {error?<p role="status">{error}</p>:!data?<p role="status">Loading market volume history…</p>:<>
      <div className="perpl-metric-grid"><div><small>{days}-day volume · AUSD</small><strong>{ausd(data.reduce((n,r)=>n+BigInt(r.volume),0n).toString())}</strong></div><div><small>Executions</small><strong>{data.reduce((n,r)=>n+r.trades,0).toLocaleString()}</strong></div></div>
      <div className="perpl-table-scroll"><table><thead><tr><th>Market</th><th>Volume · AUSD</th><th>Executions</th></tr></thead><tbody>{data.map(r=><tr key={r.id}><td>{markets.find(m=>m.id===r.id)?.symbol??r.id}</td><td>{ausd(r.volume)}</td><td>{r.trades.toLocaleString()}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
