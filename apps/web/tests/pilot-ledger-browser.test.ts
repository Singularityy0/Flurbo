import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pilotFixture, owner, hash } from './pilot-fixture.ts';

test('combined shares appear in a fresh browser before history responds, with no saved trade hints',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const f=pilotFixture(Math.floor(Date.now()/1000),4),login='0x'+'99'.repeat(20),errors:string[]=[],batches:any[]=[];
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.addInitScript(({login,owner}:any)=>{sessionStorage.setItem('flurbo.trading.market','rehearsal');sessionStorage.setItem('flurbo.view-wallet:'+login,owner);},{login,owner});
    await page.route('**/*',async(route:any)=>{
      const url=new URL(route.request().url()),path=url.pathname;
      if(path==='/api/practice-collections')return route.fulfill({json:{schema:'flurbo.practice-collections.v1',active:'rehearsal',collections:[{namespace:'rehearsal',label:'September practice',pool:f.manifest.pool,closesAt:f.manifest.publication.draft.closesAt}]}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:login,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/rehearsal/account')return route.fulfill({json:{...await f.service.account(url.searchParams.get('wallet')),claimScopes:[1,2,3]}});
      if(path==='/api/rehearsal/history'){await gate;return route.fulfill({status:503,json:{error:'History unavailable'}}).catch(()=>{});}
      if(path==='/api/rehearsal/positions'){
        const input=route.request().postDataJSON();batches.push(input);
        return route.fulfill({json:{snapshot:{blockNumber:'200'},rows:input.claims.map((c:any)=>({...c,quantity:input.owner===owner&&c.scope===3&&c.mask==='8'?'10000000':'0',payoutAtoms:null}))}});
      }
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unexpected API'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/portfolio');
    const combined=page.getByRole('cell').filter({has:page.getByText('Test event 1 + Test event 2',{exact:true})});
    await combined.locator('strong').getByText('Test event 1 + Test event 2',{exact:true}).waitFor();
    await combined.locator('small').getByText('Yes AND Yes',{exact:true}).waitFor();
    await page.getByRole('cell',{name:'10',exact:true}).waitFor();
    assert.equal(batches.length,1);assert.equal(batches[0].claims.length,16);
    assert.equal(await page.getByRole('button',{name:'Stop loading',exact:true}).count(),1);
    assert.equal(await page.evaluate(()=>localStorage.length),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    // Other traders' active scopes must not be displayed as this wallet's holdings.
    await page.getByRole('textbox',{name:'Wallet to view'}).fill(login);await page.getByRole('button',{name:'View wallet',exact:true}).click();
    await page.getByText('No shares in the claims checked so far. Combinations may still be loading.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('cell',{name:'10',exact:true}).count(),0);
    release();assert.deepEqual(errors,[]);
  }finally{release();await browser.close();}
});

test('pilot portfolio loads remembered wallet and catches up without repeat clicks; errors pause scans',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const fixture=pilotFixture();let scans=0,fail=false;
  const login='0x'+'99'.repeat(20),errors:string[]=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.addInitScript(({login,owner}:any)=>{sessionStorage.setItem('flurbo.trading.market','pilot');sessionStorage.setItem('flurbo.view-wallet:'+login,owner);},{login,owner});
    await page.route('**/*',async(route:any)=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/practice-collections')return route.fulfill({json:{schema:'flurbo.practice-collections.v1',active:'rehearsal',collections:[{namespace:'rehearsal',label:'September practice',pool:fixture.manifest.pool,closesAt:fixture.manifest.publication.draft.closesAt}]}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:login,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/pilot/account')return route.fulfill({json:await fixture.service.account(owner)});
      if(path==='/api/pilot/history'){
        scans++;if(fail)return route.fulfill({status:503,json:{error:'Index service interrupted'}});
        return route.fulfill({json:{through:scans===1?100:200,target:200,complete:scans>1,logs:scans===1?[]:[{name:'Traded',hash,index:0,block:150,args:{trader:owner,scope:3,mask:'8',isBuy:true}}]}});
      }
      if(path==='/api/pilot/positions')return route.fulfill({json:{rows:route.request().postDataJSON().claims.map((c:any)=>({...c,quantity:c.scope===3?'1000000':'0',payoutAtoms:null}))}});
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Fixture service unavailable'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/portfolio');
    await page.getByRole('button',{name:'Pause loading'}).waitFor();
    await page.getByText('Test event 1 + Test event 2',{exact:true}).waitFor();
    assert.equal(scans,2);
    assert.equal(await page.getByRole('textbox',{name:'Wallet to view'}).inputValue(),owner);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    fail=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Trade history is temporarily unavailable. Your holdings are loaded separately. Retry shortly.',{exact:true}).waitFor();
    await page.getByText('Test event 1 + Test event 2',{exact:true}).waitFor();
    const stopped=scans;await page.waitForTimeout(1800);assert.equal(scans,stopped);
    fail=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByRole('button',{name:'Refresh',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.body.textContent?.includes('Trade history is temporarily unavailable'));
    assert.equal(scans,stopped+1);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('practice history outage still shows owned shares; recovery shows the bet and wallet changes clear prior holdings',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const fixture=pilotFixture(Math.floor(Date.now()/1000),4),login='0x'+'99'.repeat(20);
  let failHistory=true,failAccount=false,scans=0;
  const errors:string[]=[],requests:string[]=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.addInitScript(({login,owner}:any)=>{sessionStorage.setItem('flurbo.trading.market','rehearsal');sessionStorage.setItem('flurbo.view-wallet:'+login,owner);},{login,owner});
    await page.route('**/*',async(route:any)=>{
      const url=new URL(route.request().url()),path=url.pathname;requests.push(path);
      if(path==='/api/practice-collections')return route.fulfill({json:{schema:'flurbo.practice-collections.v1',active:'rehearsal',collections:[{namespace:'rehearsal',label:'September practice',pool:fixture.manifest.pool,closesAt:fixture.manifest.publication.draft.closesAt}]}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:login,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/rehearsal/account')return failAccount?route.fulfill({status:503,json:{error:'Account unavailable'}}):route.fulfill({json:await fixture.service.account(url.searchParams.get('wallet'))});
      if(path==='/api/rehearsal/history'){
        scans++;if(failHistory)return route.fulfill({status:503,json:{error:'History unavailable'}});
        return route.fulfill({json:{through:200,target:200,complete:true,logs:[{name:'Traded',hash,index:0,block:150,args:{trader:owner,scope:1,mask:'2',isBuy:true,quantity:'10000000',collateralAmount:'6201146'}}]}});
      }
      if(path==='/api/rehearsal/positions'){
        const input=route.request().postDataJSON();
        return route.fulfill({json:{snapshot:{blockNumber:'200'},rows:input.claims.map((c:any)=>({...c,quantity:input.owner===owner&&c.scope===1&&c.mask==='2'?'10000000':'0',payoutAtoms:null}))}});
      }
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unexpected API'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/history');
    await page.getByRole('cell',{name:'10',exact:true}).waitFor();
    await page.getByText('Test event 1',{exact:true}).waitFor();
    assert.match(await page.locator('body').innerText(),/history is temporarily unavailable/);
    assert.doesNotMatch(await page.locator('body').innerText(),/No indexed activity/);
    await page.getByRole('button',{name:'Refresh',exact:true}).waitFor();
    const stopped=scans;await page.waitForTimeout(1800);assert.equal(scans,stopped);
    failHistory=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Bought',{exact:true}).waitFor();
    await page.getByRole('cell',{name:'6.201146',exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'View transaction',exact:true}).getAttribute('href'),'https://testnet.monadscan.com/tx/'+hash);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.FLURBO_TEST_SCREENSHOT) await page.screenshot({path:process.env.FLURBO_TEST_SCREENSHOT,fullPage:true});
    await page.goto('https://flurbo.singu.online/portfolio');
    await page.getByRole('cell',{name:'10',exact:true}).waitFor();
    await page.getByRole('button',{name:'Refresh',exact:true}).waitFor();
    failAccount=true;await page.getByRole('textbox',{name:'Wallet to view'}).fill(login);await page.getByRole('button',{name:'View wallet',exact:true}).click();
    await page.getByText('Wallet details could not be refreshed. Retry shortly.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('cell',{name:'10',exact:true}).count(),0);
    failAccount=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('No shares in the claims checked on this page.',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);assert.ok(requests.every(p=>!p.endsWith('/prepare')&&!p.endsWith('/rpc')));
  }finally{await browser.close();}
});

test('switch wallets during pending reads; late replies cannot overwrite the new wallet',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const fixture=pilotFixture(),login='0x'+'99'.repeat(20),other='0x'+'aa'.repeat(20);
  let scans=0,heldPosition=false,holdAccount=false,releaseOld!:()=>void,releaseAccount!:()=>void;
  const oldGate=new Promise<void>(r=>releaseOld=r),accountGate=new Promise<void>(r=>releaseAccount=r),errors:string[]=[];
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.addInitScript(({login,owner}:any)=>{
      sessionStorage.setItem('flurbo.trading.market','rehearsal');sessionStorage.setItem('flurbo.view-wallet:'+login,owner);
      // Deliver late replies despite cancellation to exercise the generation guard too.
      const original=window.fetch;(window as any).cancelledReads=0;
      window.fetch=(input,options)=>{
        if(String(input).startsWith('/api/rehearsal/')){
          options?.signal?.addEventListener('abort',()=>{(window as any).cancelledReads++;},{once:true});
          return original(input,{...options,signal:undefined});
        }
        return original(input,options);
      };
    },{login,owner});
    await page.route('**/*',async(route:any)=>{
      const url=new URL(route.request().url()),path=url.pathname;
      if(path==='/api/practice-collections')return route.fulfill({json:{schema:'flurbo.practice-collections.v1',active:'rehearsal',collections:[{namespace:'rehearsal',label:'September practice',pool:fixture.manifest.pool,closesAt:fixture.manifest.publication.draft.closesAt}]}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:login,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/rehearsal/account'){
        const address=url.searchParams.get('wallet')!;if(holdAccount&&address===login)await accountGate;
        return route.fulfill({json:await fixture.service.account(address)});
      }
      if(path==='/api/rehearsal/history'){
        if(++scans===1)await oldGate;
        return route.fulfill({json:{through:200,target:200,complete:true,logs:[]}});
      }
      if(path==='/api/rehearsal/positions'){
        const input=route.request().postDataJSON();if(input.owner===owner){heldPosition=true;await oldGate;}
        return route.fulfill({json:{snapshot:{blockNumber:'200'},rows:input.claims.map((c:any)=>({...c,quantity:c.scope===1&&c.mask==='2'?(input.owner===owner?'10000000':input.owner===login?'3000000':'7000000'):'0',payoutAtoms:null}))}});
      }
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unexpected API'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/portfolio');
    for(let n=0;!heldPosition&&n<200;n++)await page.waitForTimeout(10);assert.equal(heldPosition,true);
    assert.equal(await page.getByRole('textbox',{name:'Wallet to view'}).isEnabled(),true);
    assert.equal(await page.getByRole('button',{name:'View wallet',exact:true}).isEnabled(),true);
    await page.getByRole('textbox',{name:'Wallet to view'}).fill(login);await page.getByRole('button',{name:'View wallet',exact:true}).click();
    await page.getByRole('cell',{name:'3',exact:true}).waitFor();releaseOld();await page.waitForTimeout(100);
    assert.equal(await page.getByRole('cell',{name:'10',exact:true}).count(),0);
    assert.ok(await page.evaluate(()=>(window as any).cancelledReads)>=2);
    holdAccount=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByRole('button',{name:'Stop loading',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Wallet to view'}).fill(other);
    await page.getByRole('button',{name:'View wallet',exact:true}).click();
    await page.getByRole('cell',{name:'7',exact:true}).waitFor();releaseAccount();await page.waitForTimeout(100);
    assert.equal(await page.getByRole('cell',{name:'3',exact:true}).count(),0);
    assert.equal(await page.locator('.portfolio-address').innerText(),'Showing '+other);
    assert.equal(await page.evaluate((login:string)=>sessionStorage.getItem('flurbo.view-wallet:'+login),login),other);
    assert.deepEqual(errors,[]);
  }finally{releaseOld();releaseAccount();await browser.close();}
});

test('automatic catch-up stops after five batches; Stop loading cancels an active read',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const fixture=pilotFixture();let scans=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
  try{
    const page=await browser.newPage();await page.addInitScript((owner:string)=>{sessionStorage.setItem('flurbo.trading.market','rehearsal');sessionStorage.setItem('flurbo.view-wallet:'+owner,owner);},owner);
    await page.route('**/*',async(route:any)=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/practice-collections')return route.fulfill({json:{schema:'flurbo.practice-collections.v1',active:'rehearsal',collections:[{namespace:'rehearsal',label:'September practice',pool:fixture.manifest.pool,closesAt:fixture.manifest.publication.draft.closesAt}]}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:owner,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/rehearsal/account')return route.fulfill({json:await fixture.service.account(owner)});
      if(path==='/api/rehearsal/positions')return route.fulfill({json:{snapshot:{blockNumber:'200'},rows:[]}});
      if(path==='/api/rehearsal/history'){
        const call=++scans;if(call===6)await gate;
        return route.fulfill({json:{through:call*100,target:10000,complete:false,logs:[]}}).catch(()=>{});
      }
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unexpected API'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/history');
    await page.getByRole('button',{name:'Continue loading',exact:true}).waitFor();
    assert.equal(scans,5);await page.waitForTimeout(1800);assert.equal(scans,5);
    await page.getByRole('button',{name:'Continue loading',exact:true}).click();
    for(let n=0;scans<6&&n<200;n++)await page.waitForTimeout(10);assert.equal(scans,6);
    await page.getByRole('button',{name:'Stop loading',exact:true}).click();
    await page.getByRole('button',{name:'Refresh',exact:true}).waitFor();release();
    await page.waitForTimeout(1800);assert.equal(scans,6);
    assert.doesNotMatch(await page.locator('body').innerText(),/temporarily unavailable|could not be refreshed/);
    assert.match(await page.locator('body').innerText(),/History checked through block 500/);
    await page.getByRole('button',{name:'Continue loading',exact:true}).click();
    await page.getByText('History checked through block 700.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Pause loading',exact:true}).click();
  }finally{release();await browser.close();}
});
