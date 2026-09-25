import {marketQuestion} from '../showcase-copy';
import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {pilotRequest,isPracticeNamespace,type PilotNamespace,type PilotState} from '../pilot';
import {portfolioClaims,rememberedClaims} from '../pilot-claims';
import {amount,describeClaim,describeClaimAnswers,type Portfolio} from '../portfolio';
import {accountOwners,combineHoldings,type AccountHolding} from '../account-holdings';
import './portfolio.css';

type Account=Pick<PilotState,'manifest'|'snapshot'> & {claimScopes?:number[]};
type History={complete:boolean;logs:{args:Record<string,unknown>}[]};
type Read={rows:AccountHolding[];complete:boolean};

export default function AccountHoldings({account,wallets,namespace}:{account:string;wallets:string[];namespace:string}){
  const [reads,setReads]=useState<Record<string,Read>>({}),[questions,setQuestions]=useState<string[]>([]);
  const [busy,setBusy]=useState(true),[error,setError]=useState(false),[older,setOlder]=useState(false),[revision,setRevision]=useState(0);
  const identity=accountOwners(account,wallets).join(',');
  useEffect(()=>{
    const controller=new AbortController(),signal=controller.signal,owners=identity.split(',');
    const current=()=>!signal.aborted;
    setReads({});setQuestions([]);setBusy(true);setError(false);setOlder(false);
    const publish=(owner:string,rows:AccountHolding[],complete:boolean)=>{if(current())setReads(old=>({...old,[owner]:{rows,complete}}));};
    const isPilot=namespace==='pilot'||isPracticeNamespace(namespace);
    const request=<T,>(path:string,input?:unknown)=>pilotRequest<T>(path,input,namespace as PilotNamespace,AbortSignal.any([signal,AbortSignal.timeout(20_000)]));
    // One shared discovery request, never one history scan per linked wallet.
    const history=isPilot?request<History>('history',{}).catch(()=>null):Promise.resolve(null);
    const discoveries:((index:History|null)=>Promise<void>)[]=[];
    async function pilot(owner:string){
      const data=await request<Account>('account?wallet='+owner);
      if(!current())return;
      const events=data.manifest.publication.draft.events;
      setQuestions(events.map(event=>marketQuestion(event)));
      const seen=new Set<string>(),rows:AccountHolding[]=[];
      async function positions(indexed:{scope:number;mask:string}[]){
        const claims=portfolioClaims(events.length,data.claimScopes||[],rememberedClaims(namespace as PilotNamespace,data.manifest.pool,owner,events.length),indexed)
          .filter(c=>!seen.has(`${c.scope}:${c.mask}`));
        for(let offset=0;offset<claims.length;offset+=30){
          if(!current())return;
          const batch=claims.slice(offset,offset+30);
          const result=await request<{rows:AccountHolding[]}>('positions',{owner,claims:batch});
          rows.push(...result.rows);batch.forEach(c=>seen.add(`${c.scope}:${c.mask}`));
          publish(owner,[...rows],false);
        }
      }
      await positions([]);
      publish(owner,[...rows],true);
      discoveries.push(async index=>{
        const indexed=(index?.logs||[]).filter(e=>String(e.args.trader||e.args.owner||'').toLowerCase()===owner&&e.args.scope!==undefined&&e.args.mask!==undefined)
          .map(e=>({scope:Number(e.args.scope),mask:String(e.args.mask)}));
        await positions(indexed);publish(owner,[...rows],true);
      });
    }
    async function legacy(owner:string){
      const market=namespace==='learning'?'learning':'original',base=market==='learning'?'/api/markets/learning':'/api';
      const rows:AccountHolding[]=[];
      for(let page=0;current();page++){
        const response=await fetch(`${base}/portfolio?wallet=${owner}&page=${page}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)])});
        if(!response.ok)throw Error('Holdings unavailable');
        const data:Portfolio=await response.json();
        if(data.wallet_address!==owner||data.market_id!==market||!data.snapshot)throw Error('Account mismatch');
        if(!data.index.complete){if(current())setOlder(true);publish(owner,rows,false);return;}
        if(data.snapshot.stale)throw Error('Stale holdings');
        rows.push(...(data.positions||[]).map(row=>({scope:row.scope,mask:String(row.mask),quantity:row.quantity_atoms,payoutAtoms:row.redeemable_atoms})));
        const complete=(page+1)*(data.page_size||20)>=(data.position_count||0);
        publish(owner,[...rows],complete);if(complete)return;
      }
    }
    async function run(){
      // Bound RPC pressure while still making progress across accounts.
      const queue=[...owners];
      await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{
        while(queue.length&&current()){
          const owner=queue.shift()!;
          try{await (isPilot?pilot(owner):legacy(owner));}catch{if(current())setError(true);}
        }
      }));
      if(!current())return;
      setBusy(false);
      if(isPilot){
        setOlder(true);
        const index=await history;
        if(!current())return;
        setOlder(!index?.complete);
        for(const discover of discoveries){
          if(!current())return;
          try{await discover(index);}catch{if(current())setError(true);}
        }
      }
    }
    void run();return()=>controller.abort();
  },[account,identity,namespace,revision]);
  const rows=combineHoldings(Object.values(reads).map(read=>read.rows));
  const incomplete=error||Object.values(reads).some(read=>!read.complete)||Object.keys(reads).length<identity.split(',').length;
  return <div className="portfolio-view account-holdings" aria-busy={busy}>
    <div className="portfolio-section-heading"><h2>Your shares</h2><button className="button button-outline" onClick={()=>setRevision(n=>n+1)}>{busy?'Refreshing…':'Refresh'}</button></div>
    {error&&<p role="alert">Some shares couldn’t be loaded. Refresh to complete your portfolio.</p>}
    <div className="portfolio-table"><table><thead><tr><th>Prediction</th><th>Shares</th><th>Redeemable test AUSD</th></tr></thead>
      <tbody>{rows.map(row=><tr key={`${row.scope}:${row.mask}`}><td><strong>{questions.length?questions.filter((_q,i)=>row.scope&(1<<i)).join(' + '):describeClaim(row.scope,Number(row.mask))}</strong><small>{describeClaimAnswers(row.scope,Number(row.mask))}</small></td><td><span className="holding-mobile-label" aria-hidden="true">Shares</span>{amount(row.quantity)}</td><td><span className="holding-mobile-label" aria-hidden="true">Redeemable test AUSD</span>{row.payoutAtoms===null?'Awaiting settlement':amount(row.payoutAtoms)}</td></tr>)}</tbody></table></div>
    {!rows.length&&<p role="status">{busy?'Loading your shares…':incomplete||older?'Your shares could not all be checked yet. Refresh to try again.':'No shares in this collection yet.'}</p>}
    {rows.length>0&&(busy||incomplete)&&<p className="portfolio-freshness" role="status">{busy?'Loading remaining shares…':'Showing the shares checked so far.'}</p>}
    {older&&!busy&&<p className="portfolio-footnote">Older custom predictions may still be missing. <Link href="/history">Check history</Link></p>}
  </div>;
}
