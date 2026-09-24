import { useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits, type Hex } from 'viem';
import { useAuth } from '../auth/context';
import { describeClaim, walletKey } from '../portfolio';
import { discoverWallets, type BrowserWallet } from '../auth/wallet-choice';
import { pilotRequest as request, pilotMera, submitPilot, checkPilotPending, readPilotPending as readPending, pendingKeyFor, validatePilotReview,
  type Provider, type PilotState, type PilotInput, type PilotReview, type PilotPending, type PilotNamespace } from '../pilot';
import './portfolio.css';
import './kuru.css';
import './pilot.css';

const labels=['Not proposed','NO','YES','VOID'];
const phases=['Awaiting evidence','Challenge window','Under review','Final result'];
const date=(seconds:string|number)=>new Date(Number(seconds)*1000).toLocaleString();
const cash=(atoms:string)=>formatUnits(BigInt(atoms),6);
export default function Pilot({onBusy,namespace='pilot'}:{onBusy(value:boolean):void;namespace?:PilotNamespace}) {
  const pilotRequest=<T,>(path:string,input?:unknown)=>request<T>(path,input,namespace);
  const readPilotPending=()=>readPending(namespace),pilotPendingKey=pendingKeyFor(namespace);
  const {controller,state:auth}=useAuth();
  const [state,setState]=useState<PilotState|null>(null),[notice,setNotice]=useState('Loading the real-event pilot...');
  const [wallets,setWallets]=useState<BrowserWallet[]>([]),[choice,setChoice]=useState('mera'),[owner,setOwner]=useState('');
  const [busy,setBusy]=useState(false),[review,setReview]=useState<PilotReview|null>(null),[pending,setPending]=useState<PilotPending|null>(null);
  const [storageError,setStorageError]=useState(false),[hash,setHash]=useState('');
  const [confirmedHash,setConfirmedHash]=useState(''),[approved,setApproved]=useState<PilotInput|null>(null);
  const [event,setEvent]=useState(0),[outcome,setOutcome]=useState(2),[statement,setStatement]=useState(''),[source,setSource]=useState(''),[attachment,setAttachment]=useState('');
  const [evidence,setEvidence]=useState<{hash:string;uri:string}|null>(null);
  const [legs,setLegs]=useState<number[]>([0]),[quantity,setQuantity]=useState('1'),[side,setSide]=useState('buy');
  const [rule,setRule]=useState('AND'),[answers,setAnswers]=useState<Record<number,boolean>>({});
  const [position,setPosition]=useState<{quantity:string;payoutAtoms:string|null}|null>(null);
  const provider=useRef<Provider|null>(null), generation=useRef(0), live=useRef(true), working=useRef(false), cleanup=useRef(()=>{}), reviewRef=useRef(review);
  reviewRef.current=review;
  const scope=legs.reduce((v,i)=>v|2**i,0);
  const mask=Array.from({length:2**legs.length},(_,state)=>state).reduce((mask,state)=>{
    const matches=legs.map((event,i)=>Boolean(state&(1<<i))===(answers[event]??true));
    const wins=rule==='AND'?matches.every(Boolean):matches.some(Boolean);
    return wins?mask|(1n<<BigInt(state)):mask;
  },0n).toString();
  function save(value:PilotPending|null) {
    if(value) localStorage.setItem(pilotPendingKey,JSON.stringify(value)); else localStorage.removeItem(pilotPendingKey);
    setPending(value);
  }
  async function run(fn:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);try{await fn();}catch(e){if(live.current)setNotice(e instanceof Error?e.message:'Request failed. Check tracking before retrying.');}finally{working.current=false;if(live.current)setBusy(false);}}
  async function refresh(wallet=owner){ const version=generation.current; const result=await pilotRequest<PilotState>('status'+(wallet?'?wallet='+wallet:'')); if(live.current&&version===generation.current){setState(result);setNotice('Pilot data loaded. Connect a signing wallet to take part.');} }
  useEffect(()=>{ live.current=true; const stop=discoverWallets(wallet=>setWallets(old=>old.some(w=>w.provider===wallet.provider)?old:[...old,wallet])); void run(()=>refresh());
    try{setPending(readPilotPending());}catch(e){setStorageError(true);setNotice(String(e));}
    const sync=()=>{try{setPending(readPilotPending());}catch{setStorageError(true);}};
    window.addEventListener('storage',sync);
    return()=>{live.current=false;generation.current++;cleanup.current();stop();window.removeEventListener('storage',sync);};
  },[]);
  useEffect(()=>{onBusy(busy||!!review||!!pending||storageError);return()=>onBusy(false);},[busy,review,pending,storageError,onBusy]);
  useEffect(()=>{setEvidence(null);},[event,outcome,statement,source,attachment]);
  useEffect(()=>{setPosition(null);},[owner,scope,mask]);
  async function connect(){
    cleanup.current(); const version=++generation.current;
    const p:Provider|undefined=choice==='mera'?pilotMera(controller,namespace):wallets[Number(choice)]?.provider;
    if(!p)throw new Error('Select a wallet');
    const changed=()=>{generation.current++;setOwner('');setReview(null);provider.current=null;setNotice('Wallet changed. Reconnect. Submitted actions remain in tracking.');};
    for(const name of ['accountsChanged','chainChanged','disconnect'])p.on?.(name,changed);
    cleanup.current=()=>{for(const name of ['accountsChanged','chainChanged','disconnect'])p.removeListener?.(name,changed);};
    const accounts=await p.request({method:'eth_requestAccounts'}) as string[];
    if(!Array.isArray(accounts)||!/^0x[0-9a-f]{40}$/i.test(accounts[0]||''))throw new Error('No wallet account returned');
    await refresh(accounts[0]); if(!live.current||version!==generation.current)return;
    if(auth.address)try{sessionStorage.setItem(walletKey(auth.address),accounts[0].toLowerCase());}catch{ /* Optional read-only preference. */ }
    provider.current=p;setOwner(accounts[0].toLowerCase());setNotice('Wallet connected. Review and confirm each action separately.');
  }
  async function prepare(input:Omit<PilotInput,'owner'>){
    if(!owner||!provider.current)throw new Error('Connect your signing wallet first');
    const version=generation.current; setReview(null);
    const result=await pilotRequest<PilotReview>('prepare',{...input,owner});
    validatePilotReview(result);
    if(live.current&&version===generation.current){setReview(result);setNotice(result.notice);}
  }
  async function publishEvidence(){
    if(!state) return;
    const result=await pilotRequest<{hash:string;uri:string}>('evidence',{eventId:state.manifest.publication.draft.events[event].id,outcome,statement,sourceURL:source,attachment});
    setEvidence(result);setNotice('Public evidence saved. Review an assertion, dispute or vote below. Saving evidence does not submit an outcome.');
  }
  async function confirm(){
    if(!review||!provider.current||!auth.address||pending||storageError)return;
    if(!navigator.locks)throw new Error('Web Locks support is required for submission tracking.');
    const r=review,p=provider.current,version=generation.current,login=auth.address;
    await navigator.locks.request('flurbo-pilot-submit',{ifAvailable:true},async lock=>{
      if(!lock||readPilotPending())throw new Error('Another pilot transaction is being tracked');
      try{await submitPilot(p,r,login,save,()=>live.current&&version===generation.current&&reviewRef.current===r&&controller.getSnapshot().address===login);setNotice('Submitted. Check confirmation before another action.');}
      finally{setReview(null);}
    });
  }
  async function check(){
    const saved=readPilotPending();if(!saved)return;
    const result=await checkPilotPending(saved);
    if(JSON.stringify(readPilotPending())!==JSON.stringify(saved))throw new Error('Tracking changed in another tab');
    if(result==='confirmed'||result==='reverted'){
      save(null);setPosition(null);setConfirmedHash(saved.hash||'');
      setApproved(result==='confirmed'&&saved.review.action==='approve'?saved.review.requested:null);
      const confirmed=result==='confirmed'?(saved.review.action==='approve'?'Token approval confirmed. The approved action has not been sent. Review it below.':'Exact transaction confirmed. Balances refreshed.'):'Transaction reverted. No successful action was confirmed.';
      try{
        await refresh();
        const request=saved.review.requested;
        if(result==='confirmed'&&['buy','sell','redeem'].includes(saved.review.action)&&request.scope===scope&&request.mask===mask&&owner===request.owner.toLowerCase())
          setPosition(await pilotRequest('position',{owner,scope,mask}));
        setNotice(confirmed);
      }catch{setNotice(result==='confirmed'?'Transaction confirmed, but balances could not refresh. Use Refresh pilot; do not repeat the transaction.':'Transaction reverted. Data refresh failed; check the receipt before retrying.');}
    }
    else setNotice(result==='pending'?'Still pending. Do not submit again.':'Waiting for a second canonical confirmation.');
  }
  const disabled=busy||!!review||!!pending||storageError;
  const current=state?.cases[event];
  const operatorRun=state?.manifest.publication.reviewerControl==='single-operator';
  return <div className="portfolio-view kuru-view pilot-view">
    <section className="kuru-intro"><span className="eyebrow">{namespace==='rehearsal'?'Scripted rehearsal / Test assets':'Real events / Test assets'}</span><h2>From a question <em>to an outcome.</em></h2><p>{namespace==='rehearsal'?'A separate practice pool with scripted outcomes. These are not real-world predictions. Your real-event holdings stay in their original pool.':'One shared pool for this cluster. Official-source evidence, an open challenge period and a named testnet reviewer panel.'}</p>{namespace==='rehearsal'&&<p><a href="/rehearsal-rules" target="_blank" rel="noreferrer">Read the fixed rehearsal instructions</a>. A: YES without a challenge. B: propose YES, challenge with NO, then two reviewers vote NO. C: no assertion, then VOID at its deadline.</p>}<p role="status" className="kuru-notice">{notice}</p><button className="button button-outline" disabled={busy} onClick={()=>void run(()=>refresh())}>Refresh pilot</button></section>
    {confirmedHash&&<p><a href={`https://testnet.monadscan.com/tx/${confirmedHash}`} target="_blank" rel="noreferrer">View the last checked transaction</a></p>}
    {approved&&<section className="portfolio-wallet pilot-form"><p>Approval grants token permission. It does not complete the {approved.action}.</p><button className="button button-dark" disabled={disabled||owner!==approved.owner.toLowerCase()} onClick={()=>void run(async()=>{const {owner:_owner,...input}=approved;await prepare(input);setApproved(null);})}>Review approved {approved.action}</button><p>Connect the same trading wallet if it is not already selected.</p></section>}
    {review&&<section className="portfolio-wallet pilot-form" aria-label="Transaction review"><h2>{review.action==='approve'?'Approve token permission':review.action==='buy'?'Buy shares':review.action==='sell'?'Sell shares':'Confirm your action'}</h2>{review.requested.scope!==undefined&&<p>{describeClaim(review.requested.scope,Number(review.requested.mask))}: {cash(review.requested.quantity!)} shares.</p>}<p>{review.notice}</p><p>Wallet {review.transaction.from}</p><p>Contract {review.transaction.to}</p>{review.action==='sell'&&<p>Minimum test AUSD received: {cash(review.minimumReceivedAtoms!)}.</p>}<p>Maximum test AUSD permission or spend: {cash(review.amountAtoms)}. Maximum network fee: {formatUnits(BigInt(review.maximumFeeWei),18)} MON.</p>{review.requested.outcome&&<p>Event {(review.requested.event??0)+1}: {labels[review.requested.outcome]}. Evidence {review.requested.evidenceHash}</p>}<p>Review expires {date(review.expiresAt)}. If fees increase, a fresh review is required.</p><div className="pilot-actions"><button className="button button-dark" disabled={busy||!!pending} onClick={()=>void run(confirm)}>Confirm in wallet</button><button className="button button-outline" disabled={busy} onClick={()=>setReview(null)}>Cancel review</button></div></section>}
    {pending&&<section className="portfolio-wallet pilot-form"><h2>Follow your transaction.</h2><p>{pending.hash||'No hash returned yet. Check wallet activity before doing anything else.'}</p>{!pending.hash&&<><label>Transaction hash<input value={hash} onChange={e=>setHash(e.target.value)}/></label><button className="button button-outline" onClick={()=>void run(async()=>{if(!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error('Paste a transaction hash');save({...pending,hash:hash.toLowerCase() as Hex});})}>Attach hash</button></>}<button className="button button-dark" disabled={busy||!pending.hash} onClick={()=>void run(check)}>Check confirmation</button></section>}
    {state&&<>
      {operatorRun&&<section className="portfolio-wallet pilot-rules" aria-label="Resolution control"><h2>Operator-run testnet alpha</h2><p>All reviewer wallets are controlled by the Flurbo operator. {Math.floor(state.manifest.publication.reviewers.length/2)+1} matching votes are required, but these are not independent reviewers. The operator can determine disputed outcomes. Test assets only.</p><p>Operator: {state.manifest.publication.creator}</p></section>}
      <section className="portfolio-wallet"><div><label htmlFor="pilot-wallet">Signing wallet</label><select id="pilot-wallet" value={choice} disabled={disabled} onChange={e=>{cleanup.current();generation.current++;setChoice(e.target.value);setOwner('');provider.current=null;}}><option value="mera">Flurbo passkey (Mera)</option>{wallets.map((w,i)=><option key={i} value={i}>{w.name}</option>)}</select></div><button className="button button-dark" disabled={busy||!!review} onClick={()=>void run(connect)}>Connect wallet</button>{owner&&<p className="portfolio-address">{owner}</p>}{state.wallet&&<p>{cash(state.wallet.cash)} test AUSD available. {state.wallet.reviewer?'Registered panel reviewer.':'Assertions and challenges require a test AUSD bond.'}</p>}</section>
      <section className="portfolio-wallet pilot-rules"><h2>{state.manifest.publication.draft.title}</h2><p>Trading closes {date(state.manifest.publication.draft.closesAt)}. Pool holds {cash(state.poolCash)} test AUSD against {cash(state.requiredCollateral)} required for payouts.</p><details><summary>Read the rules and panel</summary><p>{state.manifest.publication.draft.exceptionPolicy}</p><p>{state.manifest.publication.draft.disputePolicy}</p><p>Pool {state.manifest.pool}</p><p>Resolver {state.manifest.resolver}</p><p>{operatorRun?'One operator controls these reviewer wallets.':'The named reviewer panel is explicitly trusted.'} Test bonds and account creation do not provide decentralized security.</p></details></section>
      <div className="pilot-events">{state.manifest.publication.draft.events.map((e,i)=><article key={e.id} className="portfolio-wallet"><span className="eyebrow">Event {i+1} / {phases[state.cases[i].phase]}</span><h3>{e.question}</h3><p>Observation ends {date(e.observationEndsAt)}.</p><p>{state.cases[i].phase===3?`Final result: ${labels[state.cases[i].result]}`:state.cases[i].phase>0?`Proposed: ${labels[state.cases[i].proposal]}`:'Awaiting the observation window and evidence.'}</p><a href={e.source.referenceUrl} target="_blank" rel="noreferrer">Official source</a><details><summary>YES and NO rules</summary><p>{e.yesRule}</p><p>{e.noRule}</p></details></article>)}</div>
      <section className="portfolio-wallet pilot-form"><h2>Build a combined view.</h2><p>Combine YES or NO outcomes with an AND or OR rule. Each winning share pays 1 AUSD. Void outcomes follow the rules above.</p><fieldset disabled={disabled}><legend>Events</legend>{state.manifest.publication.draft.events.map((e,i)=><label key={e.id}><input type="checkbox" checked={legs.includes(i)} onChange={()=>setLegs(old=>old.includes(i)?old.filter(v=>v!==i):[...old,i].sort())}/>{e.question}</label>)}</fieldset>{legs.map(i=><label key={i}>Event {i+1} outcome<select disabled={disabled} value={(answers[i]??true)?'yes':'no'} onChange={e=>setAnswers(old=>({...old,[i]:e.target.value==='yes'}))}><option value="yes">YES</option><option value="no">NO</option></select></label>)}<label>Payout rule<select disabled={disabled} value={rule} onChange={e=>setRule(e.target.value)}><option value="AND">All selected outcomes happen (AND)</option><option value="OR">Any selected outcome happens (OR)</option></select></label><div className="pilot-fields"><label>Action<select value={side} disabled={disabled} onChange={e=>setSide(e.target.value)}><option value="buy">Buy</option><option value="sell">Sell</option><option value="redeem">Redeem settled shares</option></select></label><label>Shares<input value={quantity} disabled={disabled} inputMode="decimal" onChange={e=>setQuantity(e.target.value)}/></label></div><p>Trading uses a 0.5% slippage limit. Approvals and trades are separate confirmations.</p><div className="pilot-actions"><button className="button button-dark" disabled={disabled||!owner||!legs.length} onClick={()=>void run(async()=>{if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(quantity))throw new Error('Enter a positive share amount with up to six decimals');await prepare({action:side,scope,mask,quantity:parseUnits(quantity,6).toString(),slippageBps:50});})}>Review {side}</button><button className="button button-outline" disabled={busy||!owner||!legs.length} onClick={()=>void run(async()=>{setPosition(await pilotRequest('position',{owner,scope,mask}));})}>Check these holdings</button></div>{position&&<p>{cash(position.quantity)} shares held. {position.payoutAtoms===null?'Settlement pending.':`${cash(position.payoutAtoms)} AUSD redeemable.`}</p>}</section>
      <details className="portfolio-wallet pilot-form"><summary>Propose, challenge or review an outcome</summary><h2>Make the result reviewable.</h2><label>Event<select value={event} disabled={disabled} onChange={e=>setEvent(Number(e.target.value))}>{state.manifest.publication.draft.events.map((e,i)=><option value={i} key={e.id}>{e.question}</option>)}</select></label>
        {current&&<p>{phases[current.phase]}. {current.phase===0?`Assertions close ${date(current.assertionDeadline)}.`:current.phase===1?`Challenges close ${date(current.challengeUntil)}.`:current.phase===2?`Voting closes ${date(current.voteUntil)}. NO ${current.votes[0]}, YES ${current.votes[1]}, VOID ${current.votes[2]}.`:`Result ${labels[current.result]}.`}</p>}
        {current&&[current.evidenceHash,current.counterEvidenceHash].filter(h=>!/^0x0{64}$/.test(h)).map(h=><p key={h}><a href={`/api/pilot/evidence/${h}`} target="_blank" rel="noreferrer">Read hosted evidence {h.slice(0,12)}</a></p>)}
        <p>External evidence links and reviewer rationale are available in History. A hosted copy is available only if it was archived on Flurbo.</p><label>Outcome<select value={outcome} disabled={disabled} onChange={e=>setOutcome(Number(e.target.value))}><option value={2}>YES</option><option value={1}>NO</option><option value={3}>VOID</option></select></label><label>Your explanation<textarea value={statement} maxLength={8000} disabled={disabled} onChange={e=>setStatement(e.target.value)} placeholder="Explain how the published source meets the committed rule."/></label><label>Source URL<input value={source} disabled={disabled} onChange={e=>setSource(e.target.value)} placeholder="https://..."/></label><label>Evidence excerpt or source-adapter output<textarea value={attachment} maxLength={12000} disabled={disabled} onChange={e=>setAttachment(e.target.value)}/></label><p>Saving publishes this evidence at a public content-addressed URL. Include public material only. A missing source response is not proof of NO.</p><button className="button button-outline" disabled={disabled||!owner} onClick={()=>void run(publishEvidence)}>Save public evidence</button>
        {evidence&&<p><a href={evidence.uri} target="_blank" rel="noreferrer">View saved evidence</a></p>}
        <div className="pilot-actions">{(['assertOutcome','dispute','vote'] as const).map(action=><button key={action} className="button button-dark" disabled={disabled||!owner||!evidence|| (action==='assertOutcome'?current?.phase!==0:action==='dispute'?current?.phase!==1:current?.phase!==2||!state.wallet?.reviewer||current.voted)} onClick={()=>void run(()=>prepare({action,event,outcome,evidenceHash:evidence!.hash,evidenceURI:evidence!.uri}))}>{action==='assertOutcome'?'Review assertion':action==='dispute'?'Review challenge':'Review vote'}</button>)}</div>
        <p>Bond per assertion or challenge: {cash(state.manifest.publication.bondAtoms)} test AUSD. A quorum can finalize a dispute before the voting deadline.</p>
        <div className="pilot-actions"><button className="button button-outline" disabled={disabled||!owner||current?.phase===3} onClick={()=>void run(()=>prepare({action:'finalize',event}))}>Review deadline finalization</button><button className="button button-outline" disabled={disabled||!owner||state.delivered||!state.cases.every(c=>c.phase===3)} onClick={()=>void run(()=>prepare({action:'deliver'}))}>Review settlement delivery</button><button className="button button-outline" disabled={disabled||!owner||!state.wallet||state.wallet.credits==='0'} onClick={()=>void run(()=>prepare({action:'withdrawBond'}))}>Withdraw bond credit</button></div>
      </details>
    </>}

  </div>;
}
