import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {pilotFixture,hash,owner} from './pilot-fixture.ts';
import {thesisCandidates} from '../shared/thesis.mjs';
import {certifiedPair} from '../server/pair-math.mjs';
import {simulatePairPurchase} from '../server/pair-sensitivity.mjs';

// Partner features as a signed-in person sees them: Kimi hypotheses and indexed pool activity.
// The API is mocked; the production bundle in dist/ is the real one.
test('partners in Chrome: Kimi on Thesis and What If, and Envio pool activity',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const now=Math.floor(Date.now()/1000);
  const f=pilotFixture(now,4),errors:string[]=[],kimiRequests:any[]=[],unexpected:string[]=[];
  f.manifest.publication.mode='deterministic-source-v1';
  const poolNs='practice-2222222222222222222222222222222222222222';
  const evidence=JSON.parse(await readFile(new URL('../../../config/cre-evidence/0xf8beba5827bfaaf6ace08a40cd9db740233ca9fe.json',import.meta.url),'utf8'));
  const market='0x'+'66'.repeat(20),txHash='0x'+'ab'.repeat(32);
  let kimiConfigured=false;

  const kimiResponse={schema:'flurbo.kimi-forecast.v1',source:'moonshot-api',model:'kimi-test',a:0,b:1,
    forecast:{pA:65,pBgivenYes:80,pBgivenNo:20},derivedMarginalB:59,
    rationale:'Both questions follow the same weekend price move, so a Yes on one makes the other more likely.',
    frechetBounds:{minJoint:0.24,maxJoint:0.59,actualJoint:0.52,valid:true},generatedAt:new Date().toISOString()};

  const thesisResponse=(input:any)=>{
    const time=Math.floor(Date.now()/1000);
    return {
      schema:'flurbo.thesis.v1',chainId:10143,pool:f.manifest.pool,rulesHash:f.manifest.rulesHash,input,
      eventIds:[`event-${input.a}`,`event-${input.b}`],snapshot:{blockNumber:'100',blockHash:hash,timestamp:time},
      expiresAt:time+60,stateDigest:'a'.repeat(64),closed:false,resolved:false,unit:'tenths_of_percentage_point',
      maxTradeQuantityAtoms:'10000000',
      pair:{values:{a:500,b:500,joint:250,givenYes:500,givenNo:500,independent:250,difference:0},reasons:{}},
      scenarios:[250,250,250,250],
      candidates:thesisCandidates(4,input.a,input.b,input.yesA,input.yesB).map((c,i)=>{
        const cost=BigInt(input.quantity)*BigInt([52,26,76,52][i])/100n;
        return {...c,probability:[500,250,750,500][i],costAtoms:String(cost),maxSpendAtoms:String((cost*10050n+9999n)/10000n),reason:null};
      })
    };
  };

  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',(e:Error)=>errors.push(e.message));
    // Optional: FLURBO_TEST_SCREENSHOT=<directory> saves what each step looked like.
    const shot=async(name:string)=>{if(process.env.FLURBO_TEST_SCREENSHOT)await page.screenshot({path:`${process.env.FLURBO_TEST_SCREENSHOT}/${name}.png`,fullPage:true});};

    await page.route('**/*',async(route:any)=>{
      const url=new URL(route.request().url());
      const path=url.pathname;
      const api=`/api/${poolNs}`;

      if(path==='/api/market-directory')return route.fulfill({json:{schema:'flurbo.market-directory.v1',active:poolNs,markets:[{namespace:poolNs,label:'Test pool',pool:f.manifest.pool,closesAt:f.manifest.publication.draft.closesAt,kuru:[0]}]}});
      if(path==='/api/account/access')return route.fulfill({json:{approved:true,testingTools:false}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:owner,method:'passkey',expiresAt:Date.now()+3600_000}}});
      if(path==='/api/account/wallets')return route.fulfill({json:{account:owner,wallets:[]}});
      if(path==='/api/account/portfolio-sources')return route.fulfill({json:{account:owner,wallets:[],agentWallets:[]}});
      if(path===`${api}/status`)return route.fulfill({json:await f.service.status()});
      if(path===`${api}/markets`)return route.fulfill({json:await f.service.markets()});
      if(path===`${api}/thesis`)return route.fulfill({json:thesisResponse(route.request().postDataJSON())});
      if(path===`${api}/kimi-forecast`){
        kimiRequests.push(route.request().postDataJSON());
        return kimiConfigured?route.fulfill({json:kimiResponse}):route.fulfill({status:503,json:{error:'Kimi is not configured. Set MOONSHOT_API_KEY on the server.'}});
      }
      if(path===`${api}/analytics`){
        const curTime=Math.floor(Date.now()/1000);
        const input=route.request().postDataJSON();
        const state={events:4,a:input.a,b:input.b,liquidity:'10000000',order:[0,1,2,3],factors:[{scope:3,values:['0','0','0','10000000']}]};
        return route.fulfill({json:{
          schema:'flurbo.pair-analytics.v1',model:'factored-lmsr-pair-v1',chainId:10143,pool:f.manifest.pool,rulesHash:f.manifest.rulesHash,
          snapshot:{blockNumber:'100',blockHash:hash,timestamp:curTime},expiresAt:curTime+60,stateDigest:'a'.repeat(64),
          a:input.a,b:input.b,unit:'tenths_of_percentage_point',closed:false,...certifiedPair(state),
          sensitivity:{schema:'flurbo.pair-sensitivity.v1',scenarios:['yes','no'].map(answer=>{
            const sim=simulatePairPurchase(state,answer);
            return {answer,status:'available',scope:sim.scope,mask:sim.mask,quantityAtoms:sim.quantity,costAtoms:'250001',...certifiedPair(sim.after)};
          })}
        }});
      }
      // Kuru listing for question 0 only; Chainlink CRE evidence for the pool.
      if(path===`${api}/kuru-listing`){
        return url.searchParams.get('event')==='0'
          ?route.fulfill({json:{eventIndex:0,pool:f.manifest.pool,receipt:'0x'+'44'.repeat(20),market,closesAt:f.manifest.publication.draft.closesAt,question:'Will the first question resolve Yes?'}})
          :route.fulfill({status:404,json:{error:'No verified Kuru order book for this question.'}});
      }
      if(path===`${api}/cre-evidence`)return route.fulfill({json:evidence});
      // Envio through the site's bounded proxy.
      if(path==='/envio'){
        const query=route.request().postDataJSON();
        if(query.kind==='trades')return route.fulfill({json:{data:{Trade:[{id:'trade-1',side:'BUY',scope:1,mask:'2',quantityAtoms:'1000000',amountAtoms:'520000',blockNumber:123,timestamp:now}]}}});
        if(query.kind==='kuru-fills'&&query.market===market)return route.fulfill({json:{data:{KuruFill:[
          {id:'fill-1',isBuy:false,price:'480000',sizeAtoms:'2500000',blockNumber:456,timestamp:now,txHash}]}}});
        return route.fulfill({status:400,json:{error:'Invalid indexer request'}});
      }
      if(path==='/api/alchemy/activity')return route.fulfill({json:{network:'monad-testnet',chainId:10143,provider:'Alchemy',active:true,totalTracked:5,events:[]}});
      if(['/api/network',`${api}/price-history`].includes(path))return route.fulfill({status:503,json:{error:'Offline'}});
      if(path.startsWith('/api/')){unexpected.push(path);return route.fulfill({status:503,json:{error:'Unexpected API'}});}

      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({
        body:await readFile(new URL('../dist/'+relative,import.meta.url)),
        contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'
      });
    });

    // 1. Thesis: without a configured key Kimi shows an error and fills nothing.
    await page.goto(`https://flurbo.singu.online/markets/${poolNs}/0/thesis`);
    const badge=page.locator('.thesis-provenance-badge');
    await badge.waitFor();
    const badgeText=await badge.innerText();
    assert.ok(badgeText.includes('On-chain pool rules'),'rules provenance shown');
    assert.ok(badgeText.includes('AI estimates are hypotheses'),'AI estimates are labelled as hypotheses');
    const kimiBtn=page.getByRole('button',{name:'Analyze with Kimi AI',exact:true});
    await kimiBtn.waitFor();
    await kimiBtn.click();
    await page.getByText(/Kimi forecast failed: Kimi is not configured/).waitFor();
    for(const i of [0,1,2])assert.equal(await page.locator(`#forecast-${i}`).inputValue(),'','no number appears without a key');
    assert.equal(await page.locator('.thesis-kimi-card').count(),0);

    // 2. Thesis: with a key the three estimates fill and the rationale card is labelled.
    kimiConfigured=true;
    await kimiBtn.click();
    const kimiCard=page.locator('.thesis-kimi-card');
    await kimiCard.waitFor();
    assert.ok((await kimiCard.innerText()).includes('Both questions follow the same weekend price move'));
    assert.deepEqual(await Promise.all([0,1,2].map(i=>page.locator(`#forecast-${i}`).inputValue())),['65.0','80.0','20.0']);
    await page.getByText('Kimi model hypothesis (kimi-test)').waitFor();
    assert.deepEqual(kimiRequests.at(-1),{a:0,b:1});
    await shot('partners-thesis');

    // 2b. The markets list no longer offers a Kuru order book.
    await page.goto('https://flurbo.singu.online/markets');
    await page.locator('.market-card').first().waitFor();
    assert.equal(await page.getByRole('link',{name:/Trade the YES receipt on Kuru/}).count(),0);
    assert.equal(await page.getByRole('button',{name:/Kuru order books/}).count(),0);
    await shot('partners-markets');

    // 3. Market detail, then What If with Kimi and Envio.
    await page.goto(`https://flurbo.singu.online/markets/${poolNs}/0`);
    await page.getByRole('heading',{name:'Your position',exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Trade YES receipts on Kuru',exact:true}).count(),0);
    assert.equal(await page.getByRole('link',{name:'Open order book',exact:true}).count(),0);
    assert.equal(await page.locator('details[aria-label="Chainlink CRE check"]').count(),0);
    await shot('partners-market-detail');

    await page.getByText('Explore how these markets connect',{exact:true}).click();
    const panel=page.locator('.what-if');
    await panel.getByRole('button',{name:'Compare these questions'}).click();
    await panel.getByText('Both Yes, together',{exact:true}).waitFor();
    await panel.getByRole('button',{name:'Kimi Joint Forecast',exact:true}).click();
    await panel.getByRole('heading',{name:'Kimi model hypothesis',exact:true}).waitFor();
    await panel.getByText(/Frechet valid: Yes/i).waitFor();
    assert.deepEqual(kimiRequests.at(-1),{a:1,b:0},'What If sends the condition first');
    await panel.getByText('Recent pool activity · Envio').click();
    await panel.getByText(/Bought 1\.000000 shares/).waitFor();

    // 4. Narrow screens keep the Thesis page inside the viewport.
    await page.setViewportSize({width:390,height:844});
    await page.goto(`https://flurbo.singu.online/markets/${poolNs}/0/thesis`);
    await badge.waitFor();
    assert.ok((await badge.innerText()).includes('On-chain pool rules'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no horizontal scroll at 390px');

    assert.deepEqual(unexpected,[],'no unexpected API calls');
    assert.deepEqual(errors,[],'No uncaught page errors in Chrome');
  }finally{
    await browser.close();
  }
});
