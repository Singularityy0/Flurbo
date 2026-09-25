import assert from 'node:assert/strict';
import {test} from 'node:test';
import {request as httpRequest} from 'node:http';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {productionServer} from '../server/production.mjs';
import {DEFAULT_TESTING_OPERATOR, testingPages} from '../server/testing-access.mjs';
import {TESTNET} from '../server/network.mjs';

test('operator-only pages, assets and actions use the server session, while consumer trading and evidence remain accessible', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'flurbo-tools-'));
  await mkdir(join(dir,'privacy-lab','assets'),{recursive:true});
  await writeFile(join(dir,'index.html'),'app');
  await writeFile(join(dir,'privacy-lab','index.html'),'lab');
  await writeFile(join(dir,'privacy-lab','assets','test.js'),'lab script');
  let revoked=false,prepares=0;
  const store={read:async(id:string)=>id==='owner'&&!revoked?{address:DEFAULT_TESTING_OPERATOR,method:'passkey',expiresAt:Date.now()+60000}:id==='visitor'?{address:'0x'+'11'.repeat(20),method:'passkey'}:id==='wallet'?{address:DEFAULT_TESTING_OPERATOR,method:'wallet'}:null};
  const service={manifest:{},prepare:async(input:any)=>{prepares++;return input;}};
  const namespace='practice-'+'12'.repeat(20);
  const server=productionServer({origin:'https://flurbo.singu.online',rpcUrl:TESTNET.rpc,pilot:service,rehearsal:service,practiceCollections:{services:new Map([[namespace,service]])},pilotEvidence:{get:async()=>'{"public":true}'}},store,dir);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const port=(server.address() as any).port;
  const request=(path:string,id='',data?:any):Promise<any>=>new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port,path,method:data?'POST':'GET',headers:{Host:'flurbo.singu.online',Origin:'https://flurbo.singu.online','Content-Type':'application/json',Cookie:`flurbo_session=${id}; flurbo_tools=${id}`}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);
  });
  try{
    for(const page of [...testingPages,'/privacy-lab/','/privacy-lab/assets/test.js']){
      for(const id of ['', 'visitor', 'wallet', DEFAULT_TESTING_OPERATOR])assert.equal((await request(page,id)).status,404,page);
      const allowed=await request(page,'owner');assert.equal(allowed.status,200,page);assert.equal(allowed.headers['cache-control'],'no-store');
    }
    const access=await request('/api/account/access','owner');assert.equal(JSON.parse(access.text).testingTools,true);assert.match(access.headers['set-cookie'][0],/HttpOnly; SameSite=Strict; Path=\/;/);
    assert.equal(JSON.parse((await request('/api/account/access','visitor')).text).testingTools,false);
    for(const ns of ['pilot','rehearsal',namespace]){
      for(const action of ['assertOutcome','dispute','vote','finalize','deliver','withdrawBond']){
        assert.equal((await request(`/api/${ns}/prepare`,'visitor',{action,owner:DEFAULT_TESTING_OPERATOR})).status,403);
        assert.equal((await request(`/api/${ns}/prepare`,'owner',{action})).status,200);
      }
      for(const action of ['buy','sell','redeem'])assert.equal((await request(`/api/${ns}/prepare`,'visitor',{action})).status,200);
      assert.equal((await request(`/api/${ns}/evidence`,'visitor',{})).status,403);
      assert.equal((await request(`/api/${ns}/evidence/0x${'ab'.repeat(32)}`)).status,200);
    }
    assert.equal(prepares,27);
    for(const path of ['/api/evidence-beta','/api/learning/comparison','/api/learning/pool','/api/kuru','/api/kuru-scan'])assert.equal((await request(path,'visitor')).status,403);
    assert.equal((await request('/fund','visitor')).status,200);
    assert.equal((await request('/rehearsal-rules')).status,200);
    revoked=true;assert.equal((await request('/privacy-lab/','owner')).status,404);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
