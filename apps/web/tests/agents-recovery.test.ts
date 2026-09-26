import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decodeFunctionData,encodeFunctionData} from 'viem';
import {pilotPoolAbi} from '../shared/pilot.mjs';
import {alice,bob,setup,forecast} from './agent-fixture.ts';
import {owner} from './pilot-fixture.ts';

// A sent transaction must stay recoverable whatever happens to its review, proposal or agent, and one
// on-chain transaction is attributed to exactly one proposal across agents and accounts. The server never
// sends anything; recovery only records a hash and verifies its receipt.
type Setup=ReturnType<typeof setup>;
const proposalsOf=async(s:Setup,id:string,login=alice)=>(await s.call(login,'GET',`/api/agents/${id}`)).body.records.filter((r:any)=>r.kind==='proposal');
async function agent(s:Setup,login=alice,name='Recovery agent'){
  const id=(await s.call(login,'POST','/api/agents',{name,namespace:'pilot',mode:'approval'})).body.id;
  const decision=(await s.call(login,'POST',`/api/agents/${id}/evaluate`,{forecast:forecast(s.f.manifest.pool)})).body;
  assert.equal(decision.decision.outcome,'propose');
  return {id,decision};
}
const propose=async(s:Setup,id:string,decisionId:string,login=alice)=>{const r=await s.call(login,'POST',`/api/agents/${id}/proposal`,{decisionId,owner});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const register=(s:Setup,id:string,proposal:any,hash:string,transaction:any,login=alice,which=s.api)=>s.call(login,'POST',`/api/agents/${id}/proposals/${proposal.id}`,{action:'submitted',hash,transaction},which);
const check=(s:Setup,id:string,proposal:any,login=alice)=>s.call(login,'POST',`/api/agents/${id}/proposals/${proposal.id}`,{action:'check'});
const perf=async(s:Setup,id:string,login=alice)=>(await s.call(login,'POST',`/api/agents/${id}/performance`,{})).body.live;
const stored=(s:Setup,id:string)=>JSON.parse(s.redis.data.get([...s.redis.data.keys()].find(k=>k.endsWith(':state:'+id))!)!);

test('a transaction sent before archive, after review expiry and after trimming is still recorded and counted once',async()=>{
  const s=setup();s.f.options.allowance=10n**12n;
  const {id,decision}=await agent(s);
  const target=await propose(s,id,decision.id),sent=target.review.transaction,hash='0x'+'a7'.repeat(32);
  assert.equal(target.review.action,'buy');
  // MetaMask sent it, but the hash never reached the server.
  s.mine(sent,hash,{logs:[]});
  // Many later proposals are prepared and dismissed, so the target falls outside the full-record window.
  const next=(await s.call(alice,'POST',`/api/agents/${id}/evaluate`,{forecast:forecast(s.f.manifest.pool)})).body;
  for(let i=0;i<55;i++){const p=await propose(s,id,next.id);assert.equal((await s.call(alice,'POST',`/api/agents/${id}/proposals/${p.id}`,{action:'rejected'})).status,200);}
  // Past the review's expiry and the one-day recovery window, then the agent is deleted (archived).
  s.advance(2*86_400);
  assert.equal((await s.call(alice,'POST',`/api/agents/${id}/delete`,{})).status,200);
  const compacted=stored(s,id).proposals.find((p:any)=>p.id===target.id);
  assert.ok(compacted&&!compacted.decision&&compacted.reviews.length===1,'compacted, but the review needed for recovery is kept');
  // Recovery after archive: the hash is recorded against the exact reviewed transaction and verified.
  const recorded=await register(s,id,target,hash,sent);
  assert.equal(recorded.status,200,JSON.stringify(recorded.body));assert.equal(recorded.body.status,'submitted');
  assert.equal((await register(s,id,target,hash,sent)).status,200,'recording again is a no-op');
  assert.equal((await check(s,id,target)).body.status,'confirmed');
  assert.equal((await perf(s,id)).confirmedPurchases,1);
  assert.equal((await check(s,id,target)).body.status,'confirmed');
  assert.equal((await perf(s,id)).confirmedPurchases,1,'checking again never counts twice');
  // An archived agent still refuses new work.
  assert.equal((await s.call(alice,'POST',`/api/agents/${id}/evaluate`,{forecast:forecast(s.f.manifest.pool)})).body.code,'ARCHIVED');
});

test('every review a proposal issued stays recoverable after many refreshes',async()=>{
  const s=setup();s.f.options.allowance=10n**12n;
  const {id,decision}=await agent(s);
  // Each refresh gets a slightly lower limit, so each review is a distinct transaction.
  const original=s.f.service.prepare;let lower=0n;
  s.f.service.prepare=async(input:any)=>{const review=await original(input),a=decodeFunctionData({abi:pilotPoolAbi,data:review.transaction.data}).args as any[];
    const limit=a[3]-lower++;
    return {...review,amountAtoms:limit.toString(),transaction:{...review.transaction,data:encodeFunctionData({abi:pilotPoolAbi,functionName:'buy',args:[a[0],a[1],a[2],limit,a[4]]})}};};
  const proposal=await propose(s,id,decision.id),opened=proposal.review.transaction,path=`/api/agents/${id}/proposals/${proposal.id}`;
  for(let i=0;i<6;i++)assert.equal((await s.call(alice,'POST',path,{action:'refresh'})).status,200);
  const view=(await proposalsOf(s,id))[0];
  assert.equal(view.reviewedTransactions.length,7);assert.notEqual(view.review.transaction.data,opened.data);
  // The first review, still open in MetaMask, was the one sent.
  const hash='0x'+'b7'.repeat(32);s.mine(opened,hash,{logs:[]});
  const recorded=await register(s,id,proposal,hash,opened);
  assert.equal(recorded.status,200,JSON.stringify(recorded.body));assert.equal(recorded.body.review.transaction.data,opened.data);
  assert.equal((await check(s,id,proposal)).body.status,'confirmed');
  assert.equal((await perf(s,id)).confirmedPurchases,1);
});

test('one transaction is attributed to one proposal across agents, instances, accounts, trimming and archive',async()=>{
  const s=setup();s.f.options.allowance=10n**12n;
  const a=await agent(s,alice,'Agent one'),b=await agent(s,alice,'Agent two');
  const pa=await propose(s,a.id,a.decision.id),pb=await propose(s,b.id,b.decision.id);
  assert.equal(pa.review.transaction.data,pb.review.transaction.data,'the two agents prepared identical transactions');
  const hash='0x'+'c7'.repeat(32);s.mine(pa.review.transaction,hash,{logs:[]});
  // Concurrent registration of the same hash with both agents through separate API instances.
  const results=await Promise.all([register(s,a.id,pa,hash,pa.review.transaction,alice,s.make()),register(s,b.id,pb,hash,pb.review.transaction,alice,s.make())]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winner=results[0].status===200?{...a,p:pa}:{...b,p:pb},loser=results[0].status===200?{...b,p:pb}:{...a,p:pa};
  assert.equal(results.find(r=>r.status===409)!.body.code,'HASH_CONFLICT');
  assert.equal((await check(s,winner.id,winner.p)).body.status,'confirmed');
  assert.equal((await register(s,winner.id,winner.p,hash,winner.p.review.transaction)).status,200,'idempotent for its own proposal');
  assert.equal((await register(s,loser.id,loser.p,hash,loser.p.review.transaction)).body.code,'HASH_CONFLICT');
  assert.deepEqual([(await perf(s,winner.id)).confirmedPurchases,(await perf(s,loser.id)).confirmedPurchases],[1,0]);
  // The protection survives the winner being archived and its proposals being trimmed or compacted.
  const later=(await s.call(alice,'POST',`/api/agents/${winner.id}/evaluate`,{forecast:forecast(s.f.manifest.pool)})).body;
  for(let i=0;i<55;i++){const p=await propose(s,winner.id,later.id);await s.call(alice,'POST',`/api/agents/${winner.id}/proposals/${p.id}`,{action:'rejected'});}
  assert.equal((await s.call(alice,'POST',`/api/agents/${winner.id}/delete`,{})).status,200);
  assert.equal((await register(s,loser.id,loser.p,hash,loser.p.review.transaction)).body.code,'HASH_CONFLICT');
  assert.equal((await perf(s,loser.id)).confirmedPurchases,0);
});

test('two accounts registering the same transaction at the same moment: the atomic write admits exactly one',async()=>{
  const s=setup();s.f.options.allowance=10n**12n;
  const a=await agent(s,alice),b=await agent(s,bob);
  const pa=await propose(s,a.id,a.decision.id,alice),pb=await propose(s,b.id,b.decision.id,bob);
  const hash='0x'+'d7'.repeat(32);s.mine(pa.review.transaction,hash,{logs:[]});
  // Hold both saves until both have passed their own checks, so only the atomic save can decide.
  const command=s.redis.command,waiting:(()=>void)[]=[];
  s.redis.command=async(op:string,...args:any[])=>{
    if(op==='EVAL'&&String(args[0]).includes('ARGV[3]')&&args.slice(2).some((k:any)=>String(k).includes(':tx:'))){
      await new Promise<void>(r=>{waiting.push(r);if(waiting.length===2)waiting.forEach(f=>f());});
    }
    return command(op,...args);
  };
  const results=await Promise.all([register(s,a.id,pa,hash,pa.review.transaction,alice,s.make()),register(s,b.id,pb,hash,pb.review.transaction,bob,s.make())]);
  s.redis.command=command;
  assert.equal(waiting.length,2,'both requests reached the atomic save');
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(results.find(r=>r.status===409)!.body.code,'HASH_CONFLICT');
  const [ga,gb]=[(await proposalsOf(s,a.id,alice))[0],(await proposalsOf(s,b.id,bob))[0]];
  assert.equal([ga,gb].filter((p:any)=>p.transactions.length).length,1,'only the winning proposal records the transaction');
});

test('a hash that turns out not to be the reviewed transaction releases its attribution',async()=>{
  const s=setup();s.f.options.allowance=10n**12n;
  const a=await agent(s,alice,'Agent one'),b=await agent(s,alice,'Agent two');
  const pa=await propose(s,a.id,a.decision.id),pb=await propose(s,b.id,b.decision.id);
  // A wrong hash is recorded against A; on-chain it is a different call.
  const hash='0x'+'e7'.repeat(32);s.mine({...pb.review.transaction,data:pb.review.transaction.data.slice(0,-2)+'00'},hash,{logs:[]});
  assert.equal((await register(s,a.id,pa,hash,pa.review.transaction)).status,200);
  assert.equal((await check(s,a.id,pa)).body.status,'failed');
  assert.equal((await register(s,b.id,pb,hash,pb.review.transaction)).status,200,'no longer held by the mismatched proposal');
});
