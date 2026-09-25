import { bytesToHex, keccak256, serializeTransaction, type Hex } from 'viem';
import { appFetch as fetch } from './platform-fetch.ts';
import { pilotCall, type PilotManifest } from '../shared/pilot.mjs';
import type { AuthController } from './auth/controller';

export type Provider={request(input:{method:string;params?:unknown[]}):Promise<unknown>;on?(event:string,fn:()=>void):void;removeListener?(event:string,fn:()=>void):void};
export type PilotState={manifest:PilotManifest;snapshot:{blockNumber:string;blockHash:string;timestamp:number};
  cases:{phase:number;proposal:number;counter:number;result:number;asserter:string;disputer:string;evidenceHash:string;counterEvidenceHash:string;challengeUntil:string;voteUntil:string;assertionDeadline:string;votes:number[];voted:boolean}[];
  delivered:boolean;resolved:boolean;voidMask:number;requiredCollateral:string;poolCash:string;
  wallet:null|{address:string;cash:string;credits:string;reviewer:boolean}};
export type PilotInput={owner:string;action:string;event?:number;outcome?:number;evidenceHash?:string;evidenceURI?:string;scope?:number;mask?:string;quantity?:string;slippageBps?:number};
export type PilotReview={schema:string;manifest:PilotManifest;snapshot:PilotState['snapshot'];expiresAt:number;action:string;requested:PilotInput;title:string;amountAtoms:string;minimumReceivedAtoms?:string;
  gasLimit:string;gasPrice:string;maximumFeeWei:string;
  transaction:{from:Hex;to:Hex;data:Hex;value:Hex;chainId:Hex};notice:string};
export type PilotPending={review:PilotReview;nonce:Hex;hash:Hex|null;started:number;login:string};
export const pilotPendingKey='flurbo.pilot.pending.v1';
export type PilotNamespace='pilot'|'rehearsal';
export const pendingKeyFor=(namespace:PilotNamespace)=>namespace==='pilot'?pilotPendingKey:'flurbo.rehearsal.pending.v1';

export async function pilotRequest<T>(path:string,input?:unknown,namespace:PilotNamespace='pilot',signal?:AbortSignal):Promise<T> {
  const response=await fetch('/api/'+namespace+'/'+path,{method:input===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
    headers:input===undefined?{}:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60_000)]):AbortSignal.timeout(60_000)});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || 'Pilot request failed. Refresh before retrying.');
  return result;
}
async function namespaceRpc(namespace:PilotNamespace,method:string,params:unknown[]=[]){ return (await pilotRequest<{result:unknown}>('rpc',{method,params},namespace)).result; }
const hex=(n:bigint)=>`0x${n.toString(16)}` as Hex;
export function rpcInteger(value:unknown):bigint {
  if(typeof value==='number' && Number.isSafeInteger(value) && value>=0) return BigInt(value);
  if(typeof value==='string' && /^0x[0-9a-f]{1,64}$/i.test(value)) return BigInt(value);
  throw new Error('Wallet returned an invalid integer.');
}

