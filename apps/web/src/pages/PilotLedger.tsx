import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { pilotRequest, type PilotState } from '../pilot';
import { amount, describeClaim, rememberedWallet, walletKey } from '../portfolio';
import { evidenceURI } from '../../shared/pilot.mjs';
import './portfolio.css';
type Entry={hash:string;block:number;index:number;name:string;args:Record<string,string|number|boolean>};
type Index={complete:boolean;through:number;target:number;logs:Entry[]};
type Position={scope:number;mask:string;quantity:string;payoutAtoms:string|null};
export default function PilotLedger({account,history}:{account:string;history:boolean}) {
  const [wallet,setWallet]=useState(()=>rememberedWallet(account)),[owner,setOwner]=useState(wallet);
  const [state,setState]=useState<PilotState|null>(null),[index,setIndex]=useState<Index|null>(null),[rows,setRows]=useState<Position[]>([]);
  const [notice,setNotice]=useState('Load pilot activity and holdings.'),[busy,setBusy]=useState(false),[page,setPage]=useState(0),[claimCount,setClaimCount]=useState(0);
  const version=useRef(0);
  useEffect(()=>()=>{version.current++;},[]);
  async function refresh(next=owner,p=page){
    if(busy)return;const generation=++version.current;setBusy(true);
    try{
      if(!/^0x[0-9a-f]{40}$/i.test(next))throw new Error('Enter a public wallet address');
      const s=await pilotRequest<PilotState>('status?wallet='+next),i=await pilotRequest<Index>('history',{});
      const claims=new Map<string,{scope:number;mask:string}>();
      for(let event=0;event<s.manifest.publication.draft.events.length;event++)for(const mask of ['1','2'])claims.set(`${2**event}:${mask}`,{scope:2**event,mask});
      for(const entry of i.logs)if(String(entry.args.trader||entry.args.owner||'').toLowerCase()===next.toLowerCase()&&entry.args.scope!==undefined&&entry.args.mask!==undefined)claims.set(`${entry.args.scope}:${entry.args.mask}`,{scope:Number(entry.args.scope),mask:String(entry.args.mask)});
      const result=history?null:await pilotRequest<{rows:Position[]}>('positions',{owner:next,claims:[...claims.values()].slice(p*30,p*30+30)});
      if(generation!==version.current)return;
      setOwner(next);setPage(p);setClaimCount(claims.size);setState(s);setIndex(i);setRows(result?.rows||[]);
      try{sessionStorage.setItem(walletKey(account),next);}catch{}
      setNotice(i.complete?'Activity indexed through the displayed checkpoint. Holdings are read directly from the pool.':'Index catching up. Refresh to scan the next 1,000 blocks. Discovered positions and history are incomplete.');
    }catch(e){if(generation===version.current)setNotice(e instanceof Error?e.message:'Pilot data unavailable');}
    finally{if(generation===version.current)setBusy(false);}
  }
  const activity=index?.logs.filter(e=>['Asserted','Disputed','Voted','Finalized','Delivered'].includes(e.name)||Object.values(e.args).some(v=>typeof v==='string'&&v.toLowerCase()===owner.toLowerCase())).reverse()||[];
  return <div className="portfolio-view"><section className="portfolio-wallet"><label>Wallet to view<input value={wallet} disabled={busy} onChange={e=>setWallet(e.target.value)}/></label><button className="button button-dark" disabled={busy} onClick={()=>void refresh(wallet,0)}>View wallet</button><button className="button button-outline" disabled={busy} onClick={()=>{setWallet(account);void refresh(account,0);}}>Use Mera wallet</button><p>Read-only view. Your Mera and MetaMask addresses hold separate positions.</p></section><p role="status">{notice}</p>{state&&<><h2>{state.manifest.publication.draft.title}</h2>{state.manifest.publication.reviewerControl==='single-operator'&&<p>Operator-run testnet alpha. All reviewer wallets are controlled by one operator; dispute resolution is not independent.</p>}<p>{amount(state.wallet?.cash)} test AUSD in {owner}.</p><details><summary>Event key</summary>{state.manifest.publication.draft.events.map((e,i)=><p key={e.id}>{String.fromCharCode(65+i)}: {e.question}</p>)}</details><p>Indexed through block {index?.through}, target {index?.target}. <button disabled={busy} onClick={()=>void refresh()}>Refresh</button></p>{history?<><p>Your wallet activity and the shared public resolution record for this cluster.</p><div className="portfolio-table"><table><thead><tr><th>Action</th><th>Block</th><th>Transaction</th></tr></thead><tbody>{activity.slice(page*30,page*30+30).map(e=><tr key={e.hash+e.index}><td>{e.name}{['Asserted','Disputed','Voted'].includes(e.name)&&<><br/>Outcome: {['Unset','NO','YES','VOID'][Number(e.args.outcome)]}<br/>{evidenceURI(e.args.evidenceURI||e.args.rationaleURI)&&<a href={String(e.args.evidenceURI||e.args.rationaleURI)} target="_blank" rel="noreferrer">Read evidence or rationale</a>}</>}</td><td>{e.block}</td><td><a href={`https://testnet.monadscan.com/tx/${e.hash}`} target="_blank" rel="noreferrer">{e.hash.slice(0,12)}...</a></td></tr>)}</tbody></table></div>{!activity.length&&<p>{index?.complete?'No indexed activity for this address.':'No activity found in the scanned blocks yet.'}</p>}</>:<><div className="portfolio-table"><table><thead><tr><th>Claim</th><th>Shares</th><th>Redeemable AUSD</th></tr></thead><tbody>{rows.filter(r=>r.quantity!=='0').map(r=><tr key={`${r.scope}:${r.mask}`}><td>{describeClaim(r.scope,Number(r.mask))}</td><td>{amount(r.quantity)}</td><td>{r.payoutAtoms===null?'Pending':amount(r.payoutAtoms)}</td></tr>)}</tbody></table></div>{!rows.some(r=>r.quantity!=='0')&&<p>{index?.complete?'No shares among this page of discovered claims.':'No shares among the claims discovered so far. Indexing is incomplete.'}</p>}<Link href="/events">Trade or redeem in Real events</Link></>}<div className="pilot-actions"><button disabled={busy||page===0} onClick={()=>void refresh(owner,page-1)}>Previous</button><button disabled={busy||(page+1)*30>=(history?activity.length:claimCount)} onClick={()=>void refresh(owner,page+1)}>Next</button></div></>}</div>;
}
