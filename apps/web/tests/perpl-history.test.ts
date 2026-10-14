import test from 'node:test';
import assert from 'node:assert/strict';
import * as ed from '@noble/ed25519';
import { restHeaders,historyPages,performance,drawdown } from '../src/perpl-history.ts';

const key={token:'test-key',secret:new Uint8Array(32).fill(7)};
test('REST signature binds exact path, query, chain and empty body',async()=>{
  const target='/v1/trading/fills?count=100&page=a%2Bb',headers=await restHeaders(key,target,123,'nonce');
  const canonical=['10143','GET',target,'123','nonce','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'].join('\n');
  assert.equal(await ed.verifyAsync(Buffer.from(headers['X-API-Signature'],'base64url'),new TextEncoder().encode(canonical),await ed.getPublicKeyAsync(key.secret)),true);
  await assert.rejects(restHeaders(key,'/v1/trading/order'),/Unsupported/);
});
test('history follows encoded cursors, deduplicates pages and bounds requests',async()=>{
  const paths:string[]=[];
  const result=await historyPages(key,'fills',undefined,null,async(_key,path)=>{
    paths.push(path);return {d:[{acc:1,oid:2,at:{b:1,tx:0,l:1}}],np:paths.length===1?'a+b':''};
  });
  assert.equal(paths[1],'/v1/trading/fills?count=100&page=a%2Bb');assert.equal(result.rows.length,1);assert.equal(result.complete,true);
  let count=0;
  const partial=await historyPages(key,'fills',undefined,null,async()=>({d:[],np:String(++count)}));
  assert.equal(count,10);assert.equal(partial.complete,false);assert.equal(partial.next,'10');
  await assert.rejects(historyPages(key,'fills',undefined,null,async()=>({d:[],np:'same'})),/repeated/);
  const controller=new AbortController();controller.abort();await assert.rejects(historyPages(key,'fills',controller.signal),{name:'AbortError'});
});
test('performance deduplicates exit events, includes funding and fees and excludes entries',()=>{
  const win={acc:1,mkt:2,pid:3,sr:13,dpnl:'10000000',fnd:'1000000',fee:'2000000',at:{t:3600000,b:2,tx:1,l:0},ots:{t:0}};
  const loss={...win,pid:4,dpnl:'-3000000',fnd:'0',fee:'1000000',at:{t:7200000,b:3,tx:1,l:0}};
  const p=performance([win,win,loss,{...win,sr:18}]);
  assert.equal(p.exits,2);assert.equal(p.total,'5000000');assert.equal(p.winRate,50);assert.equal(p.profitFactor,2.25);assert.equal(p.bestLoss,1);assert.equal(p.holdMs,5400000);
  assert.deepEqual(drawdown([{t:1,v:'100000000'},{t:2,v:'120000000'},{t:3,v:'90000000'}]),{amount:'30000000',percent:25});
});
