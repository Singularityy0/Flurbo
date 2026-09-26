import {createHash} from 'node:crypto';
import {keccak256,parseTransaction,recoverTransactionAddress} from 'viem';
import {pilotCash,pilotCall} from '../shared/pilot.mjs';
import {settlementLease} from './settlement-store.mjs';
import {monitorIdentity} from './settlement-monitor.mjs';
import {validateActivityDraft} from '../shared/ethereum-activity.mjs';
import {settlementCalendar,nextWake,priority} from '../shared/settlement-calendar.mjs';

export function nextResolutionAction(state,owner,owned={},deferred={},{evidence=true}={}){
  if(state.delivered)return {kind:'complete'};
  const now=state.snapshot.timestamp,p=state.manifest.publication;
  if(BigInt(state.poolCash)<BigInt(state.requiredCollateral))throw Error('Collateral coverage failed');
  if(state.cases.every(c=>c.phase===3))return {kind:'transaction',action:'deliver'};
  for(let event=0;event<state.cases.length;event++){
    const c=state.cases[event],end=p.draft.events[event].observationEndsAt;
    if(c.phase===3)continue;
    if(c.phase===0&&now>=Number(c.assertionDeadline)||c.phase===2&&now>=Number(c.voteUntil))return {kind:'transaction',action:'finalize',event};
    if(c.phase===1&&now>=Number(c.challengeUntil)&&c.asserter.toLowerCase()===owner.toLowerCase()
      &&owned[event]?.evidenceHash===c.evidenceHash&&owned[event]?.outcome===c.proposal)return {kind:'transaction',action:'finalize',event};
    if(evidence&&c.phase===0&&now>=end&&!(deferred[event]>now)){
      // Preserve the published B dispute and C no-assertion exercises.
      if(p.mode==='rehearsal'&&![0,3].includes(event))continue;
      return {kind:'evidence',event};
    }
  }
  return {kind:'wait'};
}

export function validateWorkerReview(review,manifest,owner,now){
  const activity=manifest.publication.mode==='ethereum-activity';
  if(activity)validateActivityDraft(manifest.publication.draft);
  if(review.schema!=='flurbo.pilot-review.v1'||review.manifest.pool!==manifest.pool||review.manifest.rulesHash!==manifest.rulesHash
    ||review.transaction.from.toLowerCase()!==owner.toLowerCase()||BigInt(review.transaction.chainId)!==10143n
    ||BigInt(review.transaction.value)!==0n||review.expiresAt<=now||now-review.snapshot.timestamp>60||review.snapshot.timestamp>now+15
    ||!['assertOutcome','finalize','deliver'].includes(review.requested.action))throw Error('Worker transaction binding failed');
  const call=pilotCall({...review.transaction,manifest});
  if(!call||call.name!==review.action||!['approve','assertOutcome','finalize','deliver'].includes(call.name))throw Error('Worker action rejected');
  if(call.name==='finalize'&&Number(call.args[0])!==review.requested.event)throw Error('Finalization event mismatch');
  if(call.name==='assertOutcome'&&(Number(call.args[0])!==review.requested.event||!(activity?[1,2]:[2]).includes(Number(call.args[1]))||Number(call.args[1])!==review.requested.outcome
    ||call.args[2]!==review.requested.evidenceHash||call.args[3]!==review.requested.evidenceURI))throw Error('Assertion evidence mismatch');
  if(call.name==='approve'&&(review.requested.action!=='assertOutcome'||review.transaction.to.toLowerCase()!==pilotCash
    ||String(call.args[0]).toLowerCase()!==manifest.resolver||BigInt(call.args[1])!==BigInt(manifest.publication.bondAtoms)))throw Error('Only exact assertion bond approval is allowed');
  if(BigInt(review.amountAtoms)>BigInt(manifest.publication.bondAtoms)||BigInt(review.gasLimit)<=0n||BigInt(review.gasLimit)>1500000n
    ||BigInt(review.gasPrice)<=0n||BigInt(review.gasPrice)>500000000000n||BigInt(review.gasLimit)*BigInt(review.gasPrice)>100000000000000000n)throw Error('Worker spending limit exceeded');
}

export async function requireHealthyMonitor(command,manifest,now){
  const key='flurbo:monitor:v1:'+createHash('sha256').update(monitorIdentity(manifest)).digest('hex')+':state';
  const raw=await command('GET',key),monitor=raw?JSON.parse(raw):null;
  if(!monitor?.checkpoint||monitor.checkpoint.identity!==monitorIdentity(manifest)||!['observed','attention_required'].includes(monitor.report?.status)
    ||!Number.isSafeInteger(monitor.checkpoint.checkedAt)||now-monitor.checkpoint.checkedAt>900||monitor.checkpoint.checkedAt>now+15
    ||!Array.isArray(monitor.queue)||monitor.queue.length)throw Error('Fresh independent monitoring and delivered alerts required');
}

