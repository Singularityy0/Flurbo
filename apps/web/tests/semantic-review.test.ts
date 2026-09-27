import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pilotFixture,owner} from './pilot-fixture.ts';
import {assessSemantics,semanticRegistry} from '../server/semantic-validation.mjs';
import {validatePurchaseSemantics,semanticAcknowledgment} from '../src/pilot.ts';

test('manual exception is explicit, claim bound and invalidated when rules change',async(t)=>{
  const f=pilotFixture(),claim={scope:3,mask:'8',quantityAtoms:'1000000'};
  const registry=semanticRegistry(JSON.stringify({schema:'flurbo.semantic-rules.v1',markets:[{pool:f.manifest.pool,rulesHash:f.manifest.rulesHash,predicates:[
    {event:0,observation:'same:close',operator:'gte',value:'3000',sourceRule:'Test only: same closing observation.'},
    {event:1,observation:'same:close',operator:'lt',value:'2500',sourceRule:'Test only: same closing observation.'}]}]}));
  const assessment=assessSemantics(f.manifest,claim,registry);
  const review={...await f.service.prepare({owner,action:'buy',scope:3,mask:'8',quantity:'1000000',slippageBps:50}),semanticAssessment:assessment};
  let response=assessment;
  t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{assert.equal(url,'/api/pilot/validate-trade');assert.deepEqual(JSON.parse(options.body),claim);return Response.json(response);});
  await assert.rejects(validatePurchaseSemantics(review,'pilot'),/cannot win/);
  await assert.rejects(validatePurchaseSemantics(review,'pilot',{rulesDigest:assessment.rulesDigest,phrase:'yes'}),/cannot win/);
  await validatePurchaseSemantics(review,'pilot',{rulesDigest:assessment.rulesDigest,phrase:semanticAcknowledgment});
  response={...assessment,rulesDigest:'f'.repeat(64)};
  await assert.rejects(validatePurchaseSemantics(review,'pilot',{rulesDigest:assessment.rulesDigest,phrase:semanticAcknowledgment}),/cannot win/);
  response={...assessment,quantityAtoms:'2000000'};
  await assert.rejects(validatePurchaseSemantics(review,'pilot',{rulesDigest:assessment.rulesDigest,phrase:semanticAcknowledgment}),/unavailable/);
  // Sale and redemption are recovery paths and never need an override.
  for(const action of ['sell','redeem'])await validatePurchaseSemantics({...review,requested:{...review.requested,action}},'pilot');
});
