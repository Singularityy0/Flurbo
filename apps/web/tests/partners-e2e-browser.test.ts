import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {pilotFixture,hash,owner} from './pilot-fixture.ts';
import {thesisCandidates} from '../shared/thesis.mjs';
import {certifiedPair} from '../server/pair-math.mjs';
import {simulatePairPurchase} from '../server/pair-sensitivity.mjs';

test('partners E2E in Chrome: Thesis Explorer and What-If display Chainlink CRE, Envio, Alchemy, and Kimi AI',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  const now=Math.floor(Date.now()/1000);
  const f=pilotFixture(now,4),errors:string[]=[],requests:any[]=[];
  f.manifest.publication.mode='deterministic-source-v1';
  const poolNs='practice-2222222222222222222222222222222222222222';

  const kimiResponse={
    success:true,
    a:0,
    b:1,
    forecast:{pA:65,pBgivenYes:80,pBgivenNo:20},
    frechetBounds:{
      minJoint:0.45,
      maxJoint:0.65,
      actualJoint:0.52,
      valid:true
    },
    rationale:'Kimi AI joint analysis indicates strong correlation between official release milestones.'
  };

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

    await page.route('**/*',async(route:any)=>{
      const url=new URL(route.request().url());
      const path=url.pathname;

      if(path==='/api/market-directory')return route.fulfill({json:{schema:'flurbo.market-directory.v1',active:poolNs,markets:[{namespace:poolNs,label:'Test pool',pool:f.manifest.pool,closesAt:f.manifest.publication.draft.closesAt}]}});
      if(path==='/api/account/access')return route.fulfill({json:{approved:true,testingTools:false}});
      if(path==='/api/auth/session')return route.fulfill({json:{session:{address:owner,method:'passkey',expiresAt:Date.now()+3600_000}}});
      if(path===`/api/${poolNs}/status`)return route.fulfill({json:await f.service.status()});
      if(path==='/api/account/wallets')return route.fulfill({json:{account:owner,wallets:[]}});
      if(path==='/api/account/portfolio-sources')return route.fulfill({json:{account:owner,wallets:[],agentWallets:[]}});
      if(path===`/api/${poolNs}/markets`)return route.fulfill({json:await f.service.markets()});
      if(path===`/api/${poolNs}/thesis`)return route.fulfill({json:thesisResponse(route.request().postDataJSON())});
      if(path===`/api/${poolNs}/kimi-forecast`)return route.fulfill({json:kimiResponse});
      if(path===`/api/${poolNs}/analytics`){
        const curTime=Math.floor(Date.now()/1000);
        const input=route.request().postDataJSON();
        const state={events:4,a:input.a,b:input.b,liquidity:'10000000',order:[0,1,2,3],factors:[{scope:3,values:['0','0','0','10000000']}]};
        return route.fulfill({json:{
          schema:'flurbo.pair-analytics.v1',
          model:'factored-lmsr-pair-v1',
          chainId:10143,
          pool:f.manifest.pool,
          rulesHash:f.manifest.rulesHash,
          snapshot:{blockNumber:'100',blockHash:hash,timestamp:curTime},
          expiresAt:curTime+60,
          stateDigest:'a'.repeat(64),
          a:input.a,
          b:input.b,
          unit:'tenths_of_percentage_point',
          closed:false,
          ...certifiedPair(state),
          sensitivity:{
            schema:'flurbo.pair-sensitivity.v1',
            scenarios:['yes','no'].map(answer=>{
              const sim=simulatePairPurchase(state,answer);
              return {answer,status:'available',scope:sim.scope,mask:sim.mask,quantityAtoms:sim.quantity,costAtoms:'250001',...certifiedPair(sim.after)};
            })
          }
        }});
      }
      if(path==='/api/alchemy/activity')return route.fulfill({json:{network:'monad-testnet',chainId:10143,provider:'Alchemy',active:true,totalTracked:5,events:[]}});

      if(['/api/network',`/api/${poolNs}/price-history`].includes(path))return route.fulfill({status:503,json:{error:'Offline'}});
      if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unexpected API'}});

      const relative=path.startsWith('/assets/')?path.slice(1):'index.html';
      return route.fulfill({
        body:await readFile(new URL('../dist/'+relative,import.meta.url)),
        contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.woff2')?'font/woff2':'text/html'
      });
    });

    // 1. Test Thesis Explorer in Desktop Chrome
    await page.goto(`https://flurbo.singu.online/markets/${poolNs}/0/thesis`);

    // Verify Chainlink CRE, Envio, and Alchemy provenance badges
    const badge=page.locator('.thesis-provenance-badge');
    await badge.waitFor();
    const badgeText=await badge.innerText();
    assert.ok(badgeText.includes('Chainlink CRE settlement'), 'Badge shows Chainlink CRE');
    assert.ok(badgeText.includes('Envio HyperIndex active'), 'Badge shows Envio HyperIndex');
    assert.ok(badgeText.includes('Alchemy Monad stream active'), 'Badge shows Alchemy Monad stream');

    // Verify Kimi AI Forecaster button and execution
    const kimiBtn=page.getByRole('button',{name:'Analyze with Kimi AI',exact:true});
    await kimiBtn.waitFor();
    assert.equal(await kimiBtn.isEnabled(),true);
    await kimiBtn.click();

    // Verify Kimi rationale card appears
    const kimiCard=page.locator('.thesis-kimi-card');
    await kimiCard.waitFor();
    const cardText=await kimiCard.innerText();
    assert.ok(cardText.includes('Kimi AI joint analysis indicates strong correlation'), 'Kimi rationale displayed');

    // 2. Test What-If in Chrome
    await page.goto(`https://flurbo.singu.online/markets/${poolNs}/0`);
    await page.getByText('Explore how these markets connect',{exact:true}).click();
    const panel=page.locator('.what-if');
    await panel.getByRole('button',{name:'Compare these questions'}).click();
    await panel.getByText('Both Yes, together',{exact:true}).waitFor();

    // Verify partner state attribution in What-If
    await panel.getByText(/Real-time Monad state indexed by Alchemy RPC and Envio HyperIndex/i).waitFor();

    // Verify Kimi Joint Forecast button and execution in What-If
    const whatIfKimiBtn=panel.getByRole('button',{name:'Kimi Joint Forecast',exact:true});
    await whatIfKimiBtn.waitFor();
    await whatIfKimiBtn.click();

    // Verify Kimi Joint Hypothesis card rendered with Fréchet bounds valid
    await panel.getByRole('heading',{name:'Kimi AI Joint Hypothesis',exact:true}).waitFor();
    await panel.getByText(/Frechet valid: Yes/i).waitFor();

    // 3. Test Responsive Mobile Viewport (iPhone / Android width 390x844)
    await page.setViewportSize({width:390,height:844});
    await page.goto(`https://flurbo.singu.online/markets/${poolNs}/0/thesis`);
    await badge.waitFor();
    assert.ok((await badge.innerText()).includes('Chainlink CRE settlement'));

    assert.deepEqual(errors,[],'No uncaught page errors in Chrome');
  }finally{
    await browser.close();
  }
});