// Dependencies are deliberately explicit: source/model reads cannot call signer.
// One durable transaction at a time, across every pool using this signer.
export async function resolutionTick({manifest,owner,service,command,evidence,transport,enabled=false,allowEvidence=true,now=()=>Math.floor(Date.now()/1000)}){
  if(manifest.chainId!==10143||owner.toLowerCase()===manifest.publication.creator.toLowerCase()
    ||manifest.publication.reviewers.some(r=>r.address.toLowerCase()===owner.toLowerCase()))throw Error('Use a dedicated non-reviewer testnet signer');
  const lease=await settlementLease(command,'resolution-worker-v1:'+owner.toLowerCase());
  try{
    const previous=await lease.load();
    // One signer lease, separate permanent journals. Legacy ownership is retained.
    const book=previous?.schema==='flurbo.resolution-journals.v2'?previous:{schema:'flurbo.resolution-journals.v2',pools:previous?{[previous.pool]:previous}:{}};
    if(!book.pools||Object.values(book.pools).some(entry=>entry?.schema!=='flurbo.resolution-worker.v1'))throw Error('Invalid signer journal');
    if(Object.values(book.pools).some(entry=>entry.pool!==manifest.pool&&entry.pending))throw Error('Reconcile the other pool pending transaction before switching pools');
    let saved=book.pools[manifest.pool]||{schema:'flurbo.resolution-worker.v1',pool:manifest.pool,rulesHash:manifest.rulesHash,pending:null,owned:{},deferred:{}};
    const save=async()=>{book.pools[manifest.pool]=saved;await lease.save(book);};
    if(saved.schema!=='flurbo.resolution-worker.v1'||saved.pool!==manifest.pool||saved.rulesHash!==manifest.rulesHash)throw Error('Reconcile existing signer journal before changing pools');
    if(saved.pending){
      const pending=saved.pending;
      if(keccak256(pending.raw)!==pending.hash)throw Error('Journal hash mismatch');
      const receipt=await transport.receipt(pending.hash);
      if(!receipt)return {status:'pending',hash:pending.hash};
      if(!receipt.confirmed)return {status:'pending',hash:pending.hash};
      if(receipt.success&&pending.action==='assertOutcome')saved.owned[pending.event]={outcome:pending.outcome,evidenceHash:pending.evidenceHash};
      saved.last={hash:pending.hash,success:receipt.success,at:now()};saved.pending=null;await save();
      return {status:receipt.success?'confirmed':'reverted',hash:pending.hash};
    }
    const state=await service.status(),plan=nextResolutionAction(state,owner,saved.owned,saved.deferred,{evidence:allowEvidence});
    if(!enabled){
      let monitoring='healthy';
      try{await requireHealthyMonitor(command,manifest,now());}catch{monitoring='not-ready';}
      return {status:'dry-run',plan,pool:manifest.pool,monitoring};
    }
    if(['wait','complete'].includes(plan.kind))return {status:plan.kind,plan};
    await requireHealthyMonitor(command,manifest,now());
    let input={owner,action:plan.action,...(plan.event===undefined?{}:{event:plan.event})};
    if(plan.kind==='evidence'){
      const proposal=await evidence(plan.event);
      if(!proposal){saved.deferred={...saved.deferred,[plan.event]:now()+600};await save();return {status:'awaiting-evidence',event:plan.event};}
      if(!(manifest.publication.mode==='ethereum-activity'?[1,2]:[2]).includes(proposal.outcome))throw Error('Unsupported source-checked outcome');
      input={owner,action:'assertOutcome',event:plan.event,outcome:proposal.outcome,evidenceHash:proposal.hash,evidenceURI:proposal.uri};
    }
    const review=await service.prepare(input);validateWorkerReview(review,manifest,owner,now());
    // A second current read closes the model/approval latency gap.
    const current=await service.status(),next=nextResolutionAction(current,owner,saved.owned,saved.deferred,{evidence:allowEvidence});
    if(next.kind!==plan.kind||next.event!==plan.event||next.action!==plan.action)throw Error('Resolver changed during preparation');
    await lease.renew();
    const signed=await transport.sign(review),tx=parseTransaction(signed);
    if((await recoverTransactionAddress({serializedTransaction:signed})).toLowerCase()!==owner.toLowerCase()
      ||tx.chainId!==10143||tx.to?.toLowerCase()!==review.transaction.to.toLowerCase()||tx.data!==review.transaction.data
      ||(tx.value||0n)!==0n||tx.gas!==BigInt(review.gasLimit)||tx.gasPrice!==BigInt(review.gasPrice))throw Error('Signed transaction differs from prepared action');
    const hash=keccak256(signed);
    saved.pending={hash,raw:signed,action:review.action,event:input.event,outcome:input.outcome,evidenceHash:input.evidenceHash};
    await save(); // Persist BEFORE broadcast, including uncertain outcomes.
    await transport.broadcast(signed);
    return {status:'submitted',hash,action:review.action};
  }finally{await lease.release();}
}