export function pilotMera(controller:AuthController,namespace:PilotNamespace='pilot'):Provider {
  const rpc=(method:string,params:unknown[]=[])=>namespaceRpc(namespace,method,params);
  return {async request({method,params=[]}) {
    const owner=controller.getSnapshot().address;
    if(['eth_accounts','eth_requestAccounts'].includes(method)) return owner?[owner]:[];
    if(method!=='eth_sendTransaction') return rpc(method,params);
    controller.checkExpiry();
    if(!owner || !controller.getSnapshot().signingExpiresAt) throw new Error('Unlock Mera signing before confirming.');
    const tx=params[0] as Record<string,string>;
    const state=await pilotRequest<PilotState>('status',undefined,namespace);
    if(tx.from?.toLowerCase()!==owner.toLowerCase() || rpcInteger(tx.chainId)!==10143n || rpcInteger(tx.value)!==0n
      || !pilotCall({to:tx.to,data:tx.data,manifest:state.manifest})) throw new Error('Unsupported pilot transaction');
    const nonce=rpcInteger(await rpc('eth_getTransactionCount',[owner,'pending']));
    if(nonce!==rpcInteger(tx.nonce) || nonce>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Nonce changed. Review again.');
    const raw={type:'legacy' as const,chainId:10143,nonce:Number(nonce),to:tx.to as Hex,data:tx.data as Hex,value:0n,gas:rpcInteger(tx.gas),gasPrice:rpcInteger(tx.gasPrice)};
    if(raw.gas===0n || raw.gas>15_000_000n || raw.gasPrice===0n || raw.gasPrice>500_000_000_000n) throw new Error('Gas exceeds pilot policy');
    const signature=await controller.signDigest(keccak256(serializeTransaction(raw)));
    return rpc('eth_sendRawTransaction',[serializeTransaction(raw,{r:bytesToHex(signature.compact.slice(0,32)),s:bytesToHex(signature.compact.slice(32)),v:27n+BigInt(signature.recovery)})]);
  }};
}

export function validatePilotReview(r:PilotReview,now=Date.now(),tracking=false) {
  if(r.schema!=='flurbo.pilot-review.v1' || r.manifest.status!=='verified_pilot_snapshot' || r.transaction.chainId!=='0x279f'
    || r.transaction.value!=='0x0' || r.transaction.from.toLowerCase()!==r.requested.owner.toLowerCase()
    || !/^0x[0-9a-f]{64}$/i.test(r.snapshot.blockHash) || !Number.isSafeInteger(r.expiresAt) || !Number.isSafeInteger(r.snapshot.timestamp)
    || r.expiresAt-r.snapshot.timestamp!==300 || !tracking && (now/1000>=r.expiresAt || now/1000<r.snapshot.timestamp-15)) throw new Error('Review expired or invalid. Review again.');
  const plan=pilotCall({to:r.transaction.to,data:r.transaction.data,manifest:r.manifest});
  for(const v of [r.gasLimit,r.gasPrice,r.maximumFeeWei])if(typeof v!=='string'||!/^[1-9][0-9]{0,30}$/.test(v))throw new Error('Invalid fee review');
  if(BigInt(r.gasLimit)>15_000_000n||BigInt(r.gasPrice)>500_000_000_000n||BigInt(r.maximumFeeWei)!==BigInt(r.gasLimit)*BigInt(r.gasPrice))throw new Error('Fee exceeds pilot policy');
  if(!plan || plan.name!==r.action) throw new Error('Transaction differs from the displayed action');
  const a=plan.args, wanted=r.requested;
  if(plan.name==='approve') {
    const spender=['buy','sell','redeem'].includes(wanted.action)?r.manifest.pool:r.manifest.resolver;
    if(String(a[0]).toLowerCase()!==spender || String(a[1])!==r.amountAtoms || !['buy','assertOutcome','dispute'].includes(wanted.action)) throw new Error('Unexpected approval');
  } else {
    if(plan.name!==wanted.action) throw new Error('Wrong action');
    if(['assertOutcome','dispute','vote'].includes(plan.name) && (a[0]!==wanted.event || a[1]!==wanted.outcome || String(a[2]).toLowerCase()!==wanted.evidenceHash?.toLowerCase() || a[3]!==wanted.evidenceURI)) throw new Error('Evidence or outcome changed');
    if(plan.name==='finalize' && a[0]!==wanted.event) throw new Error('Wrong event');
    if(['buy','sell','redeem'].includes(plan.name) && (a[0]!==wanted.scope || String(a[1])!==wanted.mask || String(a[2])!==wanted.quantity)) throw new Error('Claim changed');
    if(plan.name==='buy' && String(a[3])!==r.amountAtoms || plan.name==='sell' && r.minimumReceivedAtoms!==undefined && String(a[3])!==r.minimumReceivedAtoms) throw new Error('Displayed trading limit changed');
    if(plan.name==='sell' && !tracking && r.minimumReceivedAtoms===undefined) throw new Error('Minimum proceeds missing. Review again.');
    if(['buy','sell'].includes(plan.name) && (BigInt(String(a[4]))<=BigInt(r.snapshot.timestamp) || BigInt(String(a[4]))>BigInt(r.expiresAt) || BigInt(String(a[4]))>=BigInt(r.manifest.publication.draft.closesAt))) throw new Error('Unexpected trading deadline');
  }
  return plan;
}

export function readPilotPending(namespace:PilotNamespace='pilot'):PilotPending|null {
  const raw=localStorage.getItem(pendingKeyFor(namespace));
  if(!raw) return null;
  if(raw.length>100_000) throw new Error('Saved transaction is invalid. Do not resubmit.');
  const value=JSON.parse(raw) as PilotPending;
  if((value.review.manifest.publication.mode==='rehearsal')!==(namespace==='rehearsal'))throw new Error('Saved transaction belongs to a different market');
  validatePilotReview(value.review,Date.now(),true); rpcInteger(value.nonce);
  if(value.hash!==null && !/^0x[0-9a-f]{64}$/i.test(value.hash) || !Number.isFinite(value.started)) throw new Error('Invalid transaction tracking');
  return value;
}

async function walletIdentity(p:Provider,r:PilotReview) {
  if(rpcInteger(await p.request({method:'eth_chainId'}))!==10143n) throw new Error('Select public Monad testnet in your wallet.');
  const accounts=await p.request({method:'eth_accounts'}) as string[];
  if(!Array.isArray(accounts) || accounts[0]?.toLowerCase()!==r.transaction.from.toLowerCase()) throw new Error('Wallet changed. Review again.');
  const anchor=await p.request({method:'eth_getBlockByNumber',params:[hex(BigInt(r.manifest.verifiedBlock)),false]}) as {hash?:string}|null;
  if(anchor?.hash?.toLowerCase()!==r.manifest.verifiedBlockHash) throw new Error('Wallet network does not match this public deployment.');
}

export async function submitPilot(p:Provider,r:PilotReview,login:string,save:(value:PilotPending|null)=>void,current:()=>boolean) {
  validatePilotReview(r); await walletIdentity(p,r);
  for(const to of [r.manifest.pool,r.manifest.resolver]) {
    const code=await p.request({method:'eth_getCode',params:[to,'latest']}) as Hex;
    if(keccak256(code)!==r.manifest.codeHashes[to]) throw new Error('Wallet contract code differs from the verified deployment.');
  }
  const snap=await p.request({method:'eth_getBlockByNumber',params:[hex(BigInt(r.snapshot.blockNumber)),false]}) as {hash?:string}|null;
  if(snap?.hash?.toLowerCase()!==r.snapshot.blockHash) throw new Error('Review snapshot changed');
  await p.request({method:'eth_call',params:[r.transaction,'latest']});
  const gas=rpcInteger(await p.request({method:'eth_estimateGas',params:[r.transaction]}))*120n/100n;
  const gasPrice=rpcInteger(await p.request({method:'eth_gasPrice'}));
  if(gas===0n || gas>15_000_000n || gasPrice===0n || gasPrice>500_000_000_000n) throw new Error('Gas exceeds pilot policy');
  if(gas>BigInt(r.gasLimit)||gasPrice>BigInt(r.gasPrice))throw new Error('Network fee increased. Review again.');
  if(rpcInteger(await p.request({method:'eth_getBalance',params:[r.transaction.from,'latest']}))<gas*gasPrice) throw new Error('Fund this wallet with test MON for fees');
  const nonce=hex(rpcInteger(await p.request({method:'eth_getTransactionCount',params:[r.transaction.from,'pending']})));
  await walletIdentity(p,r); validatePilotReview(r);
  if(!current()) throw new Error('Account or review changed. Review again.');
  const pending:PilotPending={review:r,nonce,hash:null,started:Date.now(),login};
  save(pending);
  try {
    const hash=await p.request({method:'eth_sendTransaction',params:[{...r.transaction,nonce,gas:hex(gas),gasPrice:hex(gasPrice)}]});
    if(typeof hash!=='string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Hash missing');
    save({...pending,hash:hash.toLowerCase() as Hex});
  } catch(e) {
    if((e as {code?:number}).code===4001) { save(null); throw new Error('Wallet request rejected.'); }
    throw new Error('Submission outcome unknown. Check wallet activity and attach the hash before another action.');
  }
}

export async function checkPilotPending(saved:PilotPending) {
  const namespace=saved.review.manifest.publication.mode==='rehearsal'?'rehearsal':'pilot';
  const rpc=(method:string,params:unknown[]=[])=>namespaceRpc(namespace,method,params);
  validatePilotReview(saved.review,Date.now(),true);
  if(!saved.hash) throw new Error('Attach the transaction hash from wallet activity. Do not repeat the action.');
  const tx=await rpc('eth_getTransactionByHash',[saved.hash]) as {hash:string;chainId:string;blockNumber:string;blockHash:string;from:string;to:string;input:string;value:string;nonce:string}|null;
  const receipt=await rpc('eth_getTransactionReceipt',[saved.hash]) as {transactionHash:string;blockNumber:string;blockHash:string;status:string}|null;
  if(!receipt) return 'pending';
  const wanted=saved.review.transaction;
  if(!tx || tx.hash?.toLowerCase()!==saved.hash.toLowerCase() || receipt.transactionHash?.toLowerCase()!==saved.hash.toLowerCase()
    || rpcInteger(tx.chainId)!==10143n || tx.blockHash?.toLowerCase()!==receipt.blockHash.toLowerCase() || rpcInteger(tx.blockNumber)!==rpcInteger(receipt.blockNumber)
    || tx.from.toLowerCase()!==wanted.from.toLowerCase() || tx.to.toLowerCase()!==wanted.to.toLowerCase()
    || tx.input.toLowerCase()!==wanted.data.toLowerCase() || rpcInteger(tx.value)!==0n || rpcInteger(tx.nonce)!==rpcInteger(saved.nonce)) throw new Error('Transaction does not match the reviewed call. Tracking remains open.');
  const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]) as {hash:string}|null;
  const head=await rpc('eth_getBlockByNumber',['latest',false]) as {number:string}|null;
  if(block?.hash.toLowerCase()!==receipt.blockHash.toLowerCase() || !head || rpcInteger(head.number)<rpcInteger(receipt.blockNumber)+1n) return 'confirming';
  if(![0n,1n].includes(rpcInteger(receipt.status))) throw new Error('Invalid receipt status');
  return rpcInteger(receipt.status)===1n?'confirmed':'reverted';
}
