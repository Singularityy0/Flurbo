import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configurePracticeCollections,practiceNamespace } from '../server/practice-collections.mjs';
import { pilotFixture,owner,hash } from './pilot-fixture.ts';
import { pendingKeyFor,readPilotPending,checkPilotPending,pilotRequest } from '../src/pilot.ts';
import {ACTIVITY_METRICS,activityEvent} from '../shared/ethereum-activity.mjs';
const original=JSON.parse(await readFile(new URL('../../../config/practice-rehearsal.json',import.meta.url),'utf8'));
const options={rpcUrl:'https://testnet-rpc.monad.xyz',command:async()=>null};
test('featured collections preserve the original alias and reject duplicates or rebinding',async()=>{
  const other=structuredClone(original);other.pool='0x'+'ab'.repeat(20);other.resolver='0x'+'cd'.repeat(20);
  other.codeHashes[other.pool]=original.codeHashes[original.pool];other.codeHashes[other.resolver]=original.codeHashes[original.resolver];
  const env={FLURBO_PRACTICE_COLLECTIONS_JSON:JSON.stringify([{label:'October practice',manifest:other}]),FLURBO_PRACTICE_ACTIVE_POOL:other.pool};
  const registry=await configurePracticeCollections({...options,env});
  assert.equal(registry.catalog.active,practiceNamespace(other.pool));assert.equal(registry.services.get('rehearsal').manifest.pool,original.pool);
  assert.equal(registry.services.get(registry.catalog.active).manifest.pool,other.pool);
  await assert.rejects(configurePracticeCollections({...options,env:{...env,FLURBO_PRACTICE_ACTIVE_POOL:'0x'+'ef'.repeat(20)}}));
  await assert.rejects(configurePracticeCollections({...options,env:{FLURBO_PRACTICE_COLLECTIONS_JSON:JSON.stringify([{label:'Duplicate',manifest:original}])}}));
  await assert.rejects(configurePracticeCollections({...options,env:{},rehearsal:{manifest:other}}),/permanent/);
  await assert.rejects(configurePracticeCollections({...options,env:{FLURBO_PRACTICE_COLLECTIONS_JSON:'{}'}}));
});
test('pending confirmations and response manifests are bound to the collection pool',async()=>{
  const f=pilotFixture();f.manifest.publication.mode='rehearsal';f.options.allowance=1000000n;
  const review=await f.service.prepare({owner,action:'buy',scope:3,mask:'8',quantity:'1000000',slippageBps:50});
  const saved={review,nonce:'0x79' as const,hash,started:Date.now(),login:owner},namespace=practiceNamespace(f.manifest.pool);
  const db=new Map<string,string>(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),fetch=globalThis.fetch;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>db.get(key)??null}});
  try{
    db.set(pendingKeyFor('rehearsal'),JSON.stringify(saved));assert.equal(readPilotPending(namespace),null);
    db.set(pendingKeyFor(namespace),JSON.stringify(saved));assert.equal(readPilotPending(namespace)?.hash,hash);
    const wrong=practiceNamespace('0x'+'ab'.repeat(20));db.set(pendingKeyFor(wrong),JSON.stringify(saved));
    assert.throws(()=>readPilotPending(wrong),/different market/);await assert.rejects(checkPilotPending(saved,wrong));
    globalThis.fetch=async()=>Response.json({manifest:f.manifest});await assert.rejects(pilotRequest('status',undefined,wrong),/different collection/);
    assert.equal(readPilotPending('rehearsal')?.hash,hash);
  }finally{globalThis.fetch=fetch;if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as any).localStorage;}
});

test('real Showcase joins October without changing the legacy collection or accepting altered source rules',async()=>{
  const october=structuredClone(original);october.pool='0x'+'ab'.repeat(20);october.resolver='0x'+'cd'.repeat(20);
  october.codeHashes[october.pool]=original.codeHashes[original.pool];october.codeHashes[october.resolver]=original.codeHashes[original.resolver];
  const showcase=structuredClone(october);showcase.pool='0x'+'ac'.repeat(20);showcase.resolver='0x'+'ce'.repeat(20);
  showcase.codeHashes[showcase.pool]=original.codeHashes[original.pool];showcase.codeHashes[showcase.resolver]=original.codeHashes[original.resolver];
  showcase.publication.mode='ethereum-activity';const close=showcase.publication.draft.closesAt;
  Object.assign(showcase.publication.draft,{title:'Showcase v0',clusterId:`showcase-v0-${close}`,events:ACTIVITY_METRICS.map(m=>activityEvent(m,close+120))});
  const rows=[{label:'October practice',manifest:october},{label:'Showcase v0',manifest:showcase}];
  const env={FLURBO_PRACTICE_COLLECTIONS_JSON:JSON.stringify(rows),FLURBO_PRACTICE_ACTIVE_POOL:showcase.pool};
  const registry=await configurePracticeCollections({...options,env});
  assert.equal(registry.catalog.collections.length,3);assert.equal(registry.services.get(practiceNamespace(october.pool)).manifest.pool,october.pool);
  assert.equal(registry.services.get('rehearsal').manifest.pool,original.pool);assert.equal(registry.catalog.active,practiceNamespace(showcase.pool));
  showcase.publication.draft.events[0].source.selectionRule='Different block';
  await assert.rejects(configurePracticeCollections({...options,env:{...env,FLURBO_PRACTICE_COLLECTIONS_JSON:JSON.stringify(rows)}}),/source changed/);
});
