import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from 'viem';
import { pilotIndex } from '../server/pilot-index.mjs';
import { resolverAbi } from '../shared/pilot.mjs';

test('persistent pilot index resumes, rejects concurrent updates and rebuilds after a reorg',async()=>{
  const hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
  const manifest={pool:'0x'+'11'.repeat(20),resolver:'0x'+'22'.repeat(20),verifiedBlock:'100',verifiedBlockHash:hash(100)};
  let stored:string|null=null,reorg=false,conflict=false;
  const command=async(...a:any[])=>{if(a[0]==='GET')return stored;if(conflict||a[4] !==(stored||''))return 0;stored=a[5];return 1;};
  const rpc=async(method:string,params:any[])=>{
    if(method==='eth_getBlockByNumber'){
      const n=params[0]==='latest'?110:Number(BigInt(params[0]));return{number:'0x'+n.toString(16),hash:hash(n+(reorg&&n>100?1000:0))};
    }
    if(method==='eth_getLogs')return reorg?[]:[{address:manifest.resolver,blockNumber:'0x65',blockHash:hash(101),transactionHash:hash(1001),logIndex:'0x0',removed:false,
      topics:encodeEventTopics({abi:resolverAbi,eventName:'Finalized',args:{eventIndex:0}}),data:encodeAbiParameters(parseAbiParameters('uint8,bool'),[2,false])}];
    throw new Error(method);
  };
  const first=await pilotIndex({manifest,rpc,command}).refresh();assert.equal(first.logs.length,1);assert.equal(first.through,108);assert.equal(first.complete,true);
  const resumed=await pilotIndex({manifest,rpc,command}).refresh();assert.equal(resumed.logs.length,1);
  reorg=true;const rebuilt=await pilotIndex({manifest,rpc,command}).refresh();assert.equal(rebuilt.logs.length,0);assert.equal(rebuilt.hash,hash(1108));
  stored=null;conflict=true;await assert.rejects(pilotIndex({manifest,rpc,command}).refresh());assert.equal(stored,null);
});

test('simultaneous readers share one scan and a failed scan can be retried',async()=>{
  const hash='0x'+'11'.repeat(32);
  let attempts=0,fail=true;
  const index=pilotIndex({manifest:{pool:'0x'+'22'.repeat(20),resolver:'0x'+'33'.repeat(20),verifiedBlock:'100',verifiedBlockHash:hash},
    command:async()=>{attempts++;await new Promise(resolve=>setTimeout(resolve,5));if(fail)throw new Error('Redis unavailable');return null;},
    rpc:async()=>({number:'0x66',hash})});
  const first=index.refresh(),second=index.refresh();assert.equal(first,second);
  const rejected=await Promise.allSettled([first,second]);assert.ok(rejected.every(r=>r.status==='rejected'));assert.equal(attempts,1);
  fail=false;assert.equal((await index.refresh()).complete,true);assert.equal(attempts,2);
});
