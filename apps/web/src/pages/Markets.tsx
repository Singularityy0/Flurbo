import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Search, RefreshCw, X } from 'lucide-react';
import { formatUnits } from 'viem';
import { useAuth } from '../auth/context';
import { pilotRequest, readPilotPending, type PilotState } from '../pilot';
import Pilot from './Pilot';
import PilotLedger from './PilotLedger';
import Portfolio from './Portfolio';
import Funding from './Funding';
import { readCheckout, clearCheckout } from '../checkout';
import './workspace.css';
import './markets.css';

type Catalog={manifest:PilotState['manifest'];snapshot:PilotState['snapshot'];open:boolean;prices:{event:number;yes:string|null;no:string|null}[]};
export default function Markets(){
  const {controller,state:auth}=useAuth();
  const [location]=useLocation(),browse=location==='/markets';
  const [catalog,setCatalog]=useState<Catalog|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [query,setQuery]=useState(''),[selected,setSelected]=useState<{event:number;yes:boolean}|null>(null),[ticketBusy,setTicketBusy]=useState(false);
  const [clock,setClock]=useState(Date.now()),[archive,setArchive]=useState(()=>{try{return sessionStorage.getItem('flurbo.trading.market')||'rehearsal';}catch{return 'rehearsal';}});
  const ticket=useRef<HTMLElement>(null),active=useRef(true),reading=useRef(false);
  async function refresh(){
    if(reading.current)return;reading.current=true;setLoading(true);setError('');
    try{const value=await pilotRequest<Catalog>('markets',undefined,'rehearsal');if(active.current)setCatalog(value);}
    catch{if(active.current){setCatalog(null);setError('Practice markets are not available yet. Please try again shortly.');}}
    finally{reading.current=false;if(active.current)setLoading(false);}
  }
  useEffect(()=>{active.current=true;if(browse)void refresh();
    try{const draft=auth.address?readCheckout('rehearsal',auth.address):null,pending=readPilotPending('rehearsal');if(draft)setSelected({event:draft.event,yes:draft.yes});else if(pending){const scope=pending.review.requested.scope||1;setSelected({event:Number.isInteger(Math.log2(scope))?Math.log2(scope):0,yes:pending.review.requested.mask!=='1'});}}catch{setSelected({event:0,yes:true});}
    const timer=setInterval(()=>setClock(Date.now()),1000);
    return()=>{active.current=false;clearInterval(timer);};},[]);
  useEffect(()=>{if(browse)try{sessionStorage.setItem('flurbo.trading.market','rehearsal');}catch{}},[browse]);
  useEffect(()=>{if(selected){ticket.current?.focus({preventScroll:true});ticket.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}},[selected]);
  const fresh=!!catalog&&clock/1000-catalog.snapshot.timestamp<60;
  const open=!!catalog&&catalog.open&&clock/1000<catalog.manifest.publication.draft.closesAt;
  const price=(atoms:string|null)=>atoms!==null?Number(formatUnits(BigInt(atoms),6)).toFixed(3):'Unavailable';
  function choose(event:number,yes:boolean){if(ticketBusy)return;setSelected({event,yes});}
  return <main id="main" tabIndex={-1} className="markets-page">
    <div className="market-topline"><span className="market-badge">Practice on Monad testnet</span><details className="market-account"><summary>Your wallet</summary><div>
      <p>Signed in with your Flurbo passkey.</p><p className="market-address">{auth.address}</p>
      <button className="button button-dark" disabled={auth.busy||!!auth.signingExpiresAt} onClick={()=>void controller.authenticate('login')}>{auth.signingExpiresAt?'Wallet unlocked':'Unlock Flurbo wallet'}</button>
      <Funding/><button className="text-link" onClick={()=>void controller.signOut()}>Sign out</button>
    </div></details></div>
    <header className="market-heading"><span className="eyebrow">{browse?'A little curiosity goes a long way':'Your Flurbo'}</span><h1>{browse?<>What happens <em>next?</em></>:location==='/portfolio'?<>Your <em>portfolio.</em></>:<>Your <em>history.</em></>}</h1><p>{browse?'Pick a question. Choose Yes or No. Put your view to the test.':'Your trades and holdings, all in one place.'}</p></header>
    {browse?<>
      <div className="market-toolbar"><label className="market-search"><Search size={18}/><span className="sr-only">Search markets</span><input placeholder="Find a market" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="button button-outline" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={15}/>{loading?'Updating...':'Refresh prices'}</button></div>
      <div className="market-section-title"><h2>Explore markets</h2><span>{catalog?`${catalog.manifest.publication.draft.events.length} separate events`:'Four practice events coming online'}</span></div>
      <p className="market-caption">Practice events use scripted outcomes and test funds. No real money. Prices below are the cost of one share.</p>
      {error&&<p role="alert" className="market-error">{error}</p>}
      {loading&&!catalog&&<p role="status">Loading markets and prices...</p>}
      <div className="market-grid">{catalog?.manifest.publication.draft.events.map((event,index)=>({event,index})).filter(({event})=>event.question.toLowerCase().includes(query.toLowerCase())).map(({event,index})=>{
        const quotes=catalog.prices.find(p=>p.event===index);return <article className="market-card" key={event.id}>
          <div className="market-card-top"><span className="market-symbol" aria-hidden="true">{String.fromCharCode(65+index)}</span><span className="market-badge">{open?'Practice':'Trading closed'}</span></div>
          <h3>{event.question}</h3><p>Trading closes {new Date(catalog.manifest.publication.draft.closesAt*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}.</p>
          <div className="market-choices">{[true,false].map(yes=><button key={String(yes)} disabled={!open||!fresh||ticketBusy} aria-label={`${yes?'Yes':'No'}: ${event.question}`} onClick={()=>choose(index,yes)}><span>{yes?'Yes':'No'}</span><strong>{fresh?price((yes?quotes?.yes:quotes?.no)??null):'Refresh price'}{fresh&&quotes?' AUSD':''}</strong></button>)}</div>
          <button className="market-detail-link" disabled={ticketBusy} onClick={()=>choose(index,true)}>View market <ArrowUpRight size={15}/></button>
        </article>;
      })}</div>
      {catalog&&!catalog.manifest.publication.draft.events.some(e=>e.question.toLowerCase().includes(query.toLowerCase()))&&<p>No markets match your search.</p>}
      {catalog&&!fresh&&<p role="status" className="market-caption">Refresh prices for a current view. Your final trade is always checked again.</p>}
      {selected&&<section ref={ticket} tabIndex={-1} className="market-ticket" aria-label="Your prediction"><div className="market-ticket-bar"><span className="eyebrow">Your prediction</span><button aria-label="Close prediction" disabled={ticketBusy} onClick={()=>{if(auth.address)clearCheckout('rehearsal',auth.address);setSelected(null);}}><X size={21}/></button></div><Pilot key={selected.event+':'+selected.yes} namespace="rehearsal" onBusy={setTicketBusy} consumer={{event:selected.event,yes:selected.yes}}/></section>}
    </>:<>
      <details className="market-archive"><summary>Choose a market collection</summary><label htmlFor="market-collection">Collection</label><select id="market-collection" value={archive} onChange={e=>{setArchive(e.target.value);try{sessionStorage.setItem("flurbo.trading.market",e.target.value);}catch{}}}><option value="rehearsal">Practice markets</option><option value="pilot">Earlier real-event markets</option><option value="original">Earlier demo markets</option><option value="learning">Learning experiment</option></select></details>
      {auth.address&&(archive==='rehearsal'||archive==='pilot'?<PilotLedger key={archive+location} namespace={archive} account={auth.address} history={location==='/history'}/>:<Portfolio key={archive+location} market={archive==='learning'?'learning':'original'} account={auth.address} history={location==='/history'}/>)}
    </>}
    <footer className="market-footer"><span>One pool. More possibilities.</span><details><summary>Testing tools</summary><Link href="/rehearsal">Settlement and combined predictions</Link><Link href="/events">Earlier real-event pool</Link><Link href="/kuru">Kuru trading</Link><Link href="/account">Research workspace</Link></details></footer>
  </main>;
}
