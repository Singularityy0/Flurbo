import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeFunctionData,encodeFunctionResult,parseAbi} from 'viem';
import {resolverAbi} from '../shared/pilot.mjs';
import {ALARM_DEFAULTS,MULTICALL3,alarmConfig,alarmDecision,alarmTick,githubActions,readCalendars} from '../server/settlement-alarm.mjs';

const now=1800000000,signer='0x'+'12'.repeat(20),resolverA='0x'+'a1'.repeat(20),resolverB='0x'+'b1'.repeat(20);
const multicall=parseAbi(['function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)']);
const config=alarmConfig({repository:'owner/repo',monitorWorkflow:'settlement-monitor.yml',workerWorkflow:'resolution-worker.yml',signer,pools:[
  {pool:'0x'+'a0'.repeat(20),resolver:resolverA,mode:'rehearsal',evidence:false,observationEnds:[now-7200,now-7200]},
  {pool:'0x'+'b0'.repeat(20),resolver:resolverB,mode:'release',evidence:true,observationEnds:[now+600,now+600]}]});
const iso=(t:number)=>new Date(t*1000).toISOString();
const run=(t:number,status='completed',workflow='settlement-monitor.yml')=>({workflow,status,event:'schedule',created_at:iso(t)});
const blank={phase:0,proposal:0,counter:0,result:0,asserter:'0x'+'00'.repeat(20),disputer:'0x'+'00'.repeat(20),
  evidenceHash:'0x'+'00'.repeat(32),counterEvidenceHash:'0x'+'00'.repeat(32),challengeUntil:0n,voteUntil:0n,votes:[0,0,0]};

// Fake chain: pool A timed out (assertion deadline passed), pool B not yet observable.
function chain({timestamp=now,fail=false}={}){
  const calls:any[]=[];
  const rpc=async(method:string,params:any[])=>{
    calls.push({method,params});if(fail)throw Error('RPC outage');
    if(method==='eth_getBlockByNumber')return {number:'0x64',hash:'0x'+'44'.repeat(32),timestamp:'0x'+timestamp.toString(16)};
    assert.equal(params[0].to,MULTICALL3);assert.equal(params[1],'0x64','reads are pinned to the fetched block');
    const inner=decodeFunctionData({abi:multicall,data:params[0].data}).args[0] as any[];
    return encodeFunctionResult({abi:multicall,functionName:'aggregate3',result:inner.map(c=>{
      const {functionName,args}=decodeFunctionData({abi:resolverAbi,data:c.callData});
      const a=c.target.toLowerCase()===resolverA;
      const value=functionName==='delivered'?false:functionName==='assertionDeadline'?BigInt(a?now-3600:now+4200):blank;
      return {success:true,returnData:encodeFunctionResult({abi:resolverAbi,functionName,result:value} as any)};
    })});
  };
  return {rpc,calls};
}
function github({runs=[] as any[],listStatus=200,dispatchStatus=204}={}){
  const requests:any[]=[];
  const fetcher=async(url:string,init:any={})=>{
    requests.push({url,init});
    if(init.method==='POST')return new Response(null,{status:dispatchStatus});
    if(listStatus!==200)return new Response('{}',{status:listStatus});
    const file=url.includes('settlement-monitor.yml')?'settlement-monitor.yml':'resolution-worker.yml';
    return Response.json({workflow_runs:runs.filter(r=>r.workflow===file)});
  };
  return {requests,client:githubActions({repository:'owner/repo',token:'test-token-value',monitorWorkflow:'settlement-monitor.yml',workerWorkflow:'resolution-worker.yml',fetcher})};
}

test('alarm reads every pool with two RPC requests at one block and schedules only automatic actions',async()=>{
  const c=chain(),calendars=await readCalendars(config,c.rpc);
  assert.deepEqual(c.calls.map(x=>x.method),['eth_getBlockByNumber','eth_call']);
  assert.deepEqual(calendars[0].entries.map((e:any)=>[e.action,e.event,e.readyAt]),[['finalize',0,now-3600],['finalize',1,now-3600]]);
  assert.deepEqual(calendars[1].entries.map((e:any)=>e.action),['evidence','finalize','evidence','finalize']);
  assert.equal(calendars[0].snapshot.timestamp,now);
});

