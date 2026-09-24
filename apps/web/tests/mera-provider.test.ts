import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseTransaction,recoverTransactionAddress} from 'viem';
import {AuthController} from '../src/auth/controller.ts';
import {authPolicy} from '../src/auth/policy.ts';
import {meraProvider} from '../src/auth/mera-provider.ts';
import {TESTNET} from '../server/network.mjs';
import {learningDeployment} from '../shared/learning-contracts.mjs';

test('Mera learning trades keep market selection through signing and reject approvals for other pools', async () => {
  const controller = new AuthController({ policy: authPolicy('http://localhost:18767', true, true, true), client: {
    async createCredential() { throw Error('unused'); }, async getCredential() { return { credentialId: new Uint8Array([1]), prfOutput: new Uint8Array(32).fill(9) }; },
  } });
  const provider = meraProvider(controller, 'learning'), originalFetch = globalThis.fetch;
  const hash = '0x' + 'ab'.repeat(32); let writes = 0, selectedPool = learningDeployment.pool;
  globalThis.fetch = async (input, options) => {
    if (input === '/api/markets/learning/state') return Response.json({ environment: 'public_testnet', chain_id: 10143,
      market_id: 'learning', contracts: { pool: selectedPool, cash: TESTNET.cash }, snapshot: { block_number: 12, block_hash: hash } });
    assert.equal(input, '/api/rpc');
    const request = JSON.parse(options!.body as string); assert.equal(request.market, 'learning');
    if (request.method === 'eth_sendRawTransaction') {
      const tx = parseTransaction(request.params[0]); assert.ok([learningDeployment.pool, TESTNET.cash].includes(tx.to!.toLowerCase()));
      writes++; return Response.json({ result: hash });
    }
    return Response.json({ result: ({ eth_chainId: '0x279f', eth_getBlockByNumber: { hash }, eth_getTransactionCount: 121 } as any)[request.method] });
  };
  try {
    await controller.authenticate('login'); const owner = controller.getSnapshot().address!;
    const tx = { from: owner, to: TESTNET.cash, data: '0x095ea7b3' + learningDeployment.pool.slice(2).padStart(64, '0') + '1'.padStart(64, '0'),
      value: '0x0', chainId: '0x279f', gas: '0x186a0', gasPrice: '0x3b9aca00' };
    const send = (input: typeof tx) => provider.request({ method: 'eth_sendTransaction', params: [input] });
    await send(tx);
    await send({ ...tx, to: learningDeployment.pool, data: '0x3e6b6cde' + '0'.repeat(320) });
    await assert.rejects(send({ ...tx, data: '0x095ea7b3' + '22'.repeat(20).padStart(64, '0') + '1'.padStart(64, '0') }));
    for (const data of ['0xb0a52172', '0xf6c4eade', '0xdeadbeef']) await assert.rejects(send({ ...tx, to: learningDeployment.pool, data }));
    selectedPool = TESTNET.cash as typeof selectedPool;
    await assert.rejects(send(tx)); assert.equal(writes, 2);
  } finally { globalThis.fetch = originalFetch; provider.destroy(); await controller.signOut(); }
});

test('Mera adapter signs exact local transaction and rejects locked, foreign and admin requests', async () => {
  const controller = new AuthController({policy:authPolicy('http://localhost:18767',true,true,true),client:{
    async createCredential(){throw new Error('unused');},async getCredential(){return {credentialId:new Uint8Array([1]),prfOutput:new Uint8Array(32).fill(9)};}
  }});
  const provider = meraProvider(controller), originalFetch = globalThis.fetch;
  const pool='0x'+'22'.repeat(20),cash='0x'+'33'.repeat(20),hash='0x'+'ab'.repeat(32);
  let raw = '', writes=0, environment='local_fork', activeCash=cash;
  globalThis.fetch = async (input, options) => {
    if (input === '/api/state') return Response.json({environment,chain_id:10143,contracts:{pool,cash:activeCash},snapshot:{block_number:12,block_hash:hash}});
    if (input === '/api/network') return Response.json(TESTNET);
    const request=JSON.parse(options!.body as string);
    if(request.method==='eth_sendRawTransaction'){raw=request.params[0]; writes++; return Response.json({result:'0x'+'77'.repeat(32)});}
    return Response.json({result:({eth_chainId:'0x279f',eth_getBlockByNumber:{hash},eth_getTransactionCount:'0x0'} as Record<string,unknown>)[request.method]});
  };
  try {
    await controller.authenticate('login'); const account=controller.getSnapshot().address!;
    const input={from:account,to:cash,data:'0x095ea7b3'+pool.slice(2).padStart(64,'0')+'1'.padStart(64,'0'),value:'0x0',chainId:'0x279f',gas:'0x186a0',gasPrice:'0x3b9aca00'};
    await provider.request({method:'eth_sendTransaction',params:[input]});
    assert.equal(writes,1);
    const tx=parseTransaction(raw as `0x${string}`);
    assert.equal(tx.chainId,10143); assert.equal(tx.data,input.data); assert.equal(tx.to,cash); assert.equal(tx.value ?? 0n,0n);
    assert.equal((await recoverTransactionAddress({serializedTransaction:raw as `0x${string}`})).toLowerCase(),account);
    await assert.rejects(provider.request({method:'anvil_setBalance',params:[]}));
    await assert.rejects(provider.request({method:'eth_sendTransaction',params:[{...input,to:'0x'+'44'.repeat(20)}]}));
    await assert.rejects(provider.request({method:'eth_sendTransaction',params:[{...input,data:'0xdeadbeef'}]}));
    environment='public_testnet'; activeCash=TESTNET.cash;
    await provider.request({method:'eth_sendTransaction',params:[{...input,to:activeCash}]});
    await provider.request({method:'eth_sendTransaction',params:[{...input,to:TESTNET.faucet,data:TESTNET.faucetSelector+account.slice(2).padStart(64,'0')}]});
    assert.equal(writes,3);
    const withdrawal={...input,to:activeCash,data:'0xa9059cbb'+'44'.repeat(20).padStart(64,'0')+'1'.padStart(64,'0')};
    await provider.request({method:'eth_sendTransaction',params:[withdrawal]});
    assert.equal(parseTransaction(raw as `0x${string}`).data,withdrawal.data);
    await assert.rejects(provider.request({method:'eth_sendTransaction',params:[{...withdrawal,data:'0xa9059cbb'+account.slice(2).padStart(64,'0')+'1'.padStart(64,'0')}]}));
    assert.equal(writes,4);
    controller.lockSigning();
    await assert.rejects(provider.request({method:'eth_sendTransaction',params:[input]}),/Unlock signing/);
    assert.equal(writes,4);
  } finally {globalThis.fetch=originalFetch; provider.destroy(); await controller.signOut();}
});
