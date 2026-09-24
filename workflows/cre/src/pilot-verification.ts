import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData, keccak256, parseAbi, type Abi, type Address, type Hex } from 'viem';
import { preparePilot, resolverConfigAbi, pilotRulesHash, PILOT_CASH } from './pilot-config';
import { resolverAbi, pilotPoolAbi, pilotCashAbi } from '../../../apps/web/shared/pilot.mjs';

type Artifact = { deployedBytecode: { object: Hex; immutableReferences?: Record<string,{start:number;length:number}[]> } };
export function matchPilotRuntime(code: Hex, artifact: Artifact) {
  const compiled=artifact.deployedBytecode;
  if (!/^0x(?:[a-f0-9]{2})+$/i.test(code) || code.length !== compiled.object.length) throw new Error('Compiled runtime length mismatch');
  const actual=code.slice(2).toLowerCase().split(''), expected=compiled.object.slice(2).toLowerCase().split('');
  const used=new Set<number>();
  for (const group of Object.values(compiled.immutableReferences || {})) {
    if (!group.length) throw new Error('Invalid compiler immutable references');
    let first:string|undefined;
    for (const {start,length} of group) {
      if (!Number.isInteger(start) || start < 0 || length !== 32 || 2*(start+length) > actual.length) throw new Error('Invalid compiler immutable offset');
      const value=actual.slice(start*2,(start+length)*2).join('');
      if (first !== undefined && value !== first) throw new Error('Inconsistent immutable runtime copies');
      first=value;
      for(let i=start*2;i<(start+length)*2;i++) { if(used.has(i)) throw new Error('Overlapping immutable references'); used.add(i); actual[i]='0'; expected[i]='0'; }
    }
  }
  if(actual.join('')!==expected.join('')) throw new Error('Deployed code does not match the compiled contract');
  return keccak256(code);
}