test('decision: due work dispatches once per change; in-flight, recent and repeated attempts are deduplicated',async()=>{
  const calendars=await readCalendars(config,chain().rpc),d=(runs:any[],at=now)=>alarmDecision({now:at,calendars,runs,config});
  assert.equal(d([]).action,'dispatch');
  assert.equal(d([run(now-60,'queued')]).reason,'in-flight');
  assert.equal(d([run(now-60,'in_progress','resolution-worker.yml')]).reason,'in-flight');
  assert.equal(d([run(now-ALARM_DEFAULTS.stuckRunSeconds-1,'in_progress')]).reason,'stuck-run');
  // A run already started after the work became due: wait out the retry interval.
  assert.equal(d([run(now-120)]).reason,'recently-dispatched');
  assert.equal(d([run(now-ALARM_DEFAULTS.minRedispatchSeconds)]).action,'dispatch');
  // The last run predates the due work: dispatch immediately.
  assert.equal(d([run(now-3700)]).action,'dispatch');
  // Three runs saw it and it is still due: the worker is blocked, so back off to the recovery cadence.
  const tried=[run(now-2400),run(now-1800),run(now-700)];
  assert.equal(d(tried).reason,'backing-off');
  assert.equal(d(tried,now-700+ALARM_DEFAULTS.recoverySeconds).action,'dispatch');
  const idle=alarmDecision({now:now-7300,calendars:await readCalendars(config,chain({timestamp:now-7300}).rpc),runs:[],config});
  assert.equal(idle.reason,'idle');assert.equal(idle.nextWake,now-3600,'finish-only pool wakes at its timeout, not observation end');
});

test('stale or unavailable calendars recover at a bounded cadence; missing run history fails closed',async()=>{
  const skewed=await readCalendars(config,chain({timestamp:now-ALARM_DEFAULTS.maxSkewSeconds-1}).rpc);
  assert.deepEqual(alarmDecision({now,calendars:skewed,runs:[run(now-60)],config}),{action:'skip',reason:'stale-calendar'});
  assert.equal(alarmDecision({now,calendars:skewed,runs:[run(now-ALARM_DEFAULTS.recoverySeconds)],config}).reason,'recovery');
  const future=await readCalendars(config,chain({timestamp:now+ALARM_DEFAULTS.maxSkewSeconds+1}).rpc);
  assert.equal(alarmDecision({now,calendars:future,runs:[run(now-60)],config}).reason,'stale-calendar');
  assert.equal(alarmDecision({now,calendarError:'chain-read-failed',runs:[run(now-60)],config}).reason,'calendar-unavailable');
  assert.deepEqual(alarmDecision({now,calendarError:'chain-read-failed',runs:[],config}),{action:'dispatch',reason:'recovery',detail:'calendar-unavailable'});
  const calendars=await readCalendars(config,chain().rpc);
  assert.equal(alarmDecision({now,calendars,runsError:'github-503',config}).reason,'run-history-unavailable');
});

