import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {pilotFixture,owner,hash} from './pilot-fixture.ts';
import {TESTNET} from '../server/network.mjs';

test('funding uses announced MetaMask instead of competing injection or Mera; account changes stop submission', {skip:!process.env.FLURBO_TEST_PLAYWRIGHT}, async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const login='0x'+'99'.repeat(20),f=pilotFixture(Math.floor(Date.now()/1000),4);
  f.manifest.publication.mode='rehearsal';
  try {
    const page=await browser.newPage();
    await page.addInitScript(({owner,hash}:any)=>{
      const callbacks=new Map<string,Set<()=>void>>();
      (window as any).ethereum={isMetaMask:true,isPhantom:true,request:()=>{throw Error('Phantom must never be used');}};
      const metamask={on:(n:string,fn:()=>void)=>{if(!callbacks.has(n))callbacks.set(n,new Set());callbacks.get(n)!.add(fn);},removeListener:(n:string,fn:()=>void)=>callbacks.get(n)?.delete(fn),request:async({method,params}:any)=>{
        if(method==='eth_chainId')return '0x279f';
        if(['eth_accounts','eth_requestAccounts'].includes(method))return [owner];
        if(method==='eth_getBlockByNumber')return {hash,number:'0x64'};
        if(method==='eth_call')return '0x';
        if(method==='eth_gasPrice')return '0x3b9aca00';
        if(method==='eth_estimateGas'){
          if(sessionStorage.getItem('change'))callbacks.get('accountsChanged')?.forEach(fn=>fn());
          return '0x186a0';
        }
        if(method==='eth_sendTransaction'){sessionStorage.setItem('funding.tx',JSON.stringify(params[0]));return hash;}
        throw Error(method);
      }};
      window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{name:'MetaMask',rdns:'io.metamask'},provider:metamask}})));
    },{owner,hash});
    await page.route('**/*',async(route:any)=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:login,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(path==='/api/practice-collections')return route.fulfill({json:{schema:'flurbo.practice-collections.v1',active:'rehearsal',collections:[{namespace:'rehearsal',label:'Practice',pool:f.manifest.pool,closesAt:f.manifest.publication.draft.closesAt}]}});
      if(path==='/api/rehearsal/markets')return route.fulfill({json:await f.service.markets()});
      if(path==='/api/rpc')return route.fulfill({json:{result:{hash,number:'0x64'}}});
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unavailable'}});
      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+relative,import.meta.url)),contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':'text/html'});
    });
    async function openFunding(){
      await page.goto('https://flurbo.singu.online/markets');
      await page.getByText('Your account',{exact:true}).click();
      await page.getByText('Fund MetaMask on Monad testnet',{exact:true}).click();
      await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();
      await page.getByRole('button',{name:'Reconnect MetaMask',exact:true}).waitFor();
    }
    await openFunding();
    await page.evaluate(()=>sessionStorage.setItem('change','1'));
    await page.getByRole('button',{name:'Request test AUSD',exact:true}).click();
    await page.getByRole('button',{name:'Connect MetaMask',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('funding.tx')),null);
    await page.evaluate(()=>sessionStorage.removeItem('change'));
    await openFunding();
    await page.getByRole('button',{name:'Request test AUSD',exact:true}).click();
    await page.getByText('View faucet transaction',{exact:true}).waitFor();
    const tx=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('funding.tx')!));
    assert.equal(tx.from,owner);assert.notEqual(tx.from,login);
    assert.equal(tx.to,TESTNET.faucet);assert.equal(tx.data,TESTNET.faucetSelector+owner.slice(2).padStart(64,'0'));
    assert.equal(await page.getByRole('button',{name:'Request test AUSD',exact:true}).isDisabled(),true);
  } finally {await browser.close();}
});
