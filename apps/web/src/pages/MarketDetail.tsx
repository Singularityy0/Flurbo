import {useEffect,useState,useCallback} from 'react';
import {Link} from 'wouter';
import {formatUnits} from 'viem';
import {useAuth} from '../auth/context';
import {pilotRequest,type PilotNamespace,type PilotState} from '../pilot';
import {rememberedTradingWallet} from '../portfolio';
import {settlementView} from '../market-detail';
import Pilot from './Pilot';
import WhatIf from './WhatIf';
import PriceHistory from './PriceHistory';
import './market-detail.css';
const date=(v:number)=>new Date(v*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const cash=(v:string)=>formatUnits(BigInt(v),6);
export default function MarketDetail({namespace,event}:{namespace:PilotNamespace;event:number}){
  const {state:auth}=useAuth(),[state,setState]=useState<PilotState|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const [busy,setBusy]=useState(false),[positions,setPositions]=useState<{mask:string;quantity:string;payoutAtoms:string|null}[]|null>(null);
  const [positionError,setPositionError]=useState('');
  const [quotes,setQuotes]=useState<{yes:string|null;no:string|null}|null>(null);
  const [owner,setOwner]=useState(()=>auth.address?rememberedTradingWallet(auth.address):'');
  const walletChanged=useCallback((address:string)=>setOwner(address),[]);
  const [initialYes]=useState(()=>new URLSearchParams(window.location.search).get('answer')!=='no');
  const confirmed=useCallback(()=>setAttempt(n=>n+1),[]);
  useEffect(()=>{const c=new AbortController();setError('');void pilotRequest<PilotState>('status',undefined,namespace,c.signal).then(s=>{if(!c.signal.aborted)setState(s);}).catch(()=>{if(!c.signal.aborted)setError('Market status could not be refreshed. Retry for a current view.');});return()=>c.abort();},[namespace,attempt]);
  useEffect(()=>{const c=new AbortController();setQuotes(null);void pilotRequest<{prices:{event:number;yes:string|null;no:string|null}[]}>('markets',undefined,namespace,c.signal).then(v=>{if(!c.signal.aborted)setQuotes(v.prices.find(p=>p.event===event)||null);}).catch(()=>{});return()=>c.abort();},[namespace,event,attempt]);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden&&!busy)setAttempt(n=>n+1);},60000);return()=>clearInterval(timer);},[busy]);
  useEffect(()=>{try{sessionStorage.setItem('flurbo.trading.market',namespace);}catch{}},[namespace]);
  useEffect(()=>{const c=new AbortController();setPositions(null);setPositionError('');if(owner)void pilotRequest<{rows:NonNullable<typeof positions>}>('positions',{owner,claims:[{scope:2**event,mask:'2'},{scope:2**event,mask:'1'}]},namespace,c.signal).then(v=>{if(!c.signal.aborted)setPositions(v.rows);}).catch(()=>{if(!c.signal.aborted)setPositionError('Your shares could not be loaded. This does not mean your balance is zero.');});return()=>c.abort();},[namespace,event,owner,attempt]);
  const question=state?.manifest.publication.draft.events[event],view=state&&question?settlementView(state,event):null;
  return <main id="main" tabIndex={-1} className="markets-page market-detail">
    <Link href="/markets" className="text-link">← All markets</Link>
    {error&&<p role="alert">{error}</p>}
    {!state&&!error&&<p role="status">Loading this market...</p>}
    {state&&!question&&<h1>Market not found</h1>}
    {question&&view&&state&&<>
      <header className="detail-heading"><div><span className="market-badge">{namespace==='pilot'?'Monad testnet':'Practice · Monad testnet'}</span><h1>{question.question}</h1><p>One question. Part of a shared market.</p></div><span className="detail-status">{error?'Status unavailable':view.title}</span></header>
      <div className="detail-columns"><div className="detail-primary">
        <section className="detail-panel detail-trade" aria-label="Trade this market"><span className="eyebrow">Make your prediction</span>{quotes&&<><div className="detail-holdings"><div><span>Yes</span><strong>{quotes.yes===null?'Closed':cash(quotes.yes)+' AUSD'}</strong></div><div><span>No</span><strong>{quotes.no===null?'Closed':cash(quotes.no)+' AUSD'}</strong></div></div><p className="market-caption">Cost of one share at the last refresh. Your final price is checked before buying.</p></>}<Pilot key={namespace+event} namespace={namespace} consumer={{event,yes:initialYes}} onBusy={setBusy} onTradeConfirmed={confirmed} onTradingWalletChange={walletChanged}/></section>
        <section className="detail-panel" aria-label="Your position"><div className="detail-section-heading"><h2>Your position</h2><Link href="/portfolio">Full portfolio ↗</Link></div><p>Your MetaMask positions</p>{owner&&<p className="market-caption">{owner.slice(0,8)}…{owner.slice(-6)}</p>}
          {positionError?<p role="alert">{positionError}</p>:positions?<div className="detail-holdings">{positions.map(p=><div key={p.mask}><span>{p.mask==='2'?'Yes':'No'}</span><strong>{cash(p.quantity)} shares</strong><small>{p.payoutAtoms===null?'Awaiting settlement':`${cash(p.payoutAtoms)} test AUSD to collect`}</small></div>)}</div>:<p role="status">{owner?'Loading your shares...':'Connect MetaMask above to see your shares.'}</p>}
          <p className="market-caption">This shows individual shares. Combined predictions appear in your portfolio. Wallets hold separate balances.</p>
        </section>
        <PriceHistory namespace={namespace} event={event} pool={state.manifest.pool} refresh={attempt}/>
        <details className="detail-panel"><summary>Explore how these markets connect</summary><WhatIf namespace={namespace} manifest={state.manifest}/></details>
      </div><aside className="detail-sidebar">
        <section className="detail-panel detail-settlement" aria-label="Settlement timeline"><span className="eyebrow">From prediction to payout</span><h2>{view.title}</h2><p>{view.description}</p><dl><dt>Trading closes</dt><dd>{date(view.closes)}</dd><dt>Event observation ends</dt><dd>{date(view.observes)}</dd>
          {state.cases[event].phase===1?<><dt>Challenge period ends</dt><dd>{date(view.deadline)}</dd></>:state.cases[event].phase===2?<><dt>Dispute deadline</dt><dd>{date(view.deadline)}</dd></>:state.cases[event].phase===3?<><dt>Final answer</dt><dd>{view.result}</dd></>:<><dt>Results expected from</dt><dd>{date(view.expectedFrom)}</dd></>}</dl>
          <p className="market-caption">Last checked {date(state.snapshot.timestamp)}.</p><p className="market-caption">Timing is an estimate, not a guarantee. Challenges, missing evidence or network delays can extend settlement. The whole collection must resolve before payouts are available.</p><button className="button button-outline" onClick={()=>setAttempt(n=>n+1)}>Refresh status</button>
        </section>
        <section className="detail-panel"><h2>What decides the answer?</h2><p>{namespace==='pilot'?'The published source and the rules below determine the answer.':'This is a practice event with a scripted outcome, using test funds.'}</p><a href={question.source.referenceUrl} target="_blank" rel="noreferrer">View source ↗</a><details><summary>Read the resolution rules</summary><h3>Yes</h3><p>{question.yesRule}</p><h3>No</h3><p>{question.noRule}</p><h3>If there is no clear result</h3><p>{state.manifest.publication.draft.exceptionPolicy}</p><p>{state.manifest.publication.draft.disputePolicy}</p><p>The current testnet dispute wallets are controlled by the Flurbo operator.</p></details></section>
        <section className="detail-panel"><h2>Shared pool</h2><dl><dt>Pool balance</dt><dd>{cash(state.poolCash)} test AUSD</dd><dt>Required payouts</dt><dd>{cash(state.requiredCollateral)} test AUSD</dd></dl><p className="market-caption">These totals cover the collection, not just this question.</p><a href={`https://testnet.monadscan.com/address/${state.manifest.pool}`} target="_blank" rel="noreferrer">View pool ↗</a></section>
      </aside></div>
    </>}
    {!state&&error&&<button className="button button-dark" onClick={()=>setAttempt(n=>n+1)}>Retry</button>}
    <footer className="market-footer"><span>One pool. More possibilities.</span><Link href="/history">Your history ↗</Link></footer>
  </main>;
}
