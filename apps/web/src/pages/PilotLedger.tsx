import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { pilotRequest as request, type PilotState, type PilotNamespace } from '../pilot';
import { amount, describeClaimAnswers, rememberedWallet, walletKey } from '../portfolio';
import { evidenceURI } from '../../shared/pilot.mjs';
import { rememberedClaims, portfolioClaims } from '../pilot-claims';
import './portfolio.css';

type Entry={hash:string;block:number;index:number;name:string;args:Record<string,string|number|boolean>};
type Index={complete:boolean;through:number;target:number;logs:Entry[]};
type Claim={scope:number;mask:string};
type Position=Claim & {quantity:string;payoutAtoms:string|null};
type Account=Pick<PilotState,'manifest'|'snapshot'> & {wallet:{address:string;cash:string};claimScopes?:number[]};
type Holdings={snapshot:PilotState['snapshot'];rows:Position[]};

function claimsFor(state:Account,index:Index|null,owner:string,namespace:PilotNamespace) {
  const indexed:Claim[]=[];
  for(const entry of index?.logs||[])if(String(entry.args.trader||entry.args.owner||'').toLowerCase()===owner.toLowerCase()&&entry.args.scope!==undefined&&entry.args.mask!==undefined)indexed.push({scope:Number(entry.args.scope),mask:String(entry.args.mask)});
  const events=state.manifest.publication.draft.events.length;
  return portfolioClaims(events,state.claimScopes||[],rememberedClaims(namespace,state.manifest.pool,owner,events),indexed);
}

