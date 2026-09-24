import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { pilotRequest as request, type PilotState, type PilotNamespace } from '../pilot';
import { amount, describeClaim, rememberedWallet, walletKey } from '../portfolio';
import { evidenceURI } from '../../shared/pilot.mjs';
import './portfolio.css';

type Entry={hash:string;block:number;index:number;name:string;args:Record<string,string|number|boolean>};
type Index={complete:boolean;through:number;target:number;logs:Entry[]};
type Claim={scope:number;mask:string};
type Position=Claim & {quantity:string;payoutAtoms:string|null};
type Account=Pick<PilotState,'manifest'|'snapshot'> & {wallet:{address:string;cash:string}};
type Holdings={snapshot:PilotState['snapshot'];rows:Position[]};

function claimsFor(state:Account,index:Index|null,owner:string) {
  const claims=new Map<string,Claim>();
  for(let event=0;event<state.manifest.publication.draft.events.length;event++)for(const mask of ['1','2'])claims.set(`${2**event}:${mask}`,{scope:2**event,mask});
  for(const entry of index?.logs||[])if(String(entry.args.trader||entry.args.owner||'').toLowerCase()===owner.toLowerCase()&&entry.args.scope!==undefined&&entry.args.mask!==undefined)claims.set(`${entry.args.scope}:${entry.args.mask}`,{scope:Number(entry.args.scope),mask:String(entry.args.mask)});
  return [...claims.values()];
}

