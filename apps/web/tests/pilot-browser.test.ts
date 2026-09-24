import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pilotFixture, owner, hash, code } from './pilot-fixture.ts';

for(const namespace of ['pilot','rehearsal'] as const) test(namespace+' flow keeps auth, review, wallet confirmation and reload tracking separate on desktop and mobile',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const loginAddress='0x'+'99'.repeat(20);
  const f=pilotFixture();
  f.manifest.publication.reviewerControl='single-operator';
  if(namespace==='rehearsal'){f.manifest.publication.mode='rehearsal';f.manifest.publication.draft.title='Public rehearsal: scripted settlement checks';}
  let login=true,reads=0;const errors:string[]=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',(error:Error)=>errors.push(error.message));
    await page.addInitScript(({owner,hash,code,namespace}:any)=>{
      (window as any).ethereum={request:async({method}:any)=>{
        if(['eth_accounts','eth_requestAccounts'].includes(method))return[owner];
        if(method==='eth_chainId')return'0x279f';
        if(method==='eth_getBlockByNumber')return{number:'0x65',hash};
        if(method==='eth_getCode')return code;
        if(method==='eth_call')return'0x';
        if(method==='eth_estimateGas')return'0x186a0';
        if(method==='eth_gasPrice')return'0x3b9aca00';
        if(method==='eth_getBalance')return'0xde0b6b3a7640000';
        if(method==='eth_getTransactionCount')return 121;
        if(method==='eth_sendTransaction'){
          const pending=JSON.parse(localStorage.getItem('flurbo.'+namespace+'.pending.v1')||'null');
          if(!pending||pending.hash!==null)throw new Error('Pending intent must be stored first');
          sessionStorage.setItem('pilot.sends',String(Number(sessionStorage.getItem('pilot.sends')||0)+1));return hash;
        }
        throw new Error(method);
      }};
    },{owner,hash,code,namespace});
    await page.route('**/*',async(route:any)=>{
      const url=new URL(route.request().url()),path=url.pathname;
      if(path==='/api/auth/session')return route.fulfill({json:{session:login?{address:loginAddress,method:'passkey',expiresAt:Date.now()+3600_000}:null}});
      if(path==='/api/'+namespace+'/status'){reads++;return route.fulfill({json:await f.service.status(url.searchParams.get('wallet')||undefined)});}
      if(path==='/api/'+namespace+'/prepare')return route.fulfill({json:await f.service.prepare(route.request().postDataJSON())});
      if(path==='/api/'+namespace+'/position')return route.fulfill({json:{quantity:'1000000',payoutAtoms:null}});
      if(path==='/api/'+namespace+'/rpc'){
        const request=route.request().postDataJSON();
        const saved=await page.evaluate((namespace:string)=>JSON.parse(localStorage.getItem('flurbo.'+namespace+'.pending.v1')||'null'),namespace);
        if(request.method==='eth_getTransactionReceipt'){f.options.allowance=1_000_000n;return route.fulfill({json:{result:{transactionHash:hash,blockNumber:'0x64',blockHash:hash,status:'0x1'}}});}
        if(request.method==='eth_getTransactionByHash')return route.fulfill({json:{result:{...saved.review.transaction,hash,chainId:'0x279f',blockNumber:'0x64',blockHash:hash,input:saved.review.transaction.data,nonce:saved.nonce}}});
        return route.fulfill({json:{result:request.method==='eth_chainId'?'0x279f':{hash,number:'0x65'}}});
      }
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unavailable fixture service'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/'+(namespace==='pilot'?'events':'rehearsal'));
    await page.getByRole('heading',{name:'Operator-run testnet alpha'}).waitFor();
    await page.getByLabel('Signing wallet',{exact:true}).selectOption('0');
    await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
    await page.getByText('Wallet connected. Review and confirm each action separately.').waitFor();
    assert.equal(await page.evaluate((key:string)=>sessionStorage.getItem(key),'flurbo.view-wallet:'+loginAddress),owner);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('flurbo.trading.market')),namespace);
    await page.getByRole('button',{name:'Review buy',exact:true}).click();
    await page.getByRole('button',{name:'Confirm in wallet',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('pilot.sends')),null);
    if(process.env.FLURBO_TEST_SCREENSHOT)await page.screenshot({path:process.env.FLURBO_TEST_SCREENSHOT,fullPage:true});
    await page.getByRole('button',{name:'Confirm in wallet',exact:true}).click();
    await page.getByText('Submitted. Check confirmation before another action.').waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('pilot.sends')),'1');
    await page.reload();await page.getByRole('heading',{name:'Follow your transaction.'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Review buy',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Check confirmation',exact:true}).click();
    await page.getByRole('button',{name:'Review approved buy',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('pilot.sends')),'1');
    // Reload keeps transaction tracking but deliberately requires reconnecting the signer.
    await page.getByLabel('Signing wallet',{exact:true}).selectOption('0');
    await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
    await page.getByText('Wallet connected. Review and confirm each action separately.').waitFor();
    await page.getByRole('button',{name:'Review approved buy',exact:true}).click();
    await page.getByRole('heading',{name:'Buy shares',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('pilot.sends')),'1');
    await page.getByRole('button',{name:'Confirm in wallet',exact:true}).click();
    await page.getByRole('button',{name:'Check confirmation',exact:true}).click();
    await page.getByText('Exact transaction confirmed. Balances refreshed.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('pilot.sends')),'2');
    await page.getByText('1 shares held. Settlement pending.',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.FLURBO_TEST_SCREENSHOT)await page.screenshot({path:process.env.FLURBO_TEST_SCREENSHOT.replace('.png','-mobile.png'),fullPage:true});
    login=false;const before=reads;await page.goto('https://flurbo.singu.online/'+(namespace==='pilot'?'events':'rehearsal'));await page.waitForURL('**/login');assert.equal(reads,before);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
