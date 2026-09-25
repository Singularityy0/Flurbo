import { validClaim } from '../shared/pilot.mjs';
import type { PilotPending, PilotNamespace } from './pilot';

export type ClaimHint={scope:number;mask:string};
const key=(namespace:PilotNamespace,pool:string,owner:string)=>`flurbo.claims.v1:10143:${namespace}:${pool.toLowerCase()}:${owner.toLowerCase()}`;
function valid(claim:ClaimHint,events:number){
  return !!claim&&typeof claim.mask==='string'&&/^[1-9][0-9]{0,2}$/.test(claim.mask)&&validClaim(claim.scope,BigInt(claim.mask),events);
}
// Discovery hints only. Quantities and payouts always come from a fresh contract read.
export function rememberedClaims(namespace:PilotNamespace,pool:string,owner:string,events:number):ClaimHint[]{
  try{
    const raw=localStorage.getItem(key(namespace,pool,owner));if(!raw||raw.length>8000)return [];
    const parsed:unknown=JSON.parse(raw);
    if(!Array.isArray(parsed)||parsed.length>64)return [];
    return parsed.filter((v):v is ClaimHint=>valid(v,events)).map(({scope,mask})=>({scope,mask}));
  }catch{return [];}
}
export function rememberConfirmedClaim(namespace:PilotNamespace,saved:PilotPending){
  if(!['buy','sell','redeem'].includes(saved.review.action))return;
  const {manifest,requested}=saved.review,claim={scope:requested.scope!,mask:requested.mask!};
  const events=manifest.publication.draft.events.length;
  if(!valid(claim,events))return;
  try{
    const old=rememberedClaims(namespace,manifest.pool,requested.owner,events);
    const claims=[claim,...old.filter(c=>c.scope!==claim.scope||c.mask!==claim.mask)].slice(0,64);
    localStorage.setItem(key(namespace,manifest.pool,requested.owner),JSON.stringify(claims));
  }catch{/* Optional discovery hints must not turn a confirmed transaction into an error. */}
}
export function portfolioClaims(events:number,scopes:number[],hints:ClaimHint[],indexed:ClaimHint[]):ClaimHint[]{
  const claims=new Map<string,ClaimHint>();
  const add=(claim:ClaimHint)=>{if(valid(claim,events))claims.set(`${claim.scope}:${claim.mask}`,claim);};
  // Recently confirmed claims are read on the first page, independently of index progress.
  hints.forEach(add);
  for(let event=0;event<events;event++)for(const mask of ['1','2'])add({scope:2**event,mask});
  indexed.forEach(add);
  for(const scope of scopes){
    if(!Number.isInteger(scope)||scope<=0||scope>=2**events)continue;
    const bits=scope.toString(2).replaceAll('0','').length;
    if(bits<2||bits>3)continue;
    const states=2**bits,all=(1<<states)-1;
    // All AND and OR answer choices supported by the consumer/advanced forms.
    for(let state=0;state<states;state++){
      add({scope,mask:String(1<<state)});
      add({scope,mask:String(all^(1<<state))});
    }
  }
  return [...claims.values()];
}
