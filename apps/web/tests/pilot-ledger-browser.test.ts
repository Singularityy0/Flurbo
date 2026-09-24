import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pilotFixture, owner, hash } from './pilot-fixture.ts';

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
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:login,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/pilot/status')return route.fulfill({json:await fixture.service.status(owner)});
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
    await page.getByRole('cell',{name:'A YES AND B YES',exact:true}).waitFor();
    assert.equal(scans,2);
    assert.equal(await page.getByRole('textbox',{name:'Wallet to view'}).inputValue(),owner);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    fail=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Index service interrupted',{exact:true}).waitFor();
    const stopped=scans;await page.waitForTimeout(1800);assert.equal(scans,stopped);
    fail=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Activity indexed through the displayed checkpoint. Holdings are read directly from the pool.',{exact:true}).waitFor();
    assert.equal(scans,stopped+1);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
