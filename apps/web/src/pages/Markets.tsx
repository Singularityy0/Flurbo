import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,useLocation,useSearch} from 'wouter';
import {Inbox} from 'lucide-react';
import {useAuth} from '../auth/context';
import {pilotRequest,type PilotNamespace} from '../pilot';
import {loadMarketDirectory,type MarketGroup,type MarketSnapshot} from '../market-directory';
import MarketDetail from './MarketDetail';
import ThesisExplorer from './ThesisExplorer';
import CollectionKuru from './CollectionKuru';
import AccountPortfolio from './AccountPortfolio';
import PageHeader from '../components/PageHeader';
import MarketBoard from '../components/market/MarketBoard';
import {useLoadGate} from '../loading/gates';
import {buildBoardRows,rowFromSnapshot,toSnapshotRow} from '../market-board-rows';
import {readBoardQuery,writeBoardQuery,type BoardQuery} from '../market-categories';
import {directoryHash,readBoardSnapshot,writeBoardSnapshot,type BoardSnapshot} from '../board-cache';
import {priceDelta,readSeen,writeSeen,SEEN_MIN_AGE_MS,type SeenPrices} from '../price-memory';
import {readWatchlist,toggleWatchlist} from '../watchlist';
import './workspace.css';
import './markets.css';

export const BOARD_URL_KEY='flurbo.board-url';

