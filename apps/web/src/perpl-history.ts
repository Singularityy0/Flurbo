import * as ed from '@noble/ed25519';
import { PERPL_API_URL, PERPL_CHAIN_ID } from './perpl.ts';

export type HistoryKind='fills'|'position-history'|'account-history';
export type HistoryRow=Record<string,unknown>;
export type HistoryResult={rows:HistoryRow[];complete:boolean;next:string|null};
function base64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export async function restHeaders(key:{token:string;secret:Uint8Array},target:string,now=Date.now(),nonce=base64(crypto.getRandomValues(new Uint8Array(16)))) {
  if(!/^\/v1\/trading\/(?:wallet|positions|orders|fills|position-history|account-history|portfolio\/(?:equity|pnl)\/(?:all|day|week|month|2weeks))(?:\?[^#\r\n]*)?$/.test(target))throw new Error('Unsupported read endpoint.');
  const emptyHash=new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(0)));
  const bodyHash=Array.from(emptyHash,b=>b.toString(16).padStart(2,'0')).join('');
  const timestamp=String(now),canonical=[PERPL_CHAIN_ID,'GET',target,timestamp,nonce,bodyHash].join('\n');
  return {'X-API-Key':key.token,'X-API-Timestamp':timestamp,'X-API-Nonce':nonce,'X-API-Signature':base64(await ed.signAsync(new TextEncoder().encode(canonical),key.secret))};
}
export async function readPerpl(key:{token:string;secret:Uint8Array},target:string,signal?:AbortSignal,fetcher:typeof fetch=fetch):Promise<Record<string,unknown>> {
  const response=await fetcher(PERPL_API_URL+target,{method:'GET',headers:await restHeaders(key,target),signal,credentials:'omit'});
  if(!response.ok)throw new Error(response.status===404?'Perpl has no exchange account for this key.':`Perpl read failed (${response.status}). Your saved data was not replaced.`);
  const body=await response.json();
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid Perpl response.');
  return body;
}
export async function historyPages(key:{token:string;secret:Uint8Array},kind:HistoryKind,signal?:AbortSignal,start:string|null=null,read=readPerpl):Promise<HistoryResult>{
  let cursor=start;const seen=new Set<string>();let rows:HistoryRow[]=[];
  for(let i=0;i<10;i++){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const query=new URLSearchParams({count:'100'});if(cursor)query.set('page',cursor);
    const body=await read(key,`/v1/trading/${kind}?${query}`,signal);
    if(!Array.isArray(body.d)||(body.np!==undefined&&typeof body.np!=='string')||body.d.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new Error('Invalid Perpl history page.');
    rows=mergeHistory(rows,body.d as HistoryRow[]);
    if(!body.np)return {rows,complete:true,next:null};
    if(seen.has(body.np))throw new Error('Perpl repeated a history cursor.');
    seen.add(body.np);cursor=body.np;
  }
  return {rows,complete:false,next:cursor};
}
const signed=(value:unknown)=>typeof value==='string'&&/^-?\d{1,40}$/.test(value)?BigInt(value):null;
const r=(value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?value as HistoryRow:{};
const number=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)?v:null;
export function eventKey(row:HistoryRow){const at=r(row.at);return JSON.stringify([row.acc??row.id,row.mkt,row.pid,row.oid,row.rq,row.et,row.sr,at.b,at.tx,at.l]);}
export function mergeHistory(before:HistoryRow[],after:HistoryRow[]){return [...new Map([...before,...after].map(row=>[eventKey(row),row])).values()];}
export function performance(rows:HistoryRow[]){
  const byMarket=new Map<number,bigint>();let wins=0,losses=0,gain=0n,loss=0n,total=0n,winStreak=0,lossStreak=0,bestWin=0,bestLoss=0,hold=0,holdCount=0;
  const exits=mergeHistory([],rows).filter(row=>[13,14,15,19,22].includes(Number(row.sr))&&signed(row.dpnl)!==null&&signed(row.fee)!==null).sort((a,b)=>(number(r(a.at).t)??0)-(number(r(b.at).t)??0));
  const curve:{t:number;value:bigint}[]=[];
  for(const row of exits){
    const net=signed(row.dpnl)!+(signed(row.fnd)??0n)-signed(row.fee)!;total+=net;
    const market=number(row.mkt);if(market!==null)byMarket.set(market,(byMarket.get(market)??0n)+net);
    if(net>0n){wins++;gain+=net;winStreak++;lossStreak=0;bestWin=Math.max(bestWin,winStreak);}else if(net<0n){losses++;loss-=net;lossStreak++;winStreak=0;bestLoss=Math.max(bestLoss,lossStreak);}else{winStreak=0;lossStreak=0;}
    const time=number(r(row.at).t),opened=number(r(row.ots).t);
    if(time!==null){curve.push({t:time,value:total});if(opened!==null&&time>=opened){hold+=time-opened;holdCount++;}}
  }
  const ranked=[...byMarket].sort((a,b)=>a[1]===b[1]?0:a[1]>b[1]?-1:1);
  return {exits:exits.length,wins,losses,winRate:exits.length?wins/exits.length*100:null,profitFactor:loss>0n?Number(gain)/Number(loss):null,noLosses:gain>0n&&loss===0n,total:total.toString(),bestWin,bestLoss,holdMs:holdCount?hold/holdCount:null,bestMarket:ranked[0]?.[0]??null,worstMarket:ranked.at(-1)?.[0]??null,curve};
}
export function drawdown(points:{t:number;v:string}[]){
  let peak:bigint|null=null,max=0n,percent=0;
  for(const point of [...points].sort((a,b)=>a.t-b.t)){const value=signed(point.v);if(value===null)continue;if(peak===null||value>peak)peak=value;const drop=peak-value;if(drop>max)max=drop;if(peak>0n)percent=Math.max(percent,Number(drop)/Number(peak)*100);}
  return {amount:max.toString(),percent};
}