export default function PilotLedger({account,history,namespace='pilot'}:{account:string;history:boolean;namespace?:PilotNamespace}) {
  const pilotRequest=<T,>(path:string,input?:unknown)=>request<T>(path,input,namespace);
  const [wallet,setWallet]=useState(()=>rememberedWallet(account)),[owner,setOwner]=useState(wallet);
  const [state,setState]=useState<Account|null>(null),[index,setIndex]=useState<Index|null>(null),[holdings,setHoldings]=useState<Holdings|null>(null);
  const [accountError,setAccountError]=useState(''),[historyError,setHistoryError]=useState(''),[holdingsError,setHoldingsError]=useState('');
  const [busy,setBusy]=useState(false),[page,setPage]=useState(0),[claimCount,setClaimCount]=useState(0);
  const [catchingUp,setCatchingUp]=useState(true),[visible,setVisible]=useState(document.visibilityState==='visible');
  const version=useRef(0),working=useRef(false);
  useEffect(()=>()=>{version.current++;},[]);
  useEffect(()=>{const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer);},[]);
  useEffect(()=>{const change=()=>setVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
  useEffect(()=>{
    if(!index || index.complete || busy || !catchingUp || !visible)return;
    const timer=setTimeout(()=>void refresh(),1500);
    return()=>clearTimeout(timer);
  },[index,busy,catchingUp,visible,owner,page]);

  async function refresh(next=owner,p=page){
    if(working.current)return;
    if(!/^0x[0-9a-f]{40}$/i.test(next)){setAccountError('Enter a public wallet address.');return;}
    working.current=true;const generation=++version.current;
    const current=()=>generation===version.current;
    const changed=next.toLowerCase()!==owner.toLowerCase(),cached=changed?null:index;
    setBusy(true);setOwner(next);setPage(p);setAccountError('');setHistoryError('');setHoldingsError('');
    if(changed){setState(null);setIndex(null);setHoldings(null);setClaimCount(0);}
    else if(p!==page)setHoldings(null);
    try{sessionStorage.setItem(walletKey(account),next);}catch{}
    let loaded:Account|null=null,requested='';
    async function loadHoldings(s:Account,i:Index|null){
      const claims=claimsFor(s,i,next),slice=claims.slice(history?0:p*30,history?30:p*30+30);
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
      if(current())setIndex(i);
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
      // Add combinations discovered by this scan without blocking the base positions.
      if(current()&&loaded&&i)await loadHoldings(loaded,i);
    }finally{working.current=false;if(current())setBusy(false);}
  }

  const activity=index?.logs.filter(e=>['Asserted','Disputed','Voted','Finalized','Delivered'].includes(e.name)||Object.values(e.args).some(v=>typeof v==='string'&&v.toLowerCase()===owner.toLowerCase())).reverse()||[];
  const rows=holdings?.rows.filter(r=>r.quantity!=='0')||[];
  function claimLabel(scope:number,mask:string){
    const events=state?.manifest.publication.draft.events;
    const single=Number.isInteger(Math.log2(scope))?events?.[Math.log2(scope)]:null;
    return <><strong>{single?single.question:describeClaim(scope,Number(mask))}</strong>{single&&<small>{mask==='2'?'Yes':'No'}</small>}</>;
  }
  const holdingsTable=<>
    <div className="portfolio-section-heading"><h2>Your shares</h2><Link href="/markets">Explore markets</Link></div>
    {holdingsError&&<p role="status">{holdingsError}</p>}
    {holdings?<><p className="portfolio-freshness">Read from the pool at block {holdings.snapshot?.blockNumber}. {busy?'Refreshing...':''}</p>
      <div className="portfolio-table"><table><thead><tr><th>Prediction</th><th>Shares</th><th>Redeemable test AUSD</th></tr></thead><tbody>{rows.map(r=><tr key={`${r.scope}:${r.mask}`}><td>{claimLabel(r.scope,r.mask)}</td><td>{amount(r.quantity)}</td><td>{r.payoutAtoms===null?'Awaiting settlement':amount(r.payoutAtoms)}</td></tr>)}</tbody></table></div>
      {!rows.length&&<p>{index?.complete&&!historyError?'No shares in the claims checked on this page.':'No shares in the claims checked so far. Combinations may still be loading.'}</p>}
      {(!index?.complete||historyError)&&<p className="portfolio-footnote">Individual Yes and No holdings are checked directly. Combined predictions are added as trade history loads.</p>}
    </>:<p>{busy?'Loading your shares...':'Holdings are unavailable. This does not mean you have no shares.'}</p>}
  </>;
  return <div className="portfolio-view">
    <section className="portfolio-wallet"><div><label>Wallet to view<input value={wallet} disabled={busy} onChange={e=>setWallet(e.target.value)}/></label></div><button className="button button-dark" disabled={busy} onClick={()=>{setCatchingUp(true);void refresh(wallet,0);}}>View wallet</button><button className="button button-outline" disabled={busy} onClick={()=>{setWallet(account);setCatchingUp(true);void refresh(account,0);}}>Use Mera wallet</button><p>Read-only view. Your Mera and MetaMask addresses hold separate positions.</p></section>
    <div className="portfolio-toolbar"><p className="portfolio-address">Showing {owner}</p><button className="button button-outline" disabled={busy} onClick={()=>{setCatchingUp(true);void refresh();}}>{busy?'Refreshing...':'Refresh'}</button></div>
    {accountError&&<p role="status">{accountError}</p>}
    {state&&<p className="portfolio-freshness">{amount(state.wallet.cash)} test AUSD in this wallet. Checked at block {state.snapshot.blockNumber}.</p>}
    {historyError&&<p role="status">{historyError}</p>}
    {index&&!index.complete&&<section className="portfolio-wallet"><p>{Math.max(0,index.target-index.through).toLocaleString()} blocks remaining. {catchingUp?'Continues automatically while this page is visible.':'Automatic loading is paused.'}</p><button className="button button-outline" onClick={()=>setCatchingUp(value=>!value)}>{catchingUp?'Pause loading':'Continue loading'}</button></section>}
    {history?<>
      <div className="portfolio-section-heading"><h2>Your activity</h2></div>
      {index&&<p className="portfolio-freshness">History checked through block {index.through}.{historyError?' Showing the last successful history read.':index.complete?' History is up to date through this checkpoint.':' Earlier activity is still loading.'}</p>}
      {activity.length>0?<div className="portfolio-table"><table><thead><tr><th>Prediction / action</th><th>Shares</th><th>Test AUSD</th><th>Transaction</th></tr></thead><tbody>{activity.slice(page*30,page*30+30).map(e=><tr key={e.hash+e.index}><td>{e.name==='Traded'?<><span className="portfolio-tag">{e.args.isBuy?'Bought':'Sold'}</span>{claimLabel(Number(e.args.scope),String(e.args.mask))}</>:<><strong>{e.name}</strong>{['Asserted','Disputed','Voted'].includes(e.name)&&<><small>Outcome: {['Unset','NO','YES','VOID'][Number(e.args.outcome)]}</small>{evidenceURI(e.args.evidenceURI||e.args.rationaleURI)&&<a href={String(e.args.evidenceURI||e.args.rationaleURI)} target="_blank" rel="noreferrer">Read evidence or rationale</a>}</>}</>}</td><td>{amount(e.args.quantity===undefined?null:String(e.args.quantity))}</td><td>{amount(e.args.collateralAmount===undefined?null:String(e.args.collateralAmount))}</td><td><a href={`https://testnet.monadscan.com/tx/${e.hash}`} target="_blank" rel="noreferrer">View transaction</a><small>Block {e.block}</small></td></tr>)}</tbody></table></div>:<p>{historyError?'We cannot display your trade history yet. Check your current shares below.':index?.complete?'No indexed activity for this address.':'Loading your trade history...'}</p>}
      <p className="portfolio-footnote">Includes your wallet activity and the collection's public settlement record.</p>
      {(!index?.complete||historyError)&&holdingsTable}
    </>:holdingsTable}
    <div className="portfolio-pagination"><button className="button button-outline" disabled={busy||page===0} onClick={()=>void refresh(owner,page-1)}>Previous</button><span>Page {page+1}</span><button className="button button-outline" disabled={busy||(page+1)*30>=(history?activity.length:claimCount)} onClick={()=>void refresh(owner,page+1)}>Next</button></div>
  </div>;
}
