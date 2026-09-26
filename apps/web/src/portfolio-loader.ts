import {pilotRequest,type PilotNamespace,type PilotState} from './pilot';
import {portfolioClaims,rememberedClaims,type ClaimHint} from './pilot-claims';
import {type AccountHolding,accountOwners} from './account-holdings';
import type {MarketGroup} from './market-directory';
import type {ActivityLog} from './portfolio-performance';

export type HistoryRead={complete:boolean;through?:number;target?:number;logs:ActivityLog[]};
export type PoolRead={group:MarketGroup;manifest?:PilotState['manifest'];owners:Record<string,AccountHolding[]>;blocks:Record<string,string>;holdingsComplete:boolean;history?:HistoryRead;error?:string;historyError?:boolean};
export type PortfolioRequest=<T>(path:string,input:unknown,namespace:PilotNamespace,signal:AbortSignal)=>Promise<T>;
type AccountRead=Pick<PilotState,'manifest'|'snapshot'>&{claimScopes?:number[]};
export async function loadPortfolio({groups,account,wallets,signal,publish,request=pilotRequest,historyOnly=false,previous={}}:{groups:MarketGroup[];account:string;wallets:string[];signal:AbortSignal;publish:(namespace:string,value:PoolRead)=>void;request?:PortfolioRequest;historyOnly?:boolean;previous?:Record<string,PoolRead>}){
  const owners=accountOwners(account,wallets),queue=[...groups],data:Record<string,PoolRead>={};
  const send=(value:PoolRead)=>{data[value.group.namespace]=value;if(!signal.aborted)publish(value.group.namespace,{...value,owners:{...value.owners},blocks:{...value.blocks}});};
  const call=<T,>(group:MarketGroup,path:string,input?:unknown)=>request<T>(path,input,group.namespace,AbortSignal.any([signal,AbortSignal.timeout(45000)]));
  async function balances(value:PoolRead,claims:ClaimHint[],owner:string){
    for(let offset=0;offset<claims.length&&!signal.aborted;offset+=8){
      const batch=claims.slice(offset,offset+8);
      const response=await call<{rows:AccountHolding[];owner?:string;snapshot?:{blockNumber:string}}>(value.group,'positions',{owner,claims:batch});
      if(response.owner&&response.owner.toLowerCase()!==owner)throw Error('Wrong owner');
      if(!Array.isArray(response.rows)||response.rows.length!==batch.length||response.rows.some((row,i)=>row.scope!==batch[i].scope||row.mask!==batch[i].mask||!/^\d+$/.test(row.quantity)||row.payoutAtoms!==null&&!/^\d+$/.test(row.payoutAtoms)))throw Error('Incomplete balances');
      const combined=new Map((value.owners[owner]||[]).map(row=>[`${row.scope}:${row.mask}`,row]));
      for(const row of response.rows)combined.set(`${row.scope}:${row.mask}`,row);
      value.owners[owner]=[...combined.values()];if(response.snapshot)value.blocks[owner]=response.snapshot.blockNumber;send(value);
    }
  }
  // Two pools at most, one holdings request per pool. History never competes
  // with the initial holdings reads, and metadata is read once per pool.
  await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{
    while(queue.length&&!signal.aborted){
      const group=queue.shift()!,value:PoolRead=historyOnly&&previous[group.namespace]?{...previous[group.namespace],owners:{...previous[group.namespace].owners},blocks:{...previous[group.namespace].blocks}}:{group,owners:{},blocks:{},holdingsComplete:false};
      send(value);
      if(historyOnly)continue;
      try{
        const meta=await call<AccountRead>(group,'account?wallet='+owners[0]);
        if(meta.manifest.pool.toLowerCase()!==group.pool)throw Error('Wrong pool');
        value.manifest=meta.manifest;send(value);
        const count=meta.manifest.publication.draft.events.length;
        let failed=false;
        for(const owner of owners){
          if(signal.aborted)return;
          try{await balances(value,portfolioClaims(count,meta.claimScopes||[],rememberedClaims(group.namespace,group.pool,owner,count),[]),owner);}
          catch{failed=true;value.error='Some shares could not be refreshed. The totals below are incomplete.';send(value);}
        }
        value.holdingsComplete=!failed;send(value);
      }catch{value.error='Some shares could not be refreshed. The totals below are incomplete.';send(value);}
    }
  }));
  // One bounded history scan per pool. Further catch-up is explicit and never
  // locks navigation, wallet changes, holdings or payout controls.
  for(const group of groups){
    if(signal.aborted)return;
    const value=data[group.namespace];if(!value)continue;
    try{
      const history=await call<HistoryRead>(group,'history',{});value.history=history;value.historyError=false;send(value);
      const count=value.manifest?.publication.draft.events.length;if(!count)continue;
      for(const owner of owners){
        const indexed=history.logs.filter(l=>String(l.args.trader||l.args.owner||'').toLowerCase()===owner&&l.args.scope!==undefined&&l.args.mask!==undefined).map(l=>({scope:Number(l.args.scope),mask:String(l.args.mask)}));
        const existing=new Set((value.owners[owner]||[]).map(c=>`${c.scope}:${c.mask}`));
        const extra=portfolioClaims(count,[],[],indexed).filter(c=>!existing.has(`${c.scope}:${c.mask}`));
        if(extra.length)try{await balances(value,extra,owner);}catch{value.holdingsComplete=false;value.error='Some shares could not be refreshed. The totals below are incomplete.';send(value);}
      }
    }catch{value.historyError=true;send(value);}
  }
}
