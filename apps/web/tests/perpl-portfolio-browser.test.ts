import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile,mkdir } from 'node:fs/promises';
import { pathToFileURL,fileURLToPath } from 'node:url';
test('Perpl portfolio shows snapshots, close review, protocol view and mobile without sending a trade',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const owner='0x'+'ab'.repeat(20),errors:string[]=[];
  try {
    const page=await browser.newPage({viewport:{width:1366,height:900}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(({owner})=>{
      sessionStorage.setItem('flurbo.perpl.testnet.v1',JSON.stringify({token:'test-token-with-length',secret:'ab'.repeat(32)}));
      (window as any).__sentOrders=0;
      class Socket {
        static OPEN=1;readyState=0;onopen:any;onmessage:any;onclose:any;onerror:any;
        constructor(){setTimeout(()=>{this.readyState=1;this.onopen?.();},20);}
        send(text:string){const f=JSON.parse(text);if(f.mt===22){(window as any).__sentOrders++;(window as any).__lastOrder=f;}
          if(f.mt===29)setTimeout(()=>{
            const frames=[{mt:19,addr:owner,sn:1,as:[{id:3,in:12,fw:true,fr:false,lfr:1,b:'100000000'}],sts:[{id:3,td:'100000000',tw:'0',tv:'1000000',tf:'100',trp:'-100',wr:5000,tt:2}]},
            {mt:26,d:[{pid:4,acc:3,mkt:16,s:100,ep:1000,lv:100,c:'10000000',st:1,sd:1}]},
            {mt:23,d:[{oid:9,acc:3,mkt:16,t:1,os:100,fs:40,p:1000,st:3}]},
            {mt:25,d:[{oid:9,acc:3,mkt:16,t:1,s:100,p:1000,f:'100',at:{b:1,tx:1,l:1,txid:'0x'+'cd'.repeat(32)}}]}];
            frames.forEach(frame=>this.onmessage?.({data:JSON.stringify(frame)}));
          },20);
        }
        close(){this.readyState=3;this.onclose?.({code:1000});}
      }
      (window as any).WebSocket=Socket;
    },{owner});
    await page.route('**/*',async(route:any)=>{
      const p=new URL(route.request().url()).pathname;
      if(p==='/api/auth/session')return route.fulfill({json:{session:{address:owner,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(p==='/api/account/access')return route.fulfill({json:{approved:true,testingTools:false}});
      if(p==='/api/perpl/context')return route.fulfill({json:{chain:{chain_id:10143},instances:[{id:12,address:'0x1964c32f0be608e7d29302aff5e61268e72080cc',collateral_token_id:1,min_account_open_amount:'100000000'}],tokens:[{id:1,address:'0xa9012a055bd4e0edff8ce09f960291c09d5322dc',decimals:6,symbol:'AUSD'}],markets:[{id:16,instance_id:12,symbol:'MON',order_ttl_blocks:20,state:{mrk:1100,dva:'1000000',oi:100,tvl:'100000000'},config:{is_open:true,price_decimals:1,size_decimals:2,initial_margin:1500}}]}});
      if(p.includes('/v1/trading/')){
        assert.ok(route.request().headers()['x-api-signature']);
        if(p.includes('/portfolio/'))return route.fulfill({json:{chart:[{t:1000,v:'100000000'},{t:2000,v:'90000000'}]}});
        if(p.endsWith('/position-history'))return route.fulfill({json:{np:'',d:[{acc:3,mkt:16,pid:4,sr:13,dpnl:'10000000',fnd:'0',fee:'1000000',at:{t:3600000,b:2,tx:0,l:0},ots:{t:0}}]}});
        if(p.endsWith('/account-history'))return route.fulfill({json:{np:'',d:[{id:3,et:1,a:'100000000',b:'100000000',at:{t:1000,b:1,tx:0,l:0}}]}});
        return route.fulfill({json:{np:'',d:[{acc:3,mkt:16,oid:9,t:1,s:100,p:1000,f:'100',at:{t:1000,b:1,tx:0,l:1}}]}});
      }
      if(p.includes('/candles/'))return route.fulfill({json:{d:[{t:Date.now()-3600000,c:1000,v:'1000000',n:1},{t:Date.now(),c:1100,v:'1000000',n:1}]}});
      if(p.startsWith('/api/'))return route.fulfill({status:404,json:{error:'unused fixture'}});
      const f=p.startsWith('/assets/')?p.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+f,import.meta.url)),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.woff2')?'font/woff2':f.endsWith('.woff')?'font/woff':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/perpl');
    assert.ok(await page.locator('main.perpl-page').evaluate((el:HTMLElement)=>el.getBoundingClientRect().width>1200),'Perpl uses the desktop viewport instead of the narrow task column');
    await page.getByRole('button',{name:'Connect',exact:true}).click();
    const panel=page.getByRole('region',{name:'Perpl portfolio and protocol'});
    await panel.getByRole('button',{name:'Review close',exact:true}).waitFor();
    assert.match(await panel.innerText(),/Long/);assert.match(await panel.innerText(),/100/);
    await panel.getByText('History loaded to the oldest available record.',{exact:false}).waitFor();
    await panel.getByRole('img',{name:'Equity curve',exact:true}).waitFor();
    await panel.getByRole('button',{name:'Save wallet summary',exact:true}).click();
    await panel.getByRole('checkbox').check();
    assert.match(await panel.innerText(),/9.00/);
    await panel.getByRole('button',{name:'Review close',exact:true}).click();
    assert.equal(await page.getByRole('combobox',{name:/^Action/}).inputValue(),'3');
    assert.equal(await page.getByLabel('Size (MON)',{exact:true}).inputValue(),'1');
    assert.equal(await page.evaluate(()=>(window as any).__sentOrders),0);
    const action=page.getByRole('combobox',{name:/^Action/});
    await action.selectOption('2');
    await page.getByLabel('Size (MON)',{exact:true}).fill('2');
    await page.getByLabel('Limit price',{exact:true}).fill('105');
    await page.getByRole('button',{name:'Review open short',exact:true}).click();
    assert.equal(await action.inputValue(),'2');
    assert.match(await page.locator('main').innerText(),/Confirm: Open short 2 MON as a limit at 105/);
    await page.getByRole('button',{name:'Back',exact:true}).click();
    // Every action preserves its own selection through the review boundary.
    for(const [id,label] of [['1','open long'],['3','close long'],['4','close short'],['5','cancel order'],['6','add collateral'],['7','change order']]){
      await action.selectOption(id);
      if(id==='5'||id==='7')await page.getByLabel('Order id',{exact:true}).fill('9');
      if(id==='6')await page.getByLabel('Collateral (AUSD)',{exact:true}).fill('1');
      await page.getByRole('button',{name:'Review '+label,exact:true}).click();
      await page.getByRole('button',{name:'Confirm testnet order',exact:true}).waitFor();
      assert.equal(await action.inputValue(),id);
      await page.getByRole('button',{name:'Back',exact:true}).click();
    }
    await action.selectOption('2');
    await page.getByRole('button',{name:'Review open short',exact:true}).click();
    await page.getByRole('button',{name:'Confirm testnet order',exact:true}).click();
    assert.equal(await page.evaluate(()=>(window as any).__lastOrder.t),2);
    assert.equal(await page.evaluate(()=>(window as any).__lastOrder.s),200);
    assert.equal(await page.evaluate(()=>(window as any).__lastOrder.p),1050);
    assert.equal(await page.evaluate(()=>(window as any).__sentOrders),1);
    await panel.getByRole('button',{name:'Protocol',exact:true}).click();
    await panel.getByRole('img',{name:/MON closing prices/}).waitFor();
    await panel.getByRole('button',{name:'7d',exact:true}).click();
    await panel.getByRole('img',{name:'MON closing prices over 7 days'}).waitFor();
    await panel.getByRole('button',{name:'30d',exact:true}).click();
    await panel.getByRole('img',{name:'MON closing prices over 30 days'}).waitFor();
    const directory=new URL('../../../target/perpl-review/',import.meta.url);await mkdir(directory,{recursive:true});
    await panel.screenshot({path:fileURLToPath(new URL('protocol-desktop.png',directory))});
    await page.setViewportSize({width:390,height:844});
    await panel.getByRole('button',{name:'My portfolio',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await panel.screenshot({path:fileURLToPath(new URL('portfolio-mobile.png',directory))});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
