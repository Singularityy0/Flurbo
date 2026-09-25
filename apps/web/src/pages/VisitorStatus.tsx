import {useEffect, useState} from 'react';
import {Link} from 'wouter';
import {appFetch} from '../platform-fetch';

// Public hosting metadata contains a schedule, not live resolver state.
// Never infer that settlement has started or completed from a deadline alone.
export default function VisitorStatus(){
  const [closesAt,setClosesAt]=useState<number|null>(null);
  const [loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    const abort=new AbortController();setLoading(true);setClosesAt(null);
    void (async()=>{
      try{
        const response=await appFetch('/healthz',{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(10_000)])});
        if(!response.ok)throw Error('Unavailable');
        const data=await response.json();
        const catalog=data?.practice_collections;
        const round=catalog?.configured?.find((row:{namespace:string})=>row.namespace===catalog.active);
        if(data.service!=='flurbo'||!Number.isSafeInteger(round?.closesAt)||round.closesAt<=0)throw Error('Unavailable');
        if(!abort.signal.aborted)setClosesAt(round.closesAt);
      }catch{/* Keep navigation available even when the schedule cannot be read. */}
      finally{if(!abort.signal.aborted)setLoading(false);}
    })();
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return()=>{abort.abort();clearInterval(timer);};
  },[attempt]);
  const closed=closesAt!==null&&now>=closesAt*1000;
  return <section className="home-visitor-status" aria-label="Preview availability">
    <span className="eyebrow">Monad testnet preview · Test assets only</span>
    <p role="status"><strong>{loading?'Checking the current round…':closesAt===null?'Round status temporarily unavailable':closed?'Current round: trading closed':'Current round: trading window open'}</strong></p>
    {closesAt!==null&&<p>Trading {closed?'closed':'closes'} <time dateTime={new Date(closesAt*1000).toISOString()}>{new Date(closesAt*1000).toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}</time>. Check market pages for settlement progress and current availability.</p>}
    <p>Sign in with a passkey to browse markets and combinations, and view your portfolio and history. {closed?'Buying is closed for this round. You can view recorded prices where available or choose another collection.':'View current prices and confirm trades with MetaMask while a market is open.'}</p>
    <p className="home-muted">No opening date for a new practice round is announced here.</p>
    <div className="home-status-actions"><Link href="/markets" className="text-link">Browse markets ↗</Link><Link href="/portfolio" className="text-link">Portfolio</Link><Link href="/history" className="text-link">History</Link><button type="button" className="text-link" disabled={loading} onClick={()=>setAttempt(value=>value+1)}>Refresh status</button></div>
  </section>;
}