const journalKey=owner=>'flurbo:monitor:v1:'+createHash('sha256').update('resolution-worker-v1:'+owner.toLowerCase()).digest('hex')+':state';
const roleConflict=(manifest,owner)=>owner.toLowerCase()===manifest.publication.creator.toLowerCase()
  ||manifest.publication.reviewers.some(r=>r.address.toLowerCase()===owner.toLowerCase());
const TRANSACTIONAL=new Set(['submitted','pending','confirmed','reverted']);

// Plans every registered pool, earliest deadline first. Signing still goes through resolutionTick,
// which holds the one signer lease and journal. Only pools given an evidence function may propose;
// all others only finalize timeouts, their own assertions and deliver. One unreadable or unmonitored
// pool is skipped and reported, never allowed to block the others.
export async function resolutionRound({pools,owner,command,transport,enabled=false,now=()=>Math.floor(Date.now()/1000)}){
  if(!Array.isArray(pools)||!pools.length)throw Error('Register at least one pool');
  const keys=pools.map(p=>p.manifest.pool.toLowerCase());
  if(new Set(keys).size!==keys.length)throw Error('Duplicate pool registration');
  if(pools.filter(p=>p.evidence).length>1)throw Error('Only one explicitly allowlisted pool may propose outcomes');
  const raw=await command('GET',journalKey(owner)),stored=raw?JSON.parse(raw):null;
  const book=stored?.schema==='flurbo.resolution-journals.v2'?stored.pools:stored?{[stored.pool]:stored}:{};
  const pending=Object.values(book||{}).find(entry=>entry?.pending);
  const tick=(p,live)=>resolutionTick({manifest:p.manifest,owner,service:p.service,command,evidence:p.evidence,transport,enabled:live,allowEvidence:!!p.evidence,now});
  if(pending){
    // Reconcile first; resolutionTick rechecks this under the lease.
    const target=pools.find(p=>p.manifest.pool===pending.pool);
    if(!target)throw Error('A pending transaction belongs to an unregistered pool');
    return {...await tick(target,enabled),pool:target.manifest.pool};
  }
  const rows=[],skipped=[];
  for(const p of pools){
    const pool=p.manifest.pool;
    if(p.manifest.chainId!==10143||roleConflict(p.manifest,owner)){skipped.push({pool,reason:'signer-role-conflict'});continue;}
    try{
      const state=await p.service.status(),saved=book?.[pool];
      const plan=nextResolutionAction(state,owner,saved?.owned||{},saved?.deferred||{},{evidence:!!p.evidence});
      const calendar=settlementCalendar(state,{owner,owned:saved?.owned||{},evidence:!!p.evidence});
      rows.push({p,pool,plan,calendar,state});
    }catch{skipped.push({pool,reason:'read-or-plan-failed'});}
  }
  const wake=nextWake(rows.map(r=>r.calendar),now());
  const monitoring=async p=>{try{await requireHealthyMonitor(command,p.manifest,now());return 'healthy';}catch{return 'not-ready';}};
  if(!enabled){
    const pools=[];
    for(const r of rows)pools.push({pool:r.pool,plan:r.plan,monitoring:await monitoring(r.p)});
    return {status:'dry-run',pools,skipped,nextWake:wake};
  }
  const entryFor=r=>r.calendar.entries.find(e=>e.action===(r.plan.kind==='evidence'?'evidence':r.plan.action)&&e.event===(r.plan.event??null))
    ||{deadline:null,readyAt:0};
  const candidates=rows.filter(r=>['transaction','evidence'].includes(r.plan.kind))
    .sort((a,b)=>{const x=priority(entryFor(a)),y=priority(entryFor(b));return x[0]-y[0]||x[1]-y[1];});
  const results=[];
  for(const r of candidates){
    if(await monitoring(r.p)!=='healthy'){skipped.push({pool:r.pool,reason:'monitoring-stale'});continue;}
    const result=await tick(r.p,true);
    if(TRANSACTIONAL.has(result.status))return {...result,pool:r.pool,skipped,nextWake:wake};
    results.push({pool:r.pool,status:result.status,event:result.event});
  }
  const status=rows.length&&rows.every(r=>r.plan.kind==='complete')&&!skipped.length?'complete'
    :skipped.some(s=>s.reason==='monitoring-stale')?'monitoring-stale':'wait';
  return {status,results,skipped,nextWake:wake};
}
