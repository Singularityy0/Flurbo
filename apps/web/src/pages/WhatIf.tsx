import { useEffect, useRef, useState } from 'react';
import { pilotRequest, type PilotState, type PilotNamespace } from '../pilot';
import './what-if.css';

type Metric='a'|'b'|'joint'|'givenYes'|'givenNo'|'independent'|'difference';
type Analysis={schema:string;model:string;chainId:number;pool:string;rulesHash:string;a:number;b:number;unit:string;
  snapshot:PilotState['snapshot'];expiresAt:number;stateDigest:string;closed:boolean;
  values:Record<Metric,number|null>;reasons:Partial<Record<Metric,string>>};
const metrics:Metric[]=['a','b','joint','givenYes','givenNo','independent','difference'];

export default function WhatIf({manifest,namespace='rehearsal'}:{manifest:PilotState['manifest'];namespace?:PilotNamespace}){
  const events=manifest.publication.draft.events;
  const [a,setA]=useState(0),[b,setB]=useState(1),[result,setResult]=useState<Analysis|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(Date.now());
  const request=useRef<AbortController|null>(null);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>{clearInterval(timer);request.current?.abort();};},[]);
  function cancel(){request.current?.abort();request.current=null;setBusy(false);setResult(null);setError('');}
  function select(which:'a'|'b',value:number){cancel();if(which==='a'){setA(value);if(value===b)setB(a);}else{setB(value);if(value===a)setA(b);}}
  async function compare(){
    cancel();const controller=new AbortController();request.current=controller;setBusy(true);
    try{
      const data=await pilotRequest<Analysis>('analytics',{a,b},namespace,controller.signal);
      if(controller.signal.aborted)return;
      if(data.schema!=='flurbo.pair-analytics.v1'||data.model!=='factored-lmsr-pair-v1'||data.chainId!==10143||data.pool!==manifest.pool||data.rulesHash!==manifest.rulesHash
        ||data.a!==a||data.b!==b||data.unit!=='tenths_of_percentage_point'||!Number.isSafeInteger(data.expiresAt)||data.expiresAt!==data.snapshot?.timestamp+60
        ||!/^0x[0-9a-f]{64}$/.test(data.snapshot.blockHash)||!/^\d+$/.test(data.snapshot.blockNumber)||! /^[0-9a-f]{64}$/.test(data.stateDigest)
        ||!data.values||!data.reasons||metrics.some(key=>data.values[key]!==null&&(!Number.isInteger(data.values[key])||data.values[key]!< (key==='difference'?-1000:0)||data.values[key]!>1000)))throw new Error('Invalid comparison');
      setResult(data);setClock(Date.now());
    }catch{if(!controller.signal.aborted)setError('The comparison could not load. You can try again or keep exploring markets.');}
    finally{if(request.current===controller){request.current=null;setBusy(false);}}
  }
  const fresh=result&&clock/1000<result.expiresAt&&clock/1000>=result.snapshot.timestamp-15;
  function value(key:Metric){const v=result?.values[key];return v===null||v===undefined?'Unavailable':`${(v/10).toFixed(1)}${key==='difference'?' pp':'%'}`;}
  function missing(key:Metric){return result?.values[key]===null?<small>{result.reasons[key]==='rare_condition'?'This condition is too rare to display reliably.':'Precision is insufficient at this snapshot.'}</small>:null;}
  return <section className="what-if" aria-labelledby="what-if-heading">
    <header className="what-if-heading"><div><span className="eyebrow">See the connection</span><h2 id="what-if-heading">What <em>if?</em></h2></div><span className="market-badge">Read-only exploration</span></header>
    <p>How does one answer change the market-implied chance of another? Choose two questions to explore them together.</p>
    <div className="what-if-controls">
      <label><span id="what-if-a-label">Question to explore</span><select aria-labelledby="what-if-a-label" value={a} onChange={e=>select('a',Number(e.target.value))}>{events.map((event,i)=><option key={event.id} value={i}>{event.question}</option>)}</select></label>
      <label><span id="what-if-b-label">Suppose this question resolves</span><select aria-labelledby="what-if-b-label" value={b} onChange={e=>select('b',Number(e.target.value))}>{events.map((event,i)=><option key={event.id} value={i}>{event.question}</option>)}</select></label>
    </div>
    <div className="what-if-actions"><button className="button button-dark" disabled={busy} onClick={()=>void compare()}>{busy?'Reading the shared pool...':result?'Refresh comparison':'Compare these questions'}</button>{busy&&<button className="button button-outline" onClick={cancel}>Cancel</button>}</div>
    {busy&&<p role="status">Reading one market snapshot. You can change either question while this loads.</p>}
    {error&&<p role="alert" className="market-error">{error}</p>}
    {result&&!fresh&&<p role="status">This snapshot is over a minute old or its time could not be verified. Refresh the comparison to see current values.</p>}
    {fresh&&<div className="what-if-results">
      <h3>Chance of Yes: {events[a].question}</h3>
      <div className="what-if-probabilities">
        {(['a','givenYes','givenNo'] as Metric[]).map((key,i)=><div key={key}><span>{['Without an assumption','If the second answer is Yes','If the second answer is No'][i]}</span><strong>{value(key)}</strong>{missing(key)}</div>)}
      </div>
      <p className="market-caption">Second question: {events[b].question} Its market-implied Yes chance is {value('b')}. {missing('b')}</p>
      <div className="what-if-comparison"><h3>Both Yes, together</h3><p>Compare the shared market with a baseline that assumes these answers are independent.</p>
        {(['joint','independent'] as Metric[]).map((key,i)=><div className="what-if-bar-row" key={key}><span>{i?'If independent':'Shared market'}</span><strong>{value(key)}</strong><div className={'what-if-bar '+(i?'baseline':'')} aria-hidden="true"><span style={{width:`${(result.values[key]??0)/10}%`}}/></div>{missing(key)}</div>)}
        <p className="what-if-gap">Difference: <strong>{result.values.difference!==null&&result.values.difference>0?'+':''}{value('difference')}</strong> <span>(percentage points)</span>{missing('difference')}</p>
      </div>
      <p className="market-caption">{result.closed?'Trading is closed. These are the pool’s stored pricing weights, not settled outcomes. ':''}Snapshot at block {result.snapshot.blockNumber}, {new Date(result.snapshot.timestamp*1000).toLocaleTimeString()}. All values above use this same snapshot.</p>
      <details className="what-if-evidence"><summary>How to read this</summary><p>These are probabilities implied by the pool’s pricing model, not the cost of buying a share. A trade’s size changes its price. The independence baseline multiplies the two individual Yes probabilities; it is not an executable quote.</p><p>Conditioning means assuming an answer is known. It does not show that one event causes another, predict an outside intervention, or guarantee accurate outcomes. This panel creates no position and cannot trade a conditional prediction.</p><p>Values round to 0.1 percentage point. Differences are calculated before rounding. A conditional is withheld when its condition has probability below one in a billion. Values are also withheld when numerical bounds cannot establish the displayed rounding.</p><p className="what-if-identifier">Pool: {result.pool}<br/>Block hash: {result.snapshot.blockHash}<br/>Snapshot digest: {result.stateDigest}<br/>Model: {result.model}</p></details>
    </div>}
    <p className="market-caption">Practice outcomes are scripted. The model reflects the pool’s state, not independent evidence about these events.</p>
  </section>;
}