export async function verifyPilot(prepared: ReturnType<typeof preparePilot>, deployment: {pool:Address;resolver:Address},
  rpc: (method:string,params:unknown[])=>Promise<any>, artifacts: Record<string,Artifact>, now:number) {
  const rebuilt=preparePilot(prepared.publication,prepared.preparedAt);
  if(rebuilt.resolverConfig!==prepared.resolverConfig || rebuilt.configHash!==prepared.configHash) throw new Error('Prepared rules mismatch');
  const [config]=decodeAbiParameters(resolverConfigAbi,rebuilt.resolverConfig);
  const pool=deployment.pool.toLowerCase() as Address, resolver=deployment.resolver.toLowerCase() as Address;
  for(const a of [pool,resolver]) if(!/^0x[0-9a-f]{40}$/.test(a) || /^0x0{40}$/.test(a)) throw new Error('Invalid contract address');
  if(new Set([pool,resolver,PILOT_CASH,rebuilt.creator]).size!==4) throw new Error('Deployment identities overlap');
  if(BigInt(await rpc('eth_chainId',[]))!==10143n) throw new Error('Public Monad testnet required');
  const head=await rpc('eth_getBlockByNumber',['latest',false]);
  if(!head || !/^0x[0-9a-f]{64}$/i.test(head.hash) || now-Number(BigInt(head.timestamp))>180 || now-Number(BigInt(head.timestamp)) < -15
    || Number(config.closesAt)<=now) throw new Error('Stale RPC or closed pilot');
  const tag=head.number;
  async function read(to:Address,abi:Abi,name:string,args:unknown[]=[]):Promise<any> {
    const data=encodeFunctionData({abi,functionName:name,args});
    return decodeFunctionResult({abi,functionName:name,data:await rpc('eth_call',[{to,data},tag])});
  }
  async function check(to:Address,abi:Abi,name:string,expected:unknown,args:unknown[]=[]){
    const result=await read(to,abi,name,args);
    if(String(result).toLowerCase()!==String(expected).toLowerCase()) throw new Error(`Deployment mismatch: ${name}`);
  }
  const rulesHash=pilotRulesHash(config,resolver,rebuilt.creator);
  for(const [name,value] of Object.entries({creator:rebuilt.creator,collateral:PILOT_CASH,pool,draftHash:config.draftHash,rulesHash,
    closesAt:config.closesAt,bond:config.bond,assertionPeriod:config.assertionPeriod,challengePeriod:config.challengePeriod,votingPeriod:config.votingPeriod,
    quorum:Math.floor(config.reviewers.length/2)+1,eventCount:config.eventHashes.length,delivered:false,lockedBonds:0,totalCredits:0})) await check(resolver,resolverAbi,name,value);
  for(let i=0;i<config.reviewers.length;i++) { await check(resolver,resolverAbi,'reviewers',config.reviewers[i],[BigInt(i)]); await check(resolver,resolverAbi,'isReviewer',true,[config.reviewers[i]]); }
  for(let i=0;i<config.eventHashes.length;i++) {
    await check(resolver,resolverAbi,'eventHashes',config.eventHashes[i],[BigInt(i)]);
    await check(resolver,resolverAbi,'observationEnds',config.observationEnds[i],[BigInt(i)]);
    if((await read(resolver,resolverAbi,'caseState',[i])).phase!==0) throw new Error('Pilot already has outcome activity');
  }
  const funding=config.eventHashes.length===2 ? 13_862_944n : 20_794_416n;
  for(const [name,value] of Object.entries({resolver,collateral:PILOT_CASH,settlementRulesHash:rulesHash,eventCount:config.eventHashes.length,
    liquidity:10_000_000,collateralDecimals:6,closesAt:config.closesAt,funded:true,resolved:false,requiredFunding:funding,requiredCollateral:0,resolvedState:0,voidMask:0})) await check(pool,pilotPoolAbi,name,value);
  await check(pool,pilotPoolAbi,'eliminationOrder',config.eventHashes.map((_,i)=>i));
  if((await read(pool,pilotPoolAbi,'factors')).length!==0)throw new Error('Pilot has prior trading activity; use a fresh deployment');
  await check(PILOT_CASH,pilotCashAbi,'decimals',6);
  await check(PILOT_CASH,pilotCashAbi,'allowance',0,[rebuilt.creator,pool]);
  if(await read(PILOT_CASH,pilotCashAbi,'balanceOf',[pool]) < funding) throw new Error('Initial funding missing');
  const factory=String(await read(pool,pilotPoolAbi,'baseTokenFactory')).toLowerCase() as Address;
  const codeHashes:Record<string,Hex>={};
  for(const [to,name] of [[pool,'PilotPool'],[resolver,'PilotResolver'],[factory,'FactoredBaseTokenFactory']] as const) {
    codeHashes[to]=matchPilotRuntime(await rpc('eth_getCode',[to,tag]),artifacts[name]);
  }
  const receiptAbi=parseAbi(['function pool() view returns (address)','function scope() view returns (uint32)','function mask() view returns (uint8)',
    'function decimals() view returns (uint8)','function totalSupply() view returns (uint256)']);
  const receipts:Address[]=[];
  for(let i=0;i<config.eventHashes.length;i++) {
    const receipt=String(await read(pool,pilotPoolAbi,'baseTokens',[2**i,2])).toLowerCase() as Address;
    codeHashes[receipt]=matchPilotRuntime(await rpc('eth_getCode',[receipt,tag]),artifacts.FactoredBaseToken);
    for(const [name,value] of Object.entries({pool,scope:2**i,mask:2,decimals:6,totalSupply:0})) await check(receipt,receiptAbi,name,value);
    receipts.push(receipt);
  }
  if((await rpc('eth_getBlockByNumber',[tag,false]))?.hash!==head.hash) throw new Error('Verification snapshot changed');
  return {schema:'flurbo.pilot-manifest.v1',status:'verified_pilot_snapshot',chainId:10143,pool,resolver,rulesHash,draftHash:config.draftHash,
    publication:rebuilt.publication,configHash:rebuilt.configHash,verifiedBlock:BigInt(tag).toString(),verifiedBlockHash:head.hash.toLowerCase(),
    verifiedTimestamp:Number(BigInt(head.timestamp)),codeHashes,receipts,
    notice:'Compiled code and reviewed configuration verified at one snapshot. Named panel trust, test assets only. Kuru pairs and authenticated CRE delivery are not established by this manifest.'};
}