export default function Markets(){
  const [location]=useLocation();
  const {state:auth}=useAuth();
  const [groups,setGroups]=useState<MarketGroup[]|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  // A returning member sees their last board at once; it refreshes in place when the directory and prices arrive.
  const [snapshot]=useState<BoardSnapshot|null>(()=>location==='/markets'&&auth.address?readBoardSnapshot(auth.address):null);
  const usableSnapshot=location==='/markets'&&!!snapshot?.rows.length;
  useEffect(()=>{const c=new AbortController();setError('');void loadMarketDirectory(c.signal).then(setGroups).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[attempt]);
  const gate=useLoadGate('directory',{pending:!groups&&!error&&!usableSnapshot,label:'Loading markets'});
  if(!groups&&usableSnapshot&&!error)return <MarketDirectory groups={null} snapshot={snapshot}/>;
  if(!groups)return <main id="main" tabIndex={-1} className="page markets-page" aria-busy={!error}>
    <PageHeader title={location==='/portfolio'?<>Your portfolio.</>:'What happens next?'} lead={location==='/portfolio'?'All your linked wallet positions. Results and payouts in one place.':'Choose a question. Take a view. Explore how it connects.'}/>
    {error?<div className="state-block" role="alert"><h2>Markets could not load</h2><p>{error}</p><button className="btn btn-primary" onClick={()=>setAttempt(x=>x+1)}>Retry</button></div>
      :<>{!gate.covered&&<span className="progress-line" aria-hidden="true"/>}<p role="status" className={gate.covered?'sr-only':'busy-text'}>Loading markets...</p><MarketSkeleton/></>}
  </main>;
  const detail=location.match(/^\/markets\/(pilot|practice-[0-9a-f]{40})\/([0-3])(?:\/(thesis|kuru))?$/);
  if(location.startsWith('/markets/')){
    if(!detail||!groups.some(g=>g.namespace===detail[1]))return <main id="main" tabIndex={-1} className="page page-task"><div className="state-block"><Inbox aria-hidden="true" strokeWidth={1.75}/><h1>Market not found</h1><p>This market is not in the current directory. It may belong to an earlier collection that is no longer listed.</p><Link href="/markets" className="btn btn-primary">All markets</Link></div></main>;
    return detail[3]==='thesis'?<ThesisExplorer key={location} namespace={detail[1] as PilotNamespace} event={Number(detail[2])}/>
      :detail[3]==='kuru'?<CollectionKuru key={location} namespace={detail[1] as PilotNamespace} event={Number(detail[2])}/>
      :<MarketDetail key={location} namespace={detail[1] as PilotNamespace} event={Number(detail[2])}/>;
  }
  if(location==='/portfolio')return <main id="main" tabIndex={-1} className="page markets-page portfolio-page">
    <PageHeader title="Your portfolio." lead="All your linked wallet positions. Results and payouts in one place."/>
    {auth.address&&<AccountPortfolio account={auth.address} namespace="all" groups={groups}/>}
  </main>;
  return <MarketDirectory groups={groups} snapshot={snapshot}/>;
}

function MarketSkeleton({rows=5}:{rows?:number}){
  return <div className="market-list market-list-skeleton" aria-hidden="true">{Array.from({length:rows},(_,i)=><div className="market-row-skeleton" key={i}><span className="skeleton skeleton-line" style={{width:`${62-(i%3)*9}%`}}/><span className="skeleton skeleton-line" style={{width:'18%'}}/><span className="skeleton" style={{height:36}}/><span className="skeleton" style={{height:36}}/></div>)}</div>;
}

const NO_GROUPS:MarketGroup[]=[];

function MarketDirectory({groups:loaded,snapshot}:{groups:MarketGroup[]|null;snapshot:BoardSnapshot|null}){
  const {state:auth}=useAuth();
  const account=auth.address??'';
  const groups=loaded??NO_GROUPS;
  const [data,setData]=useState<Record<string,MarketSnapshot>>({}),[failed,setFailed]=useState<string[]>([]),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  const [now,setNow]=useState(Date.now());
  const [firstAt,setFirstAt]=useState<number|null>(null),[updatedAt,setUpdatedAt]=useState<number|null>(null);
  const [query,setQuery]=useState<BoardQuery>(()=>readBoardQuery(window.location.search));
  const queryRef=useRef(query);queryRef.current=query;
  const validSnapshot=snapshot&&(!loaded||directoryHash(loaded)===snapshot.directoryHash)?snapshot:null;
  const [stableOrder,setStableOrder]=useState<string[]|null>(()=>validSnapshot?validSnapshot.rows.map(r=>r.key):null);
  const [watchlist,setWatchlist]=useState<Set<string>|null>(()=>account?readWatchlist(account):null);
  const [seen]=useState<SeenPrices|null>(()=>{const value=account?readSeen(account):null;return value&&Date.now()-value.savedAt>=SEEN_MIN_AGE_MS?value.prices:null;});
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden&&!loading)setRevision(n=>n+1);},45000);return()=>clearInterval(timer);},[loading]);
  useEffect(()=>{
    if(!loaded)return;
    const c=new AbortController(),queue=[...loaded];setLoading(true);setFailed([]);
    // Two pools at a time. One unavailable pool never hides the others.
    void Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{
      while(queue.length&&!c.signal.aborted){const group=queue.shift()!;
        try{const value=await pilotRequest<MarketSnapshot>('markets',undefined,group.namespace,c.signal);if(value.manifest.pool!==group.pool)throw Error('Wrong market');if(!c.signal.aborted){setData(old=>({...old,[group.namespace]:value}));setFirstAt(old=>old??Date.now());}}
        catch{if(!c.signal.aborted){setData(old=>{const next={...old};delete next[group.namespace];return next;});setFailed(old=>[...old,group.namespace]);}}
      }
    })).finally(()=>{if(!c.signal.aborted){setLoading(false);setUpdatedAt(Date.now());}});return()=>c.abort();
  },[loaded,revision]);
  // The first visit waits under the loader until pools settle (or three seconds after the first
  // arrives), so late pools do not reorder a list the visitor has started reading.
  useLoadGate('directory-prices',{pending:loading&&!!loaded&&!(firstAt!==null&&now-firstAt>3000)&&!validSnapshot?.rows.length,label:'Loading prices'});
  const built=useMemo(()=>buildBoardRows({groups,data,now}),[groups,data,now]);
  const rows=useMemo(()=>{
    if(!validSnapshot)return built;
    const present=new Set(built.map(r=>r.groupKey));
    return [...built,...validSnapshot.rows.filter(r=>!present.has(r.groupKey)&&!failed.includes(r.groupKey)).map(rowFromSnapshot)];
  },[built,validSnapshot,failed]);
  const deltas=useMemo(()=>{const map=new Map<string,bigint>();if(!seen)return map;for(const r of built){const d=priceDelta(seen[r.key]?.yes,r.prices?.yes);if(d)map.set(r.key,d.atoms);}return map;},[built,seen]);
  const latest=useRef(built);latest.current=built;
  // Prices seen on this visit become the baseline for the next one.
  useEffect(()=>{
    if(!account)return;
    const save=()=>{const prices:SeenPrices={};for(const r of latest.current)if(r.prices&&(r.prices.yes||r.prices.no))prices[r.key]={yes:r.prices.yes,no:r.prices.no};if(Object.keys(prices).length)writeSeen(account,prices);};
    const onHide=()=>{if(document.visibilityState==='hidden')save();};
    window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',onHide);
    return()=>{save();window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',onHide);};
  },[account]);
  useEffect(()=>{if(account&&loaded&&!loading&&built.length)writeBoardSnapshot(account,{directoryHash:directoryHash(loaded),rows:built.map(toSnapshotRow)});},[account,loaded,loading,built]);
  // Board state lives in the URL without adding history entries, so back from a market returns to this exact board.
  const search=useSearch();
  useEffect(()=>{const parsed=readBoardQuery(search);if(writeBoardQuery(parsed)!==writeBoardQuery(queryRef.current))setQuery(parsed);},[search]);
  useEffect(()=>{
    const url='/markets'+writeBoardQuery(query);
    if(window.location.pathname==='/markets'&&window.location.pathname+window.location.search!==url)history.replaceState(history.state,'',url);
    try{sessionStorage.setItem(BOARD_URL_KEY,url);}catch{}
  },[query]);
  const onQuery=useCallback((next:Partial<BoardQuery>)=>{setStableOrder(null);setQuery(old=>({...old,...next,page:next.page??1}));},[]);
  const onWatch=useCallback((key:string)=>{if(account)setWatchlist(toggleWatchlist(account,key));},[account]);
  const pendingPools=loading?groups.filter(g=>!data[g.namespace]&&!failed.includes(g.namespace)).length:0;
  const [kuruOnly,setKuruOnly]=useState(false);
  const kuruCount=useMemo(()=>rows.filter(r=>r.kuru).length,[rows]);
  const shown=useMemo(()=>kuruOnly?rows.filter(r=>r.kuru):rows,[rows,kuruOnly]);
  const toggleKuru=useCallback(()=>{setStableOrder(null);setKuruOnly(x=>!x);setQuery(old=>({...old,page:1}));},[]);
  return <MarketBoard rows={shown} kuru={{count:kuruCount,only:kuruOnly,onToggle:toggleKuru}} query={query} onQuery={onQuery} now={now/1000} watchlist={watchlist} onWatch={onWatch} deltas={deltas} stableOrder={stableOrder}
    loading={loading} failed={failed.length>0} pendingPools={pendingPools} updatedAt={updatedAt} onRefresh={()=>setRevision(x=>x+1)} unavailable={!rows.length&&failed.length>0}/>;
}
