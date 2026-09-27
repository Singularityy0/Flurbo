import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assessSemantics,semanticRegistry} from '../server/semantic-validation.mjs';
import {encodeClaim} from '../shared/claims.mjs';
const pool='0x'+'1'.repeat(40),rulesHash='0x'+'2'.repeat(64);
const manifest={pool,rulesHash,publication:{draft:{events:[{},{}]}}};
const predicate=(event:number,operator:string,value:string,observation='eth:close:usd:2027-01-01')=>({event,operator,value,observation,sourceRule:'Exact closing observation, integer USD cents, same source and timestamp.'});
const registry=(predicates:any[])=>semanticRegistry(JSON.stringify({schema:'flurbo.semantic-rules.v1',markets:[{pool,rulesHash,predicates}]}));
const exclusive=registry([predicate(0,'gte','300000'),predicate(1,'lt','250000')]);
const input={scope:3,mask:'8',quantityAtoms:'1000000'};

test('exclusive AND has no ordinary payout, while VOID is not falsely described as zero',()=>{
  const r=assessSemantics(manifest,input,exclusive,1000);
  assert.equal(r.status,'collision');assert.equal(r.code,'SEMANTIC_COLLISION');
  assert.deepEqual(r.matrix.map(s=>s.admissible),[true,true,true,false]);
  assert.equal(r.ordinaryMaximumPayoutAtoms,'0');assert.equal(r.maximumVoidPayoutAtoms,'500000');
  assert.equal(r.expiresAt,1060);
});
test('OR and exactly one remain possible; inverse answers use the actual claim mask',()=>{
  for(const rule of ['OR','EXACTLY_ONE']){
    const {scope,mask}=encodeClaim({events:2,legs:[{event:0,yes:true},{event:1,yes:true}],rule});
    assert.equal(assessSemantics(manifest,{...input,scope,mask},exclusive).status,'no_declared_collision');
  }
  assert.equal(assessSemantics(manifest,{...input,mask:'2'},exclusive).status,'no_declared_collision');
});
test('same asset with different observation windows is never inferred exclusive from a title',()=>{
  const separate=registry([predicate(0,'gte','300000','eth:intraday-max'),predicate(1,'lt','250000','eth:close')]);
  assert.equal(assessSemantics(manifest,input,separate).matrix[3].admissible,true);
  const unknown=assessSemantics(manifest,input,[]);assert.equal(unknown.status,'unknown');assert.ok(unknown.matrix.every(s=>s.admissible));
});
test('integer boundary truth is exact, including negative thresholds and equality',()=>{
  for(const [a,b,value,collision] of [['gte','lte','0',false],['gt','lte','0',true],['eq','lt','-10',true],['eq','gte','-10',false]] as const){
    assert.equal(assessSemantics(manifest,input,registry([predicate(0,a,value),predicate(1,b,value)])).status==='collision',collision);
  }
});
test('client constraints, invalid scope, numeric amounts and mismatched rule bindings are refused',()=>{
  for(const change of [{predicates:[]},{quantityAtoms:1000000},{scope:4},{mask:'15'},{quantityAtoms:'0'}])assert.throws(()=>assessSemantics(manifest,{...input,...change},exclusive),{status:400});
  assert.throws(()=>assessSemantics({...manifest,rulesHash:'0x'+'3'.repeat(64)},input,exclusive),/match/);
  assert.throws(()=>registry([predicate(0,'approx','1')]),/predicate/);
  assert.throws(()=>registry([predicate(0,'lt','1'),predicate(0,'gt','2')]),/predicate/);
});
test('constraints outside selected scope are projected through the full pool',()=>{
  const three={...manifest,publication:{draft:{events:[{},{},{}]}}};
  const rules=registry([predicate(0,'gte','100'),predicate(1,'gte','200'),predicate(2,'gte','300')]);
  // A No AND C Yes is impossible, even with B unselected.
  assert.equal(assessSemantics(three,{...input,scope:5,mask:'4'},rules).status,'collision');
});
