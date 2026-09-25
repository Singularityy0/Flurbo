import {createHash} from 'node:crypto';
import {keccak256,parseTransaction,recoverTransactionAddress} from 'viem';
import {pilotCash,pilotCall} from '../shared/pilot.mjs';
import {settlementLease} from './settlement-store.mjs';
import {monitorIdentity} from './settlement-monitor.mjs';

export function nextResolutionAction(state,owner,owned={},deferred={}){
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
    if(c.phase===0&&now>=end&&!(deferred[event]>now)){
      // Preserve the published B dispute and C no-assertion exercises.
      if(p.mode==='rehearsal'&&![0,3].includes(event))continue;
      return {kind:'evidence',event};
    }
  }
  return {kind:'wait'};
}

export function validateWorkerReview(review,manifest,owner,now){
  if(review.schema!=='flurbo.pilot-review.v1'||review.manifest.pool!==manifest.pool||review.manifest.rulesHash!==manifest.rulesHash
    ||review.transaction.from.toLowerCase()!==owner.toLowerCase()||BigInt(review.transaction.chainId)!==10143n
    ||BigInt(review.transaction.value)!==0n||review.expiresAt<=now||now-review.snapshot.timestamp>60||review.snapshot.timestamp>now+15
    ||!['assertOutcome','finalize','deliver'].includes(review.requested.action))throw Error('Worker transaction binding failed');
  const call=pilotCall({...review.transaction,manifest});
  if(!call||call.name!==review.action||!['approve','assertOutcome','finalize','deliver'].includes(call.name))throw Error('Worker action rejected');
  if(call.name==='finalize'&&Number(call.args[0])!==review.requested.event)throw Error('Finalization event mismatch');
  if(call.name==='assertOutcome'&&(Number(call.args[0])!==review.requested.event||Number(call.args[1])!==2
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
export async function resolutionTick({manifest,owner,service,command,evidence,transport,enabled=false,now=()=>Math.floor(Date.now()/1000)}){
  if(manifest.chainId!==10143||owner.toLowerCase()===manifest.publication.creator.toLowerCase()
    ||manifest.publication.reviewers.some(r=>r.address.toLowerCase()===owner.toLowerCase()))throw Error('Use a dedicated non-reviewer testnet signer');
  const lease=await settlementLease(command,'resolution-worker-v1:'+owner.toLowerCase());
  try{
    let saved=await lease.load()||{schema:'flurbo.resolution-worker.v1',pool:manifest.pool,rulesHash:manifest.rulesHash,pending:null,owned:{},deferred:{}};
    if(saved.schema!=='flurbo.resolution-worker.v1'||saved.pool!==manifest.pool||saved.rulesHash!==manifest.rulesHash)throw Error('Reconcile existing signer journal before changing pools');
    if(saved.pending){
      const pending=saved.pending;
      if(keccak256(pending.raw)!==pending.hash)throw Error('Journal hash mismatch');
      const receipt=await transport.receipt(pending.hash);
      if(!receipt)return {status:'pending',hash:pending.hash};
      if(!receipt.confirmed)return {status:'pending',hash:pending.hash};
      if(receipt.success&&pending.action==='assertOutcome')saved.owned[pending.event]={outcome:pending.outcome,evidenceHash:pending.evidenceHash};
      saved.last={hash:pending.hash,success:receipt.success,at:now()};saved.pending=null;await lease.save(saved);
      return {status:receipt.success?'confirmed':'reverted',hash:pending.hash};
    }
    const state=await service.status(),plan=nextResolutionAction(state,owner,saved.owned,saved.deferred);
    if(!enabled||['wait','complete'].includes(plan.kind))return {status:enabled?plan.kind:'dry-run',plan};
    await requireHealthyMonitor(command,manifest,now());
    let input={owner,action:plan.action,...(plan.event===undefined?{}:{event:plan.event})};
    if(plan.kind==='evidence'){
      const proposal=await evidence(plan.event);
      if(!proposal){saved.deferred={...saved.deferred,[plan.event]:now()+600};await lease.save(saved);return {status:'awaiting-evidence',event:plan.event};}
      if(proposal.outcome!==2)throw Error('This worker supports source-checked YES only');
      input={owner,action:'assertOutcome',event:plan.event,outcome:proposal.outcome,evidenceHash:proposal.hash,evidenceURI:proposal.uri};
    }
    const review=await service.prepare(input);validateWorkerReview(review,manifest,owner,now());
    // A second current read closes the model/approval latency gap.
    const current=await service.status(),next=nextResolutionAction(current,owner,saved.owned,saved.deferred);
    if(next.kind!==plan.kind||next.event!==plan.event||next.action!==plan.action)throw Error('Resolver changed during preparation');
    await lease.renew();
    const signed=await transport.sign(review),tx=parseTransaction(signed);
    if((await recoverTransactionAddress({serializedTransaction:signed})).toLowerCase()!==owner.toLowerCase()
      ||tx.chainId!==10143||tx.to?.toLowerCase()!==review.transaction.to.toLowerCase()||tx.data!==review.transaction.data
      ||(tx.value||0n)!==0n||tx.gas!==BigInt(review.gasLimit)||tx.gasPrice!==BigInt(review.gasPrice))throw Error('Signed transaction differs from prepared action');
    const hash=keccak256(signed);
    saved.pending={hash,raw:signed,action:review.action,event:input.event,outcome:input.outcome,evidenceHash:input.evidenceHash};
    await lease.save(saved); // Persist BEFORE broadcast, including uncertain outcomes.
    await transport.broadcast(signed);
    return {status:'submitted',hash,action:review.action};
  }finally{await lease.release();}
}
