import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {pilotFixture,owner} from './pilot-fixture.ts';
import {ACTIVITY_METRICS,activityEvent} from '../shared/ethereum-activity.mjs';

test('landing example and collection switch work on desktop and mobile without losing October', {skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const now=Math.floor(Date.now()/1000),f=pilotFixture(now,4),october=structuredClone(f.manifest),showcase=structuredClone(f.manifest);
  october.publication.mode='rehearsal';october.pool='0x'+'aa'.repeat(20);
  showcase.publication.mode='ethereum-activity';showcase.publication.draft.title='Showcase v0';showcase.publication.draft.events=ACTIVITY_METRICS.map(m=>activityEvent(m,now+14520));
  const ns=`practice-${showcase.pool.slice(2)}`,old=`practice-${october.pool.slice(2)}`;
  const requests:string[]=[];let signedIn=false,roundClose=now+14400,statusUnavailable=false,evidencePublished=false;
  try{
    const page=await browser.newPage();
    await page.route('**/*',async(route:any)=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/healthz')return route.fulfill(statusUnavailable?{status:503,json:{error:'Unavailable'}}:{json:{service:'flurbo',practice_collections:{active:ns,configured:[{namespace:ns,closesAt:roundClose}]}}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:signedIn?{address:owner,method:'passkey',expiresAt:Date.now()+3600000}:null}});
      if(path==='/api/account/access')return route.fulfill({json:{testingTools:false}});
      if(path==='/api/practice-collections')return route.fulfill({json:{schema:'flurbo.practice-collections.v1',active:ns,collections:[{namespace:ns,label:'Showcase v0',pool:showcase.pool,closesAt:now+14400},{namespace:old,label:'October practice',pool:october.pool,closesAt:now+86400}]}});
      if(path===`/api/${ns}/status`){const state=await f.service.status();if(evidencePublished)state.cases[0].evidenceHash='0x'+'ab'.repeat(32);return route.fulfill({json:{...state,manifest:showcase}});}
      if(path.endsWith('/markets')&&path.startsWith('/api/')){requests.push(path);return route.fulfill({json:{manifest:path.includes(old)?october:showcase,snapshot:{timestamp:now,blockNumber:'100'},open:true,prices:[0,1,2,3].map(event=>({event,yes:'512495',no:'512495'}))}});}
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unavailable fixture'}});
      const file=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+file,import.meta.url)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await mkdir(new URL('../../../target/showcase-ui/',import.meta.url),{recursive:true});
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:950});await page.goto('https://flurbo.singu.online/');
      await page.getByRole('button',{name:'Goes live',exact:true}).click();assert.match(await page.locator('.home-example-result').innerText(),/73.3/);
      await page.getByText('Current round: trading window open',{exact:true}).waitFor();
      assert.equal(await page.getByText('Public trading is not available here yet.',{exact:false}).count(),0);
      await page.getByRole('button',{name:'Doesn’t go live',exact:true}).click();assert.match(await page.locator('.home-example-result').innerText(),/25.7/);
      assert.equal(await page.getByRole('link',{name:'Start exploring',exact:true}).first().getAttribute('href'),'/signup');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:new URL(`../../../target/showcase-ui/home-${width}.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
    }
    roundClose=now-60;await page.reload();await page.getByText('Current round: trading closed',{exact:true}).waitFor();
    assert.match(await page.getByRole('region',{name:'Preview availability'}).innerText(),/Buying is closed for this round/);
    await page.getByRole('region',{name:'Preview availability'}).getByRole('link',{name:'Browse markets'}).click();
    await page.waitForURL('**/login');
    statusUnavailable=true;await page.goto('https://flurbo.singu.online/');await page.getByText('Round status temporarily unavailable',{exact:true}).waitFor();
    assert.equal(await page.getByRole('region',{name:'Preview availability'}).getByRole('link',{name:'Portfolio'}).getAttribute('href'),'/portfolio');
    statusUnavailable=false;roundClose=now+14400;await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByText('Current round: trading window open',{exact:true}).waitFor();
    signedIn=true;await page.goto('https://flurbo.singu.online/markets');await page.getByRole('heading',{name:'Showcase v0',exact:true}).waitFor();
    assert.equal(await page.getByText('Scripted practice events.',{exact:false}).count(),0);
    await page.getByLabel('Collection',{exact:true}).selectOption(old);await page.getByRole('heading',{name:'October practice',exact:true}).waitFor();
    await page.getByRole('heading',{name:'Test event 1',exact:true}).waitFor();assert.ok(requests.includes(`/api/${old}/markets`));
    await page.reload();await page.getByRole('heading',{name:'October practice',exact:true}).waitFor();
    await page.getByLabel('Collection',{exact:true}).selectOption(ns);await page.getByRole('heading',{name:'Will the selected Ethereum block be at least 75% full?',exact:true}).waitFor();
    for(const title of ['Will the selected Ethereum block contain at least 150 transactions?','Will the selected Ethereum block have a higher base fee than the previous block?','Will the selected Ethereum block include at least 3 data blobs?'])await page.getByRole('heading',{name:title,exact:true}).waitFor();
    await page.getByText('Yes if the block uses at least 75% of its gas limit. Fullness measures gas used, not the number of transactions.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Collection',{exact:true}).inputValue(),ns);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:new URL('../../../target/showcase-ui/markets-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
    await page.getByRole('button',{name:'View market',exact:true}).first().click();
    const source=page.getByRole('region',{name:'Which Ethereum block',exact:true});
    await source.waitFor();
    assert.equal(await source.locator('time').getAttribute('datetime'),new Date((now+14520)*1000).toISOString());
    assert.match(await source.innerText(),/No assertion evidence is published/);
    assert.equal(await page.getByRole('link',{name:'View source ↗',exact:true}).count(),0);
    await source.getByText('How the block is checked',{exact:true}).click();
    assert.equal(await source.getByRole('link',{name:'Ethereum API documentation ↗',exact:true}).getAttribute('href'),'https://ethereum.org/developers/docs/apis/json-rpc/');
    assert.match(await source.innerText(),/not evidence of this market’s result/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    evidencePublished=true;await page.reload();
    const evidence=page.getByRole('link',{name:'View published assertion evidence ↗',exact:true});
    await evidence.waitFor();assert.equal(await evidence.getAttribute('href'),`/api/${ns}/evidence/0x${'ab'.repeat(32)}`);
  }finally{await browser.close();}
});
