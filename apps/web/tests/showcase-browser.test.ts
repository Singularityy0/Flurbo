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
  const requests:string[]=[];let signedIn=false;
  try{
    const page=await browser.newPage();
    await page.route('**/*',async(route:any)=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/auth/session')return route.fulfill({json:{session:signedIn?{address:owner,method:'passkey',expiresAt:Date.now()+3600000}:null}});
      if(path==='/api/account/access')return route.fulfill({json:{testingTools:false}});
      if(path==='/api/practice-collections')return route.fulfill({json:{schema:'flurbo.practice-collections.v1',active:ns,collections:[{namespace:ns,label:'Showcase v0',pool:showcase.pool,closesAt:now+14400},{namespace:old,label:'October practice',pool:october.pool,closesAt:now+86400}]}});
      if(path.endsWith('/markets')&&path.startsWith('/api/')){requests.push(path);return route.fulfill({json:{manifest:path.includes(old)?october:showcase,snapshot:{timestamp:now,blockNumber:'100'},open:true,prices:[0,1,2,3].map(event=>({event,yes:'512495',no:'512495'}))}});}
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unavailable fixture'}});
      const file=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+file,import.meta.url)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await mkdir(new URL('../../../target/showcase-ui/',import.meta.url),{recursive:true});
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:950});await page.goto('https://flurbo.singu.online/');
      await page.getByRole('button',{name:'Goes live',exact:true}).click();assert.match(await page.locator('.home-example-result').innerText(),/73.3/);
      await page.getByRole('button',{name:'Doesn’t go live',exact:true}).click();assert.match(await page.locator('.home-example-result').innerText(),/25.7/);
      assert.equal(await page.getByRole('link',{name:'Start exploring',exact:true}).first().getAttribute('href'),'/signup');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:new URL(`../../../target/showcase-ui/home-${width}.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
    }
    signedIn=true;await page.goto('https://flurbo.singu.online/markets');await page.getByRole('heading',{name:'Showcase v0',exact:true}).waitFor();
    assert.equal(await page.getByText('Scripted practice events.',{exact:false}).count(),0);
    await page.getByLabel('Collection',{exact:true}).selectOption(old);await page.getByRole('heading',{name:'October practice',exact:true}).waitFor();
    await page.getByRole('heading',{name:'Test event 1',exact:true}).waitFor();assert.ok(requests.includes(`/api/${old}/markets`));
    await page.reload();await page.getByRole('heading',{name:'October practice',exact:true}).waitFor();
    await page.getByLabel('Collection',{exact:true}).selectOption(ns);await page.getByRole('heading',{name:'Will Ethereum fill at least 75% of a block?',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Collection',{exact:true}).inputValue(),ns);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:new URL('../../../target/showcase-ui/markets-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  }finally{await browser.close();}
});
