import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {encodeAbiParameters,encodeEventTopics,decodeFunctionData} from 'viem';
import {pilotPoolAbi} from '../shared/pilot.mjs';
import {alice,origin,setup} from './agent-fixture.ts';
import {owner,hash,code} from './pilot-fixture.ts';

// End to end: the real agent API and strategy run in-process over the pilot fixture; the browser drives the
// real UI with a fake MetaMask. Nothing reaches a network, and every MetaMask send is counted.
test('agent flow: create, forecast, paper trade, then user-approved purchase with rejection, wallet switch and reload recovery',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const at=Math.floor(Date.now()/1000),s=setup({at}),pool=s.f.manifest.pool,errors:string[]=[];
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1000}});
    page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.addInitScript(({owner,hash,code}:any)=>{
      const listeners:Record<string,(()=>void)[]>={};let account=owner;
      (window as any).__switchAccount=(next:string)=>{account=next;(listeners.accountsChanged||[]).forEach(f=>f());};
      (window as any).ethereum={isMetaMask:true,on:(e:string,f:()=>void)=>{(listeners[e]??=[]).push(f);},removeListener:(e:string,f:()=>void)=>{listeners[e]=(listeners[e]||[]).filter(x=>x!==f);},
        request:async({method}:any)=>{
          if(['eth_accounts','eth_requestAccounts'].includes(method))return[account];
          if(method==='eth_chainId')return'0x279f';
          if(method==='eth_getBlockByNumber')return{number:'0x65',hash};
          if(method==='eth_getCode')return code;
          if(method==='eth_call')return'0x';
          if(method==='eth_estimateGas')return'0x186a0';
          if(method==='eth_gasPrice')return'0x3b9aca00';
          if(method==='eth_getBalance')return'0xde0b6b3a7640000';
          if(method==='eth_getTransactionCount')return 7;
          if(method==='eth_sendTransaction'){
            if(sessionStorage.getItem('reject')){sessionStorage.removeItem('reject');throw Object.assign(Error('Rejected'),{code:4001});}
            const pending=JSON.parse(localStorage.getItem('flurbo.pilot.pending.v1')||'null');
            if(!pending||pending.hash!==null)throw Error('Missing saved intent');
            const n=Number(sessionStorage.getItem('sends')||0)+1;sessionStorage.setItem('sends',String(n));
            return '0x'+String(n).padStart(2,'0').repeat(32);
          }
          throw Error(method);
        }};
    },{owner,hash,code});
    await page.route('**/*',async(route:any)=>{
      const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:alice,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/account/access')return route.fulfill({json:{approved:true,testingTools:false}});
      if(path==='/api/market-directory')return route.fulfill({json:{schema:'flurbo.market-directory.v1',markets:[{namespace:'pilot',label:'Release fixture',pool,closesAt:s.f.manifest.publication.draft.closesAt}]}});
      if(path==='/api/account/wallets')return route.fulfill({json:{account:alice,wallets:[owner]}});
      if(path==='/api/pilot/markets')return route.fulfill({json:await s.f.service.markets()});
      if(path==='/api/agents'||path.startsWith('/api/agents/')){
        const result=await s.api.handle({method,path,input:method==='POST'?route.request().postDataJSON():undefined,login:{address:alice,method:'passkey'},origin});
        return route.fulfill({status:result.status,json:result.body});
      }
      if(path==='/api/pilot/rpc'){
        // The chain includes the saved transaction; the server-side verifier sees the same mined transaction.
        const input=route.request().postDataJSON(),saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('flurbo.pilot.pending.v1')||'null'));
        if(input.method==='eth_getTransactionReceipt'){
          const buy=saved.review.action==='buy',args=buy?decodeFunctionData({abi:pilotPoolAbi,data:saved.review.transaction.data}).args as any[]:null;
          const logs=buy?[{address:pool,topics:encodeEventTopics({abi:pilotPoolAbi,eventName:'Traded',args:{trader:owner,scope:args![0],mask:args![1]}}),
            data:encodeAbiParameters([{type:'bool'},{type:'uint128'},{type:'uint128'}],[true,args![2],250_000n])}]:[];
          s.mine(saved.review.transaction,saved.hash,{logs});
          if(saved.review.action==='approve')s.f.options.allowance=10n**12n;
          return route.fulfill({json:{result:{transactionHash:saved.hash,blockNumber:'0x64',blockHash:hash,status:'0x1'}}});
        }
        if(input.method==='eth_getTransactionByHash')return route.fulfill({json:{result:{...saved.review.transaction,hash:saved.hash,chainId:'0x279f',blockNumber:'0x64',blockHash:hash,input:saved.review.transaction.data,nonce:saved.nonce}}});
        return route.fulfill({json:{result:input.method==='eth_chainId'?'0x279f':{hash,number:'0x65'}}});
      }
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Fixture unavailable'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    const sends=()=>page.evaluate(()=>Number(sessionStorage.getItem('sends')||0));

    // Create an agent that may propose trades for approval.
    await page.goto(origin+'/agents');
    await page.getByRole('heading',{name:'Create an agent'}).waitFor();
    await page.getByLabel('Name').fill('Release relationship agent');
    await page.getByRole('radio',{name:/Propose for approval/}).check();
    await page.getByRole('button',{name:'Create agent'}).click();
    await page.waitForURL(/\/agents\/[0-9a-f-]{36}$/);
    await page.getByRole('heading',{name:'Release relationship agent'}).waitFor();

    // A contradictory forecast is rejected, not displayed as coherent.
    await page.getByLabel('Chance A happens (%)').fill('60');await page.getByLabel('Chance B happens (%)').fill('55');await page.getByLabel('Chance both happen (%)').fill('80');
    await page.getByText('"both" must be between 15.0% and 55.0%').waitFor();
    await page.getByLabel('What you observed').fill('Both release branches were tagged the same day');
    await page.getByLabel('Source').fill('Project release page');
    const local=new Date(Date.now()-3600_000-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,16);
    await page.getByLabel('Observed at').fill(local);
    await page.getByLabel('Why you expect this relationship').fill('The releases share a dependency, so they tend to ship together.');
    await page.getByLabel('Uncertainty').fill('A late security fix could split them.');
    await page.getByRole('button',{name:'Preview decision'}).click();
    await page.getByRole('alert').filter({hasText:'chance of both'}).waitFor();
    await page.getByLabel('Chance both happen (%)').fill('45');
    await page.getByRole('button',{name:'Preview decision'}).click();
    const decision=page.getByRole('region',{name:'Latest decision'});
    await decision.getByRole('heading',{name:'Proposed purchase'}).waitFor();
    await decision.getByText('(a finite-size cost, not a probability)',{exact:false}).waitFor();
    await decision.getByText('VOID events pay a fraction under the published rules.',{exact:false}).waitFor();

    // Paper trade: clearly simulated, never on-chain.
    await decision.getByRole('button',{name:'Record paper trade'}).click();
    await page.getByText('Paper trade recorded',{exact:true}).waitFor();
    await page.getByText('(simulated, not on-chain)',{exact:false}).first().waitFor();
    assert.equal(await sends(),0);

    // Prepare for approval: first an exact token approval, which is not a purchase.
    await decision.getByRole('button',{name:'Prepare for MetaMask approval'}).click();
    const approvals=page.getByRole('region',{name:'Awaiting approval'});
    await approvals.getByText('Step 1: approve exactly',{exact:false}).waitFor();
    await approvals.getByText('connected with',{exact:false}).waitFor();

    // A wallet switch invalidates the prepared review.
    await page.evaluate(()=>(window as any).__switchAccount('0x'+'77'.repeat(20)));
    await approvals.getByText('the selected wallet is not linked to this account',{exact:false}).waitFor();
    await approvals.getByRole('button',{name:'Approve allowance in MetaMask'}).click();
    await approvals.getByRole('alert').filter({hasText:'Select the MetaMask wallet this proposal was prepared for'}).waitFor();
    await page.evaluate((owner:string)=>(window as any).__switchAccount(owner),owner);
    await approvals.getByText('connected with',{exact:false}).waitFor();

    // Rejection in MetaMask: nothing sent, tracking cleared, proposal marked rejected.
    await page.evaluate(()=>sessionStorage.setItem('reject','1'));
    await approvals.getByRole('button',{name:'Approve allowance in MetaMask'}).click();
    await page.getByText('Rejected in MetaMask',{exact:false}).first().waitFor();
    assert.equal(await sends(),0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('flurbo.pilot.pending.v1')),null);

    // A fresh proposal, approved; then reload before confirmation.
    await decision.getByRole('button',{name:'Prepare for MetaMask approval'}).click();
    await approvals.getByRole('button',{name:'Approve allowance in MetaMask'}).click();
    await approvals.getByText('Submitted, waiting for confirmation').waitFor();
    assert.equal(await sends(),1);
    await page.reload();
    const reloaded=page.getByRole('region',{name:'Awaiting approval'});
    await reloaded.getByRole('button',{name:'Check confirmation'}).click();
    await reloaded.getByText('Token approval confirmed. Purchase not sent yet.').waitFor();
    assert.equal(await sends(),1,'reload never resends');

    // The purchase itself, carrying the same claim, then a verified receipt.
    await reloaded.getByRole('button',{name:'Prepare the purchase'}).click();
    await reloaded.getByText('Buy 1 share(s), paying at most',{exact:false}).waitFor();
    await reloaded.getByRole('button',{name:'Confirm purchase in MetaMask'}).click();
    await reloaded.getByRole('button',{name:'Check confirmation'}).click();
    await page.getByText('Purchase confirmed on-chain',{exact:false}).first().waitFor();
    assert.equal(await sends(),2,'exactly one approval and one purchase were sent');

    await page.getByRole('button',{name:'Refresh results'}).click();
    await page.getByText('Confirmed purchases').waitFor();
    if(process.env.FLURBO_TEST_SCREENSHOT)await page.screenshot({path:process.env.FLURBO_TEST_SCREENSHOT,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll on a phone');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
