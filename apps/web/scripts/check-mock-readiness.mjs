import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pilotService, pilotRpc } from '../server/pilot.mjs';
import { encodeFunctionData, decodeFunctionResult } from 'viem';
import { pilotPoolAbi } from '../shared/pilot.mjs';

// No cookies, signing keys or write RPC methods. This cannot complete manual acceptance.
const root=new URL('../../../',import.meta.url);
if(process.argv.length>3||process.argv.length===3&&process.argv[2]!=='--rehearsal')throw new Error('Only --rehearsal is supported');
const rehearsal=process.argv[2]==='--rehearsal',namespace=rehearsal?'rehearsal':'pilot';
const manifest=JSON.parse(await readFile(new URL(rehearsal?'target/deployments/rehearsal-testnet.json':'config/pilot-testnet.json',root),'utf8'));
const checks=[];
async function check(name,fn){
  try{checks.push({name,status:'pass',details:await fn()});}
  catch{checks.push({name,status:'fail',details:'Check failed. Inspect this service or its configuration; no transaction was sent.'});}
}
async function get(path){
  return fetch('https://flurbo.singu.online'+path,{redirect:'error',signal:AbortSignal.timeout(60000)});
}
await check('Hosted pilot matches the saved deployment',async()=>{
  const response=await get('/healthz'),health=await response.json();
  if(!response.ok||health.service!=='flurbo'||health[namespace+'_pool']!=='configured'||health[namespace+'_address']!==manifest.pool||health[namespace+'_rules_hash']!==manifest.rulesHash)throw new Error('Deployment mismatch');
  return {pool:health[namespace+'_address'],chainState:health.chain_state};
});
await check('Unauthenticated pilot requests require login',async()=>{
  const response=await get('/api/'+namespace+'/status');
  if(response.status!==401)throw new Error('Expected login guard');
  return 'HTTP 401 without a session';
});
await check('Hosted event page and browser security headers',async()=>{
  const response=await get(rehearsal?'/rehearsal':'/events');
  if(!response.ok||!response.headers.get('content-type')?.includes('text/html')||!response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'")||response.headers.get('cache-control')!=='no-store')throw new Error('Page unavailable');
  return 'SPA served; authentication is checked by the protected API and client route';
});
await check('Live pilot collateral, rules and executable quote',async()=>{
  const rpc=pilotRpc(process.env.FLURBO_ALCHEMY_TESTNET_RPC_URL||'https://testnet-rpc.monad.xyz');
  const service=pilotService({manifest,rpc}),state=await service.status();
  if(state.resolved||state.snapshot.timestamp>=manifest.publication.draft.closesAt||BigInt(state.poolCash)<BigInt(state.requiredCollateral))throw new Error('Trading unavailable');
  const tag='0x'+BigInt(state.snapshot.blockNumber).toString(16);
  const data=encodeFunctionData({abi:pilotPoolAbi,functionName:'quoteBuy',args:[3,8n,1000000n]});
  const quote=decodeFunctionResult({abi:pilotPoolAbi,functionName:'quoteBuy',data:await rpc('eth_call',[{to:manifest.pool,data},tag])});
  if(quote<=0n||quote>1000000n)throw new Error('Unexpected quote');
  const block=await rpc('eth_getBlockByNumber',[tag,false]);
  if(block.hash.toLowerCase()!==state.snapshot.blockHash)throw new Error('Snapshot changed');
  return {block:state.snapshot.blockNumber,poolCashAtoms:state.poolCash,requiredCollateralAtoms:state.requiredCollateral,oneAndShareCostAtoms:quote.toString()};
});
const report={schema:'flurbo.mock-readiness.v1',mode:namespace,checkedAt:new Date().toISOString(),
  status:checks.every(c=>c.status==='pass')?'ready_for_manual_trading_checks':'attention_required',checks,
  manual:['Mera signup, refresh, sign out and signing unlock','Mera and MetaMask funding and approval/buy/sell confirmations','Portfolio, history and pending-transaction recovery','Original Kuru deposit, order, cancel, fill and withdraw'],
  separate:[rehearsal?'Use the exact rehearsal deadlines shown on its event cards':'Real-event assertions open after October 7, 2026 at 00:01 UTC','Pilot Kuru pairs and authenticated CRE delivery remain outside this mock checkpoint'],
  notice:'Passing these read-only checks does not verify wallet UX, Redis durability, Kuru fills or public settlement. No transaction was submitted.'};
await mkdir(new URL('target/mock-testing/',root),{recursive:true});
await writeFile(new URL(`target/mock-testing/${namespace}-readiness.json`,root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.status!=='ready_for_manual_trading_checks')process.exitCode=1;
