import { verifyPilot } from '../src/pilot-verification';

const root=new URL('../../../',import.meta.url);
const prepared=await Bun.file(new URL('target/deployments/pilot-prepared.json',root)).json();
const deployment=await Bun.file(new URL('target/deployments/pilot-unverified.json',root)).json();
const artifacts:Record<string,any>={};
for(const name of ['PilotPool','PilotResolver','FactoredBaseTokenFactory','FactoredBaseToken']) artifacts[name]=await Bun.file(new URL(`target/foundry/out/${name}.sol/${name}.json`,root)).json();
const endpoint=process.env.FLURBO_ALCHEMY_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz';
if(!endpoint.startsWith('https://')) throw new Error('HTTPS RPC required');
const rpc=async(method:string,params:unknown[])=>{
  const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20_000)});
  if(!response.ok) throw new Error('RPC request failed');
  const result=await response.json() as {error?:unknown;result?:unknown};
  if(result.error || result.result===undefined) throw new Error(`RPC rejected ${method}`);
  return result.result;
};
const manifest=await verifyPilot(prepared,deployment,rpc,artifacts,Math.floor(Date.now()/1000));
await Bun.write(new URL('target/deployments/pilot-testnet.json',root),JSON.stringify(manifest,null,2)+'\n');
await Bun.write(new URL('target/deployments/pilot-cre.json',root),JSON.stringify({schema:'flurbo.pilot-observer.v1',
  draft:manifest.publication.draft,pool:manifest.pool,resolver:manifest.resolver,rulesHash:manifest.rulesHash},null,2)+'\n');
await Bun.write(new URL('target/deployments/pilot-cre-trigger.json',root),JSON.stringify({eventId:manifest.publication.draft.events[0].id,
  blockNumber:manifest.verifiedBlock,blockHash:manifest.verifiedBlockHash},null,2)+'\n');
console.log(JSON.stringify({status:manifest.status,block:manifest.verifiedBlock,pool:manifest.pool}));
