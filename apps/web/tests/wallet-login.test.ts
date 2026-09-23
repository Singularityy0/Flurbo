import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { SessionStore } from '../server/session.mjs';
import { AuthController } from '../src/auth/controller.ts';
import { authPolicy } from '../src/auth/policy.ts';
const signer = privateKeyToAccount(('0x' + '11'.repeat(32)) as `0x${string}`);
const origin = 'https://flurbo.singu.online';

test('wallet authentication uses a signed login message and restores without a Mera account', async () => {
  const store=new SessionStore();let id='',login:any=null;
  const transport={async read(){return login;},async challenge(address:string,method?:string){const c=store.challenge(address,origin,method);id=c.id;return c.message;},async verify(signature:string){login=await store.verify(id,signature,origin);return login;},async logout(){login=null;}};
  const controller=new AuthController({policy:authPolicy(origin,false,true,true),transport});
  const methods:string[]=[];
  const provider={async request({method,params}:any){methods.push(method);return method==='personal_sign'?signer.signMessage({message:{raw:params[0]}}):[signer.address];}};
  assert.equal(await controller.authenticateWallet(provider),true);
  assert.equal(controller.getSnapshot().method,'wallet');assert.equal(controller.getSnapshot().signingExpiresAt,null);
  assert.deepEqual(methods,['eth_requestAccounts','personal_sign','eth_accounts']);
  const restored=new AuthController({policy:authPolicy(origin,false,true,true),transport});await restored.restore();assert.equal(restored.getSnapshot().method,'wallet');
  await controller.signOut();
});
