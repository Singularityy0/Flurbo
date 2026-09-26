import {useEffect,useState} from 'react';
import {Link,useLocation} from 'wouter';
import {Search,ArrowUpRight} from 'lucide-react';
import {formatUnits} from 'viem';
import {useAuth} from '../auth/context';
import {pilotRequest,type PilotNamespace} from '../pilot';
import {loadMarketDirectory,marketStatus,type MarketGroup,type MarketSnapshot} from '../market-directory';
import {marketHref} from '../market-detail';
import {marketQuestion} from '../showcase-copy';
import MarketDetail from './MarketDetail';
import AccountPortfolio from './AccountPortfolio';
import './workspace.css';
import './markets.css';

const date=(seconds:number)=>new Date(seconds*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
export default function Markets(){
  const [location]=useLocation();
  const {state:auth}=useAuth();
  const [groups,setGroups]=useState<MarketGroup[]|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{const c=new AbortController();setError('');void loadMarketDirectory(c.signal).then(setGroups).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[attempt]);
  if(!groups)return <main id="main" className="markets-page"><h1>Markets</h1><p role={error?'alert':'status'}>{error||'Loading markets...'}</p>{error&&<button className="button button-dark" onClick={()=>setAttempt(x=>x+1)}>Retry</button>}</main>;
  const detail=location.match(/^\/markets\/(rehearsal|pilot|practice-[0-9a-f]{40})\/([0-3])$/);
  if(location.startsWith('/markets/')){
    if(!detail||!groups.some(g=>g.namespace===detail[1]))return <main id="main" className="markets-page"><h1>Market not found</h1><Link href="/markets">All markets</Link></main>;
    return <MarketDetail key={location} namespace={detail[1] as PilotNamespace} event={Number(detail[2])}/>;
  }
  if(location==='/portfolio')return <main id="main" tabIndex={-1} className="markets-page"><div className="market-topline"><span className="market-badge">Monad testnet / Test assets</span><Link href="/access">Your account</Link></div><header className="market-heading"><span className="eyebrow">Your Flurbo</span><h1>Your <em>portfolio.</em></h1><p>All your linked wallet positions. Results and payouts in one place.</p></header>{auth.address&&<AccountPortfolio account={auth.address} namespace="all" groups={groups}/>}</main>;
  return <MarketDirectory groups={groups}/>;
}
function MarketDirectory({groups}:{groups:MarketGroup[]}){
  const [data,setData]=useState<Record<string,MarketSnapshot>>({}),[failed,setFailed]=useState<string[]>([]),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[sort,setSort]=useState('closing'),[now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{
    const c=new AbortController(),queue=[...groups];setLoading(true);setFailed([]);
    // Two pools at a time. One unavailable pool never hides the others.
    void Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{
      while(queue.length&&!c.signal.aborted){const group=queue.shift()!;
        try{const value=await pilotRequest<MarketSnapshot>('markets',undefined,group.namespace,c.signal);if(value.manifest.pool!==group.pool)throw Error('Wrong market');if(!c.signal.aborted)setData(old=>({...old,[group.namespace]:value}));}
        catch{if(!c.signal.aborted){setData(old=>{const next={...old};delete next[group.namespace];return next;});setFailed(old=>[...old,group.namespace]);}}
      }
    })).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
  },[groups,revision]);
  const all=groups.flatMap(group=>data[group.namespace]?data[group.namespace].manifest.publication.draft.events.map((event,index)=>({group,event,index,value:data[group.namespace]})):[]);
  const rows=all.filter(r=>(filter==='All'||marketStatus(r.value,now/1000)===filter)&&marketQuestion(r.event).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{
    const rank=(v:MarketSnapshot)=>marketStatus(v,now/1000)==='Open'?0:marketStatus(v,now/1000)==='Closed'?1:2;
    const difference=rank(a.value)-rank(b.value);if(difference)return difference;
    return sort==='name'?marketQuestion(a.event).localeCompare(marketQuestion(b.event)):a.group.closesAt-b.group.closesAt;
  });
  return <main id="main" tabIndex={-1} className="markets-page">
    <div className="market-topline"><span className="market-badge">Monad testnet / Test assets</span><Link href="/fund" className="text-link">Get test funds <ArrowUpRight size={15}/></Link></div>
    <header className="market-heading"><span className="eyebrow">Individual views. Connected possibilities.</span><h1>What happens <em>next?</em></h1><p>Choose a question. Take a view. Explore how it connects.</p></header>
    <div className="market-toolbar"><label className="market-search"><Search size={18}/><span className="sr-only">Search markets</span><input placeholder="Find a market" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="button button-outline" disabled={loading} onClick={()=>setRevision(x=>x+1)}>{loading?'Updating prices...':'Refresh prices'}</button></div>
    <div className="directory-controls"><div className="directory-filters" aria-label="Market status">{['All','Open','Closed','Settled'].map(f=><button key={f} type="button" aria-pressed={f===filter} onClick={()=>setFilter(f)}>{f}</button>)}</div><label>Sort <select value={sort} onChange={e=>setSort(e.target.value)}><option value="closing">Closing soon</option><option value="name">Question name</option></select></label></div>
    {failed.length>0&&<p role="alert" className="market-error">Some markets could not be refreshed. Other markets are still available. Use Refresh prices to retry.</p>}
    <div className="directory-summary"><span>{all.length} questions{loading?' loaded so far':''}</span><span>One-share buy prices in test AUSD</span></div>
    <div className="market-grid">{rows.map(({group,event,index,value})=>{
      const status=marketStatus(value,now/1000),quotes=value.prices.find(p=>p.event===index),fresh=now/1000-value.snapshot.timestamp<60;
      const price=(atoms:string|null|undefined)=>atoms!=null&&fresh?Number(formatUnits(BigInt(atoms),6)).toFixed(3):null;
      return <article className="market-card" key={group.namespace+event.id}>
        <div className="market-card-top"><span className="directory-category">{value.manifest.publication.mode==='rehearsal'?'Practice':value.manifest.publication.mode==='ethereum-activity'?'Ethereum':'Ecosystem'}</span><span className={'market-badge status-'+status.toLowerCase()}>{status}</span></div>
        <h2><Link href={marketHref(group.namespace,index)}>{marketQuestion(event)}</Link></h2><p className="directory-context">{group.label}</p>
        <p className="directory-deadline">{status==='Open'?'Closes':'Trading closed'} <time dateTime={new Date(group.closesAt*1000).toISOString()}>{date(group.closesAt)}</time></p>
        {status==='Open'?<div className="market-choices">{[true,false].map(yes=><Link key={String(yes)} aria-label={(yes?'Yes: ':'No: ')+marketQuestion(event)} href={marketHref(group.namespace,index,yes)}><span>{yes?'Yes':'No'}</span><strong>{price(yes?quotes?.yes:quotes?.no)??'View quote'}</strong></Link>)}</div>:<p className="directory-result">{status==='Settled'?'Results available. Collect eligible payouts in Portfolio.':'Trading is unavailable. Open this market for its current resolution status.'}</p>}
        <Link className="market-detail-link" href={marketHref(group.namespace,index)}>View market <ArrowUpRight size={15}/></Link>
      </article>;
    })}</div>
    {!rows.length&&<section className="directory-empty"><h2>{loading?'Loading questions...':!all.length&&failed.length?'Markets are temporarily unavailable':filter==='Open'?'No open markets right now':'No markets to show'}</h2><p>{loading?'Questions appear as their prices are checked.':filter==='Open'?'You can view closed markets and follow existing positions in Portfolio. New opening dates have not been announced.':'Try another status or search. New questions will appear here when they are published.'}</p></section>}
    <footer className="market-footer"><span>One view. More possibilities.</span><Link href="/docs#combinations">How combined predictions work</Link></footer>
  </main>;
}
