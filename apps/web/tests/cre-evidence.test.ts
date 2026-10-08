import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {blockUrl,parseCreEvidence} from '../shared/cre-evidence.mjs';
import {creEvidenceForManifest} from '../server/cre-evidence.mjs';
import {localApi} from '../server/local-api.mjs';

const root=new URL('../../../',import.meta.url);
const registry=JSON.parse(readFileSync(new URL('config/collections.json',root),'utf8'));
const manifest=registry.collections.find((c:any)=>c.label==='Crypto weekend').manifest;
const file=readFileSync(new URL(`config/cre-evidence/${manifest.pool}.json`,root),'utf8');
const evidence=()=>JSON.parse(file);
const wallet='0x'+'66'.repeat(20);

test('the committed Crypto weekend evidence validates and keeps only known fields',()=>{
  const parsed=parseCreEvidence(file)!;
  assert.ok(parsed);
  assert.equal(parsed.yesMask,8);
  assert.deepEqual(parsed.onchain,{resolvedState:8,voidMask:0,matches:true});
  assert.deepEqual(parsed.observations.map(o=>o.yes),[false,false,false,true]);
  assert.equal(parsed.observations[2].answer,'268738175423');
  assert.equal(parsed.block.number,'110317694');
  assert.equal(blockUrl(parsed.block.number),'https://monadscan.com/block/110317694');
  assert.deepEqual(parseCreEvidence(parsed),parsed);
});

test('evidence that is inconsistent with itself is refused',()=>{
  const bad=(edit:(e:any)=>void)=>{const e=evidence();edit(e);return parseCreEvidence(e);};
  assert.equal(bad(()=>{}) !== null,true);
  assert.equal(bad(e=>{e.schema='flurbo.cre-price-evidence.v2';}),null);
  assert.equal(bad(e=>{e.extra=1;}),null);
  assert.equal(bad(e=>{delete e.notice;}),null);
  assert.equal(bad(e=>{e.yesMask=12;}),null);
  assert.equal(bad(e=>{e.observations[0].yes=true;}),null);
  assert.equal(bad(e=>{e.observations[1].eventIndex=0;}),null);
  assert.equal(bad(e=>{e.observations[2].answer='-5';}),null);
  assert.equal(bad(e=>{e.observations[2].threshold='1e3';}),null);
  assert.equal(bad(e=>{e.observations[2].label='<script>';}),null);
  assert.equal(bad(e=>{e.observations[2].extra='x';}),null);
  assert.equal(bad(e=>{e.observations.length=1;}),null);
  assert.equal(bad(e=>{e.onchain.matches=false;}),null);
  assert.equal(bad(e=>{e.onchain.resolvedState=9;}),null);
  assert.equal(bad(e=>{e.onchain=null;}) !== null,true);
  assert.equal(bad(e=>{e.pool='0x'+'11'.repeat(20);}),null);
  assert.equal(bad(e=>{e.rulesHash='0x'+'11'.repeat(32);}),null);
  assert.equal(bad(e=>{e.observationsHash='0x'+'11'.repeat(32);}),null);
  assert.equal(bad(e=>{e.unsignedReport=e.unsignedReport.slice(0,-1)+'9';}),null);
  assert.equal(bad(e=>{e.previousBlock.number='110317600';}),null);
  assert.equal(bad(e=>{e.block.hash='0x1234';}),null);
  assert.equal(bad(e=>{e.block.timestamp=1.5;}),null);
  assert.equal(parseCreEvidence('not json'),null);
  assert.equal(parseCreEvidence(null),null);
  assert.equal(parseCreEvidence([]),null);
});

test('a pool that has not resolved yet shows no on-chain result',()=>{
  const e=evidence();e.onchain=null;
  assert.equal(parseCreEvidence(e)!.onchain,null);
});

test('evidence is returned only for the exact pool and rules hash it names',()=>{
  assert.equal(creEvidenceForManifest(manifest)?.yesMask,8);
  assert.equal(creEvidenceForManifest({...manifest,rulesHash:'0x'+'22'.repeat(32)}),null);
  assert.equal(creEvidenceForManifest({...manifest,pool:'0x'+'33'.repeat(20)}),null);
  assert.equal(creEvidenceForManifest({pool:'../../package',rulesHash:manifest.rulesHash}),null);
  assert.equal(creEvidenceForManifest({}),null);
  assert.equal(creEvidenceForManifest(null),null);
  const other=registry.collections.find((c:any)=>c.label==='Jobs Friday').manifest;
  assert.equal(creEvidenceForManifest(other),null);
  assert.equal(creEvidenceForManifest(manifest,{read:()=>JSON.stringify({...evidence(),pool:'0x'+'44'.repeat(20)})}),null);
});

test('the signed-in route serves evidence for its own pool only',async()=>{
  const namespace=`practice-${manifest.pool.slice(2)}`;
  const other=registry.collections.find((c:any)=>c.label==='Jobs Friday').manifest,otherNamespace=`practice-${other.pool.slice(2)}`;
  const api=localApi({store:{read:async()=>({method:'passkey',address:wallet})},previewAccess:{allows:async()=>true},
    practiceCollections:{catalog:{collections:[{namespace,label:'Crypto weekend',pool:manifest.pool},{namespace:otherNamespace,label:'Jobs Friday',pool:other.pool}]},
      services:new Map([[namespace,{manifest}],[otherNamespace,{manifest:other}]])}});
  const request=async(space:string,query='')=>{
    const req={url:`/api/${space}/cre-evidence${query}`,method:'GET',headers:{host:'localhost:18767'}};
    let status=0,body:any;
    const res={writeHead:(code:number)=>{status=code;},end:(value:string)=>{body=JSON.parse(value);},setHeader:()=>{}};
    await api(req as any,res as any,()=>{});return {status,body};
  };
  const found=await request(namespace);assert.equal(found.status,200);assert.equal(found.body.yesMask,8);
  assert.ok(parseCreEvidence(found.body));
  assert.equal((await request(otherNamespace)).status,404);
  assert.equal((await request(namespace,'?x=1')).status,400);
});
