import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pilotFixture,owner } from './pilot-fixture.ts';

test('directory and portfolio include multiple pools without a collection selector',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const f=pilotFixture(Math.floor(Date.now()/1000),4),namespace='practice-'+f.manifest.pool.slice(2),oldPool='0x'+'ab'.repeat(20),errors:string[]=[],calls:string[]=[];
  f.manifest.publication.mode='rehearsal';
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.addInitScript((owner:string)=>sessionStorage.setItem('flurbo.view-wallet:'+owner,owner),owner);
    page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.route('**/*',async(route:any)=>{
      const url=new URL(route.request().url()),path=url.pathname;
      if(path==='/api/account/wallets')return route.fulfill({json:{account:owner,wallets:[owner]}});
      if(path==='/api/account/access')return route.fulfill({json:{approved:true,testingTools:true}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:owner,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/market-directory')return route.fulfill({json:{schema:'flurbo.market-directory.v1',active:namespace,markets:[
        {namespace:'rehearsal',label:'September practice',pool:oldPool,closesAt:f.manifest.publication.draft.closesAt},
        {namespace,label:'October practice',pool:f.manifest.pool,closesAt:f.manifest.publication.draft.closesAt}]}});
      if(path.startsWith('/api/'+namespace+'/')||path.startsWith('/api/rehearsal/')){
        calls.push(path);const old=path.startsWith('/api/rehearsal/');
        if(path.endsWith('/markets')){const v=await f.service.markets();return route.fulfill({json:{...v,manifest:{...v.manifest,pool:old?oldPool:f.manifest.pool}}});}
        if(path.endsWith('/account')){const account=await f.service.account(owner);return route.fulfill({json:{...account,manifest:{...account.manifest,pool:old?oldPool:f.manifest.pool},claimScopes:[1]}});}
        if(path.endsWith('/positions'))return route.fulfill({json:{snapshot:{blockNumber:'100'},rows:route.request().postDataJSON().claims.map((c:any)=>({...c,quantity:c.scope===1&&c.mask==='2'?(old?'7000000':'3000000'):'0',payoutAtoms:null}))}});
        if(path.endsWith('/status'))return route.fulfill({json:await f.service.status()});
        if(path.endsWith('/history'))return route.fulfill({json:{complete:true,through:100,target:100,logs:[]}});
        return route.fulfill({status:503,json:{error:'Not used in fixture'}});
      }
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unexpected route'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/markets');await page.locator('.market-card').first().waitFor();
    assert.ok(calls.includes('/api/'+namespace+'/markets'));assert.ok(calls.includes('/api/rehearsal/markets'));
    await page.goto('https://flurbo.singu.online/portfolio');await page.getByRole('cell',{name:'3',exact:true}).waitFor();
    await page.getByRole('cell',{name:'7',exact:true}).waitFor();
    assert.equal(await page.getByRole('cell',{name:'3',exact:true}).count(),1);
    assert.equal(await page.getByLabel('Collection',{exact:true}).count(),0);
    assert.equal(await page.getByRole('region',{name:'Market results'}).count(),2);
    await page.reload();await page.getByRole('cell',{name:'7',exact:true}).waitFor();
    await page.getByRole('cell',{name:'3',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
