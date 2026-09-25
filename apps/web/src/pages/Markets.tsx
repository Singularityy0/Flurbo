import {marketQuestion,showcaseCopy} from '../showcase-copy';
import AccountPortfolio from './AccountPortfolio';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Search, RefreshCw } from 'lucide-react';
import { formatUnits } from 'viem';
import { useAuth } from '../auth/context';
import { pilotRequest, readPilotPending, isPracticeNamespace, type PilotState, type PilotNamespace } from '../pilot';
import { loadPracticeCollections, type PracticeCatalog } from '../practice-collections';
import MarketDetail from './MarketDetail';
import {marketHref} from '../market-detail';
import {useTestingAccess} from '../auth/testing-access';
import WhatIf from './WhatIf';
import { readCheckout } from '../checkout';
import './workspace.css';
import './markets.css';

type Catalog={manifest:PilotState['manifest'];snapshot:PilotState['snapshot'];open:boolean;prices:{event:number;yes:string|null;no:string|null}[]};
export default function Markets(){
  const [location]=useLocation();
  const [chosen,setChosen]=useState(()=>{try{return sessionStorage.getItem('flurbo.browse.collection')||'';}catch{return '';}});
  const [collections,setCollections]=useState<PracticeCatalog|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{const abort=new AbortController();setError('');void loadPracticeCollections(abort.signal).then(setCollections).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[attempt]);
  if(!collections)return <main id="main" className="markets-page"><p role={error?'alert':'status'}>{error||'Loading market collections...'}</p>{error&&<button className="button button-dark" onClick={()=>setAttempt(value=>value+1)}>Retry</button>}</main>;
  const detail=location.match(/^\/markets\/(rehearsal|pilot|practice-[0-9a-f]{40})\/([0-3])$/);
  if(location.startsWith('/markets/')&&!detail)return <main id="main" className="markets-page"><h1>Market not found</h1><Link href="/markets">All markets</Link></main>;
  if(detail){const ns=detail[1] as PilotNamespace;if(ns!=='pilot'&&!collections.collections.some(c=>c.namespace===ns))return <main id="main" className="markets-page"><h1>Collection not found</h1><Link href="/markets">All markets</Link></main>;return <MarketDetail key={location} namespace={ns} event={Number(detail[2])}/>;}
  const namespace=collections.collections.some(row=>row.namespace===chosen)?chosen as PilotNamespace:collections.active;
  return <CollectionMarkets key={location+namespace} collections={collections} namespace={namespace} onCollectionChange={value=>{setChosen(value);try{sessionStorage.setItem('flurbo.browse.collection',value);}catch{}}}/>;
}
function CollectionMarkets({collections,namespace,onCollectionChange}:{collections:PracticeCatalog;namespace:PilotNamespace;onCollectionChange(value:string):void}){
  const {controller,state:auth}=useAuth();
  const testingAccess=useTestingAccess();
  const [location,navigate]=useLocation(),browse=location==='/markets';
  const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [query,setQuery]=useState(''),[selected,setSelected]=useState<{event:number;yes:boolean}|null>(null);
  const [clock,setClock]=useState(Date.now()),[archive,setArchive]=useState(()=>{try{const saved=sessionStorage.getItem('flurbo.trading.market');return saved&&(collections.collections.some(row=>row.namespace===saved)||['pilot','original','learning'].includes(saved))?saved:namespace;}catch{return namespace;}});
  const active=useRef(true),reading=useRef(false);
  async function refresh(){
    if(reading.current)return;reading.current=true;setLoading(true);setError('');
    try{const value=await pilotRequest<Catalog>('markets',undefined,namespace);if(active.current)setCatalog(value);}
    catch{if(active.current){setCatalog(null);setError('Markets are not available yet. Please try again shortly.');}}
    finally{reading.current=false;if(active.current)setLoading(false);}
  }
  useEffect(()=>{active.current=true;if(browse)void refresh();
    try{const draft=auth.address?readCheckout(namespace,auth.address):null,pending=readPilotPending(namespace);if(draft)setSelected({event:draft.event,yes:draft.yes});else if(pending){const scope=pending.review.requested.scope||1;setSelected({event:Number.isInteger(Math.log2(scope))?Math.log2(scope):0,yes:pending.review.requested.mask!=='1'});}}catch{setSelected({event:0,yes:true});}
    const timer=setInterval(()=>setClock(Date.now()),1000);
    return()=>{active.current=false;clearInterval(timer);};},[]);
  useEffect(()=>{if(browse)try{sessionStorage.setItem('flurbo.trading.market',namespace);}catch{}},[browse,namespace]);
  const fresh=!!catalog&&clock/1000-catalog.snapshot.timestamp<60;
  const open=!!catalog&&catalog.open&&clock/1000<catalog.manifest.publication.draft.closesAt;
  const price=(atoms:string|null)=>atoms!==null?Number(formatUnits(BigInt(atoms),6)).toFixed(3):'Unavailable';
  function choose(event:number,yes:boolean){navigate(marketHref(namespace,event,yes));}
  return <main id="main" tabIndex={-1} className="markets-page">
    <div className="market-topline"><span className="market-badge">Monad testnet / Test assets</span><details className="market-account"><summary>Your account</summary><div>
      <p>Signed in with Mera. Use MetaMask to fund your wallet and trade.</p><p className="market-address">{auth.address}</p>

      <p><Link href="/fund">Get test funds</Link></p><button className="text-link" onClick={()=>void controller.signOut()}>Sign out</button>
    </div></details></div>
    <header className="market-heading"><span className="eyebrow">{browse?'A little curiosity goes a long way':'Your Flurbo'}</span><h1>{browse?<>What happens <em>next?</em></>:<>Your <em>portfolio.</em></>}</h1><p>{browse?'Pick a question. Choose Yes or No. Put your view to the test.':'Your trades and holdings, all in one place.'}</p></header>
    {browse?<>
      <div className="market-collection-switch"><label htmlFor="browse-collection">Collection</label><select id="browse-collection" value={namespace} onChange={e=>onCollectionChange(e.target.value)}>{collections.collections.map(row=><option key={row.namespace} value={row.namespace}>{row.label}</option>)}</select><Link href="/fund" className="text-link">Get test funds <ArrowUpRight size={15}/></Link></div>
      <div className="market-toolbar"><label className="market-search"><Search size={18}/><span className="sr-only">Search markets</span><input placeholder="Find a market" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="button button-outline" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={15}/>{loading?'Updating...':'Refresh prices'}</button></div>
      <div className="market-section-title"><h2>{collections.collections.find(row=>row.namespace===namespace)?.label||'Explore markets'}</h2><span>{catalog?`${catalog.manifest.publication.draft.events.length} separate events`:'Loading this collection'}</span></div>
      <p className="market-caption">{catalog?.manifest.publication.mode==='rehearsal'?'Scripted practice events.':catalog?.manifest.publication.mode==='ethereum-activity'?'Four questions. One finalized Ethereum block.':'Published sources and clear outcome rules.'} Test assets only. Prices below are the cost of one share.</p>
      {catalog&&<section className="market-round-status" aria-label="Round availability"><p role="status"><strong>{open?'Trading open':clock/1000>=catalog.manifest.publication.draft.closesAt?'Trading closed':'Trading currently unavailable'}</strong> · Individual and combined predictions priced from one shared pool.</p><p>{open?'Browse questions, inspect combinations and choose a prediction.':'You can still browse market pages, read combination payout rules, view recorded prices where available, and open Portfolio. Check each market for settlement progress.'} Switch collections above to explore another round.</p><p>No opening date for a new practice round is announced here.</p></section>}
      {error&&<p role="alert" className="market-error">{error}</p>}
      {loading&&!catalog&&<p role="status">Loading markets and prices...</p>}
      <div className="market-grid">{catalog?.manifest.publication.draft.events.map((event,index)=>({event,index})).filter(({event})=>marketQuestion(event).toLowerCase().includes(query.toLowerCase())).map(({event,index})=>{
        const quotes=catalog.prices.find(p=>p.event===index);return <article className="market-card" key={event.id}>
          <div className="market-card-top"><span className="market-symbol" aria-hidden="true">{String.fromCharCode(65+index)}</span><span className="market-badge">{open?(catalog.manifest.publication.mode==='rehearsal'?'Practice':'Real event'):'Trading closed'}</span></div>
          <h3>{marketQuestion(event)}</h3>{showcaseCopy(event)&&<p>{showcaseCopy(event)!.description}</p>}<p>Trading closes {new Date(catalog.manifest.publication.draft.closesAt*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}.</p>
          <div className="market-choices">{[true,false].map(yes=><button key={String(yes)} disabled={!open||!fresh} aria-label={`${yes?'Yes':'No'}: ${marketQuestion(event)}`} onClick={()=>choose(index,yes)}><span>{yes?'Yes':'No'}</span><strong>{fresh?price((yes?quotes?.yes:quotes?.no)??null):'Refresh price'}{fresh&&quotes?' AUSD':''}</strong></button>)}</div>
          <button className="market-detail-link" onClick={()=>choose(index,true)}>View market <ArrowUpRight size={15}/></button>
        </article>;
      })}</div>
      {catalog&&!catalog.manifest.publication.draft.events.some(e=>marketQuestion(e).toLowerCase().includes(query.toLowerCase()))&&<p>No markets match your search.</p>}
      {catalog&&!fresh&&<p role="status" className="market-caption">Refresh prices for a current view. Your final trade is always checked again.</p>}
      {catalog&&<WhatIf key={catalog.manifest.pool} namespace={namespace} manifest={catalog.manifest}/>}
      {selected&&<p className="market-resume"><Link href={marketHref(namespace,selected.event,selected.yes)}>Continue your saved prediction →</Link></p>}
    </>:<>
      <details className="market-archive"><summary>Choose a market collection</summary><label htmlFor="market-collection">Collection</label><select id="market-collection" value={archive} onChange={e=>{setArchive(e.target.value);try{sessionStorage.setItem("flurbo.trading.market",e.target.value);}catch{}}}>{collections.collections.map(row=><option key={row.namespace} value={row.namespace}>{row.label}</option>)}<option value="pilot">Earlier real-event markets</option><option value="original">Earlier demo markets</option><option value="learning">Learning experiment</option></select></details>
      {testingAccess&&isPracticeNamespace(archive)&&<p><Link href={'/rehearsal?collection='+archive}>Settlement tools for this collection</Link></p>}
      {auth.address&&<AccountPortfolio key={auth.address+archive+location} account={auth.address} namespace={archive} history={false}/>}
    </>}
    <footer className="market-footer"><span>One pool. More possibilities.</span>{testingAccess&&<details><summary>Testing tools</summary><a href="/privacy-lab/">Privacy proof lab</a><Link href={'/rehearsal?collection='+namespace}>Settlement and combined predictions</Link><Link href="/events">Earlier real-event pool</Link><Link href="/kuru">Kuru trading</Link><Link href="/account">Research workspace</Link></details>}</footer>
  </main>;
}