test('tick is report-only unless dispatch is explicit; one dispatch request, never the token in output',async()=>{
  const report=github();
  const dry=await alarmTick({config,rpc:chain().rpc,github:report.client,now:()=>now});
  assert.equal(dry.action,'would-dispatch');assert.ok(!report.requests.some(r=>r.init.method==='POST'));
  const live=github();
  const sent=await alarmTick({config,rpc:chain().rpc,github:live.client,now:()=>now,dispatch:true});
  assert.equal(sent.dispatched,true);
  const posts=live.requests.filter(r=>r.init.method==='POST');
  assert.equal(posts.length,1);
  assert.equal(posts[0].url,'https://api.github.com/repos/owner/repo/actions/workflows/settlement-monitor.yml/dispatches');
  assert.deepEqual(JSON.parse(posts[0].init.body),{ref:'main'});
  assert.equal(posts[0].init.headers.authorization,'Bearer test-token-value');
  assert.ok(live.requests.every(r=>!r.url.includes('test-token-value')));
  assert.ok(!JSON.stringify(sent).includes('test-token-value'));
  // Next minute GitHub shows the queued run: no second dispatch.
  const next=github({runs:[run(now,'queued')]});
  assert.equal((await alarmTick({config,rpc:chain().rpc,github:next.client,now:()=>now+60,dispatch:true})).reason,'in-flight');
  assert.ok(!next.requests.some(r=>r.init.method==='POST'));
});

test('outages: GitHub, RPC and rejected dispatches never loop or leak, and report retryability',async()=>{
  const down=github({listStatus:503});
  const blocked=await alarmTick({config,rpc:chain().rpc,github:down.client,now:()=>now,dispatch:true});
  assert.equal(blocked.reason,'run-history-unavailable');assert.equal(blocked.runsError,'github-503');
  assert.ok(!down.requests.some(r=>r.init.method==='POST'));
  const rpcDown=github({runs:[run(now-ALARM_DEFAULTS.recoverySeconds-5)]});
  const recovered=await alarmTick({config,rpc:chain({fail:true}).rpc,github:rpcDown.client,now:()=>now,dispatch:true});
  assert.equal(recovered.reason,'recovery');assert.equal(recovered.calendarError,'chain-read-failed');assert.equal(recovered.dispatched,true);
  for(const [status,retryable] of [[500,true],[429,true],[401,false],[403,false],[404,false],[422,false]] as const){
    const g=github({dispatchStatus:status});
    const failed=await alarmTick({config,rpc:chain().rpc,github:g.client,now:()=>now,dispatch:true});
    assert.equal(failed.action,'dispatch-failed');assert.equal(failed.status,status);assert.equal(failed.retryable,retryable);
    assert.equal(g.requests.filter(r=>r.init.method==='POST').length,1,'one attempt per tick');
  }
  const noToken=githubActions({repository:'owner/repo',token:null,monitorWorkflow:'settlement-monitor.yml',workerWorkflow:'resolution-worker.yml',fetcher:async()=>{throw Error('no network expected');}});
  await assert.rejects(noToken.dispatch(),(e:any)=>e.status===401);
});

test('configuration rejects unsafe input; both workflows cap concurrency; worker chaining is opt-in',async()=>{
  const base={repository:'owner/repo',monitorWorkflow:'settlement-monitor.yml',workerWorkflow:'resolution-worker.yml',signer,pools:config.pools};
  for(const bad of [{...base,repository:'owner/repo/../x'},{...base,signer:'bot'},{...base,pools:[]},{...base,minRedispatchSeconds:0},
    {...base,pools:[config.pools[0],config.pools[0]]},{...base,pools:config.pools.map((p:any)=>({...p,evidence:true}))},
    {...base,pools:[{...config.pools[0],mode:'sports'}]}])assert.throws(()=>alarmConfig(bad),/Invalid alarm/);
  const worker=await readFile(new URL('../../../.github/workflows/resolution-worker.yml',import.meta.url),'utf8');
  const monitor=await readFile(new URL('../../../.github/workflows/settlement-monitor.yml',import.meta.url),'utf8');
  for(const y of [worker,monitor]){assert.match(y,/concurrency:\s+group: [\w-]+\s+cancel-in-progress: false/);}
  assert.match(worker,/workflow_run:\s+workflows: \['Settlement monitor'\]/);
  assert.match(worker,/github\.event_name == 'workflow_run' && vars\.FLURBO_RESOLUTION_AFTER_MONITOR == 'true' && github\.event\.workflow_run\.conclusion == 'success' && github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(worker,/github\.event_name != 'workflow_run' && github\.ref == 'refs\/heads\/main'/);
});
