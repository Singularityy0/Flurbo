import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

test('native application on desktop and mobile: submit, verify, reload, withdraw and operator decision',{skip:!process.env.FLURBO_TEST_PLAYWRIGHT},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser=await chromium.launch({headless:true,executablePath:process.env.FLURBO_TEST_BROWSER});
  let application:any=null,operator=false,approved=false;const account='0x'+'ab'.repeat(20),errors:string[]=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',(e:Error)=>errors.push(e.message));
    await page.route('**/*',async(route:any)=>{
      const p=new URL(route.request().url()).pathname;
      if(p==='/api/auth/session')return route.fulfill({json:{session:{address:account,method:'passkey',expiresAt:Date.now()+3600000}}});
      if(p==='/api/account/access')return route.fulfill({json:{approved:operator||approved,nativeApplications:true,testingTools:operator,applicationUrl:null}});
      if(p==='/api/account/application')return route.fulfill({json:{application}});
      if(p.endsWith('/application/submit')){const input=route.request().postDataJSON();assert.equal(input.account,undefined);application={account,email:input.email,state:'unverified',verified:false,revision:0,createdAt:new Date().toISOString(),notification:'none'};return route.fulfill({json:{application,delivery:'sent'}});}
      if(p.endsWith('/application/verify')){
        if(route.request().postDataJSON().code!=='443322')return route.fulfill({status:400,json:{error:'The code did not match. Check your email and try again.'}});
        application={...application,state:'pending',verified:true,revision:1};return route.fulfill({json:{application}});
      }
      if(p.endsWith('/application/withdraw')){application={...application,state:'withdrawn',email:null};return route.fulfill({json:{application}});}
      if(p.endsWith('/application/admin/list'))return route.fulfill({json:{applications:[{...application,state:approved?'approved':'pending',verified:true,email:'tester@example.com',notification:'none'}]}});
      if(p.endsWith('/application/admin/decide')){assert.equal(route.request().postDataJSON().decision,'approved');approved=true;return route.fulfill({json:{notification:'sent'}});}
      if(p==='/api/account/wallets')return route.fulfill({json:{account,wallets:[]}});
      if(p.startsWith('/api/'))return route.fulfill({status:503,json:{error:'Unused fixture'}});
      const file=p.startsWith('/assets/')?p.slice(1):'index.html';
      return route.fulfill({body:await readFile(new URL('../dist/'+file,import.meta.url)),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html'});
    });
    await page.goto('https://flurbo.singu.online/access');
    await page.getByRole('heading',{name:'Request your invitation.'}).waitFor();
    await page.getByLabel('Email address',{exact:true}).fill('tester@example.com');
    assert.equal(await page.getByRole('button',{name:'Request access',exact:true}).isDisabled(),true);
    await page.getByRole('checkbox',{name:/I understand/}).check();
    await mkdir(new URL('../../../target/access-review/',import.meta.url),{recursive:true});
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:new URL(`../../../target/access-review/form-${width}.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
    }
    await page.getByRole('button',{name:'Request access',exact:true}).click();
    await page.getByLabel('Verification code').fill('111111');await page.getByRole('button',{name:'Verify email',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'code did not match'}).waitFor();
    await page.getByLabel('Verification code').fill('443322');await page.getByRole('button',{name:'Verify email',exact:true}).click();
    await page.getByRole('heading',{name:'Your request is received.'}).waitFor();
    await page.reload();await page.getByRole('heading',{name:'Your request is received.'}).waitFor();
    await page.getByText('Withdraw application',{exact:true}).click();await page.getByRole('checkbox',{name:'Remove my contact email'}).check();
    await page.getByRole('button',{name:'Withdraw request'}).click();await page.getByRole('heading',{name:'Request your invitation.'}).waitFor();
    operator=true;await page.reload();await page.getByText('Review access applications',{exact:true}).click();
    await page.getByRole('button',{name:'Load applications'}).click();await page.getByRole('button',{name:'Approve',exact:true}).click();
    assert.equal(approved,false);await page.getByRole('button',{name:'Confirm decision'}).click();await page.getByText('Decision saved.',{exact:true}).waitFor();
    assert.equal(approved,true);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