export default function PilotLedger({account,history,namespace='pilot',initialWallet,linked=false}:{account:string;history:boolean;namespace?:PilotNamespace;initialWallet?:string;linked?:boolean}) {
  const [wallet,setWallet]=useState(()=>initialWallet??rememberedWallet(account)),[owner,setOwner]=useState(wallet);
  const [state,setState]=useState<Account|null>(null),[index,setIndex]=useState<Index|null>(null),[holdings,setHoldings]=useState<Holdings|null>(null);
  const [accountError,setAccountError]=useState(''),[historyError,setHistoryError]=useState(''),[holdingsError,setHoldingsError]=useState('');
  const [busy,setBusy]=useState(false),[page,setPage]=useState(0),[claimCount,setClaimCount]=useState(0);
  const [catchingUp,setCatchingUp]=useState(true),[visible,setVisible]=useState(document.visibilityState==='visible');
  const version=useRef(0),active=useRef<AbortController|null>(null),automaticReads=useRef(0);
  useEffect(()=>()=>{version.current++;active.current?.abort();},[]);
  useEffect(()=>{const timer=setTimeout(()=>{if(owner)void refresh();},0);return()=>clearTimeout(timer);},[]);
  useEffect(()=>{const change=()=>setVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
  useEffect(()=>{
    if(!index || index.complete || busy || !catchingUp || !visible)return;
    const timer=setTimeout(()=>void refresh(owner,page,true),1500);
    return()=>clearTimeout(timer);
  },[index,busy,catchingUp,visible,owner,page]);

  function pause(){
    setCatchingUp(false);version.current++;active.current?.abort();active.current=null;setBusy(false);
  }
  async function refresh(next=owner,p=page,automatic=false){
    if(!/^0x[0-9a-f]{40}$/i.test(next)){setAccountError('Enter a public wallet address.');return;}
    const generation=++version.current;
    active.current?.abort();
    const controller=new AbortController();active.current=controller;
    const pilotRequest=<T,>(path:string,input?:unknown)=>request<T>(path,input,namespace,controller.signal);
    if(!automatic){automaticReads.current=0;setCatchingUp(true);}
    automaticReads.current++;
    const current=()=>generation===version.current;
    const changed=next.toLowerCase()!==owner.toLowerCase(),cached=changed?null:index;
    setBusy(true);setOwner(next);setPage(p);setAccountError('');setHistoryError('');setHoldingsError('');
    if(changed){setState(null);setIndex(null);setHoldings(null);setClaimCount(0);}
    else if(p!==page)setHoldings(null);
    try{sessionStorage.setItem(walletKey(account),next);}catch{}
    let loaded:Account|null=null,requested='';
    async function loadHoldings(s:Account,i:Index|null){
      const claims=claimsFor(s,i,next,namespace),slice=claims.slice(history?0:p*30,history?30:p*30+30);
      const key=JSON.stringify(slice);
      if(key===requested)return;
      requested=key;
      if(current())setClaimCount(claims.length);
      try{
        const result=await pilotRequest<Holdings>('positions',{owner:next,claims:slice});
        if(current()){setHoldings(result);setHoldingsError('');}
      }catch{if(current())setHoldingsError('Holdings could not be refreshed. Any displayed shares are from the last successful read.');}
    }
    // History storage or log scans must not gate reads of the user's actual holdings.
    const historyRead=pilotRequest<Index>('history',{}).then(i=>{
      if(current()){setIndex(i);if(!i.complete&&automaticReads.current>=5)setCatchingUp(false);}
      return i;
    },()=>{
      if(current()){setHistoryError('Trade history is temporarily unavailable. Your holdings are loaded separately. Retry shortly.');setCatchingUp(false);}
      return null;
    });
    const accountRead=(async()=>{
      try{
        loaded=await pilotRequest<Account>('account?wallet='+next);
        if(!current())return;
        setState(loaded);
        await loadHoldings(loaded,cached);
      }catch{if(current())setAccountError('Wallet details could not be refreshed. Retry shortly.');}
    })();
    try{
      const [i]=await Promise.all([historyRead,accountRead]);
      // Add any other Boolean claims discovered by history without gating current holdings.
      if(current()&&loaded&&i)await loadHoldings(loaded,i);
    }finally{if(current()){active.current=null;setBusy(false);}}
  }

  const activity=index?.logs.filter(e=>['Asserted','Disputed','Voted','Finalized','Delivered'].includes(e.name)||Object.values(e.args).some(v=>typeof v==='string'&&v.toLowerCase()===owner.toLowerCase())).reverse()||[];
  const rows=holdings?.rows.filter(r=>r.quantity!=='0')||[];
  function claimLabel(scope:number,mask:string){
    const events=state?.manifest.publication.draft.events;
    const names=events?.filter((_event,index)=>scope&(1<<index)).map(event=>event.question).join(' + ');
    return <><strong>{names||'Prediction'}</strong><small>{describeClaimAnswers(scope,Number(mask))}</small></>;
  }
  const holdingsTable=<>
    <div className="portfolio-section-heading"><h2>Your shares</h2><Link href="/markets">Explore markets</Link></div>
    {holdingsError&&<p role="status">{holdingsError}</p>}
    {holdings?<><p className="portfolio-freshness">Read from the pool at block {holdings.snapshot?.blockNumber}. {busy?'Refreshing...':''}</p>
      <div className="portfolio-table"><table><thead><tr><th>Prediction</th><th>Shares</th><th>Redeemable test AUSD</th></tr></thead><tbody>{rows.map(r=><tr key={`${r.scope}:${r.mask}`}><td>{claimLabel(r.scope,r.mask)}</td><td>{amount(r.quantity)}</td><td>{r.payoutAtoms===null?'Awaiting settlement':amount(r.payoutAtoms)}</td></tr>)}</tbody></table></div>
      {!rows.length&&<p>{index?.complete&&!historyError?'No shares in the claims checked on this page.':'No shares in the claims checked so far. Combinations may still be loading.'}</p>}
      <p className="portfolio-footnote">Shares on this page are checked directly with the pool, including combined predictions. {claimCount>30?'Use Next to check more predictions. ':''}{(!index?.complete||historyError)?'History is still incomplete and may reveal other claim types.':''}</p>
    </>:<p>{busy?'Loading your shares...':'Holdings are unavailable. This does not mean you have no shares.'}</p>}
  </>;
  return <div className="portfolio-view">
    {!linked&&<section className="portfolio-wallet"><div><label>Wallet to view<input value={wallet} onChange={e=>setWallet(e.target.value)}/></label></div><button className="button button-dark" onClick={()=>void refresh(wallet,0)}>View wallet</button><p>Read-only view. Enter your MetaMask address, or any address holding earlier positions.</p></section>}
    <div className="portfolio-toolbar"><p className="portfolio-address">{linked?'':`Showing ${owner}`}</p><button className="button button-outline" onClick={()=>busy?pause():void refresh()}>{busy?'Stop loading':'Refresh'}</button></div>
    {accountError&&<p role="status">{accountError}</p>}
    {state&&<p className="portfolio-freshness">{amount(state.wallet.cash)} test AUSD in this wallet. Checked at block {state.snapshot.blockNumber}.</p>}
    {historyError&&<p role="status">{historyError}</p>}
    {index&&!index.complete&&<section className="portfolio-wallet"><p>{catchingUp?'Loading more history in the background. You can switch wallets at any time.':'More history is available. Continue when you are ready.'}</p><button className="button button-outline" onClick={()=>catchingUp?pause():void refresh()}>{catchingUp?'Pause loading':'Continue loading'}</button></section>}
    {history?<>
      <div className="portfolio-section-heading"><h2>Your activity</h2></div>
      {index&&<p className="portfolio-freshness">History checked through block {index.through}.{historyError?' Showing the last successful history read.':index.complete?' History is up to date through this checkpoint.':' Earlier activity is still loading.'}</p>}
      {activity.length>0?<div className="portfolio-table"><table><thead><tr><th>Prediction / action</th><th>Shares</th><th>Test AUSD</th><th>Transaction</th></tr></thead><tbody>{activity.slice(page*30,page*30+30).map(e=><tr key={e.hash+e.index}><td>{e.name==='Traded'?<><span className="portfolio-tag">{e.args.isBuy?'Bought':'Sold'}</span>{claimLabel(Number(e.args.scope),String(e.args.mask))}</>:<><strong>{e.name}</strong>{['Asserted','Disputed','Voted'].includes(e.name)&&<><small>Outcome: {['Unset','NO','YES','VOID'][Number(e.args.outcome)]}</small>{evidenceURI(e.args.evidenceURI||e.args.rationaleURI)&&<a href={String(e.args.evidenceURI||e.args.rationaleURI)} target="_blank" rel="noreferrer">Read evidence or rationale</a>}</>}</>}</td><td>{amount(e.args.quantity===undefined?null:String(e.args.quantity))}</td><td>{amount(e.args.collateralAmount===undefined?null:String(e.args.collateralAmount))}</td><td><a href={`https://testnet.monadscan.com/tx/${e.hash}`} target="_blank" rel="noreferrer">View transaction</a><small>Block {e.block}</small></td></tr>)}</tbody></table></div>:<p>{historyError?'We cannot display your trade history yet. Check your current shares below.':index?.complete?'No indexed activity for this address.':'Loading your trade history...'}</p>}
      <p className="portfolio-footnote">Includes your wallet activity and the collection's public settlement record.</p>
      {(!index?.complete||historyError)&&holdingsTable}
    </>:holdingsTable}
    <div className="portfolio-pagination"><button className="button button-outline" disabled={page===0} onClick={()=>void refresh(owner,page-1)}>Previous</button><span>Page {page+1}</span><button className="button button-outline" disabled={(page+1)*30>=(history?activity.length:claimCount)} onClick={()=>void refresh(owner,page+1)}>Next</button></div>
  </div>;
}
