import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createPublicClient,http,recoverTransactionAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {pilotService,pilotRpc,pilotEvidence} from '../server/pilot.mjs';
import {redisCommand} from '../server/redis-session.mjs';
import {evidenceAssistant} from '../server/evidence-assistant.mjs';
import {resolutionTick} from '../server/resolution-worker.mjs';
import {activityEvidence} from '../server/ethereum-activity.mjs';
import {validateActivityDraft} from '../shared/ethereum-activity.mjs';

const diagnosticMessages={
  CONFIGURATION_INVALID:'Check the manifest, pool, rules hash, execution mode and public signer settings.',
  BOT_KEY_MISSING:'Add FLURBO_RESOLUTION_PRIVATE_KEY as a repository Actions secret for the dedicated bot.',
  BOT_KEY_INVALID:'The bot secret must contain one 64-digit hexadecimal private key, optionally prefixed with 0x. Do not use a seed phrase or keystore JSON.',
  BOT_KEY_MISMATCH:'The key does not belong to FLURBO_RESOLUTION_SIGNER_ADDRESS. Use the dedicated bot wallet key.',
  RPC_READ_FAILED:'The testnet RPC read failed or was rejected. Check provider availability and quota.',
  DURABLE_STATE_FAILED:'The Redis operation failed. Check its availability and the worker repository secrets.',
  WORKER_CHECK_FAILED:'A worker policy, deployment, monitoring or pending transaction check failed. Preserve the journal and inspect the latest monitor run.',
};
class ResolutionDiagnostic extends Error{
  constructor(code){super(diagnosticMessages[code]);this.code=code;}
}
export function resolutionFailure(error){
  const code=error instanceof ResolutionDiagnostic?error.code:'WORKER_CHECK_FAILED';
  return {status:'resolution_stopped',code,message:diagnosticMessages[code]+' Sensitive values withheld. No automatic replacement transaction.'};
}
export function resolutionSigner(value,owner){
  if(typeof value!=='string'||!value.trim())throw new ResolutionDiagnostic('BOT_KEY_MISSING');
  const hex=value.trim().replace(/^0x/i,'');
  if(!/^[0-9a-fA-F]{64}$/.test(hex))throw new ResolutionDiagnostic('BOT_KEY_INVALID');
  let account;
  try{account=privateKeyToAccount(`0x${hex}`);}catch{throw new ResolutionDiagnostic('BOT_KEY_INVALID');}
  if(account.address.toLowerCase()!==owner.toLowerCase())throw new ResolutionDiagnostic('BOT_KEY_MISMATCH');
  return account;
}
const guarded=(code,fn)=>async(...args)=>{try{return await fn(...args);}catch{throw new ResolutionDiagnostic(code);}};

export async function runResolution(env=process.env){
  let configured=false;
  try{
  const manifest=JSON.parse(env.FLURBO_RESOLUTION_MANIFEST_JSON||'null');
  if(!manifest||manifest.pool!==env.FLURBO_RESOLUTION_POOL||manifest.rulesHash!==env.FLURBO_RESOLUTION_RULES_HASH)throw Error('Explicit pool and immutable rules allowlist required');
  if(manifest.publication?.mode==='ethereum-activity')validateActivityDraft(manifest.publication.draft);
  const endpoint=env.FLURBO_ALCHEMY_TESTNET_RPC_URL||'https://testnet-rpc.monad.xyz';
  const rpc=guarded('RPC_READ_FAILED',pilotRpc(endpoint)),service=pilotService({manifest,rpc}),command=guarded('DURABLE_STATE_FAILED',redisCommand(env));
  const enabled=env.FLURBO_RESOLUTION_EXECUTE==='true';
  if(!['true','false'].includes(env.FLURBO_RESOLUTION_EXECUTE||'false'))throw Error('Invalid execution mode');
  const owner=env.FLURBO_RESOLUTION_SIGNER_ADDRESS?.toLowerCase();
  if(!/^0x[0-9a-f]{40}$/.test(owner||''))throw Error('Dedicated public signer address required');
  let account=null;
  if(enabled)account=resolutionSigner(env.FLURBO_RESOLUTION_PRIVATE_KEY,owner);
  const client=createPublicClient({chain:monadTestnet,transport:http(endpoint,{retryCount:0,timeout:15000})});
  const transport={
    async receipt(hash){
      const r=await client.request({method:'eth_getTransactionReceipt',params:[hash]});
      if(!r)return null;
      if(r.transactionHash!==hash||!['0x0','0x1'].includes(r.status)||!r.blockHash||!r.blockNumber)throw Error('Invalid receipt');
      const head=await client.getBlockNumber(),block=await client.getBlock({blockNumber:BigInt(r.blockNumber)});
      if(block.hash!==r.blockHash)throw Error('Receipt block changed');
      return {confirmed:head>=BigInt(r.blockNumber)+2n,success:r.status==='0x1'};
    },
    async sign(review){
      if(!account||!enabled)throw Error('Execution disabled');
      if(await client.getChainId()!==10143)throw Error('Wrong chain');
      const nonce=await client.getTransactionCount({address:owner,blockTag:'pending'});
      if(nonce!==await client.getTransactionCount({address:owner,blockTag:'latest'}))throw Error('Untracked signer transaction pending');
      const gas=BigInt(review.gasLimit),gasPrice=BigInt(review.gasPrice);
      if(await client.getBalance({address:owner})<gas*gasPrice)throw Error('Fund dedicated signer gas');
      const raw=await account.signTransaction({type:'legacy',chainId:10143,nonce,to:review.transaction.to,data:review.transaction.data,value:0n,gas,gasPrice});
      if((await recoverTransactionAddress({serializedTransaction:raw})).toLowerCase()!==owner)throw Error('Signed sender mismatch');
      return raw;
    },
    async broadcast(raw){if(!enabled)throw Error('Execution disabled');return client.sendRawTransaction({serializedTransaction:raw});}
  };
  const archive=pilotEvidence(command,'https://flurbo.singu.online');
  const evidence=async event=>{
    const q=manifest.publication.draft.events[event];
    if(manifest.publication.mode==='ethereum-activity'){
      try{return await (await activityEvidence(manifest,command,archive,owner))(event);}catch{return null;}
    }
    if(manifest.publication.mode==='rehearsal'){
      const letter=event===0?'A':event===3?'D':null;
      if(!letter||q.source.recordId!==`flurbo-rehearsal.v1:${event}`||q.source.referenceUrl!=='https://flurbo.singu.online/rehearsal-rules'
        ||q.source.selectionRule!==`Scripted fixture ${letter} is YES. Exercise an unchallenged assertion.`)return null;
      const saved=await archive.put({eventId:q.id,outcome:2,statement:'Automatic practice assertion follows the immutable scripted YES fixture. This is not an AI prediction of a real-world event.',sourceURL:q.source.referenceUrl,attachment:JSON.stringify({rulesHash:manifest.rulesHash,fixture:q.source})},owner,manifest.draftHash);
      return {...saved,outcome:2};
    }
    const report=await evidenceAssistant({manifest,command,env}).review(q.id,true);
    if(report.assessment.recommendation!=='YES'||report.ai.status!=='generated')return null;
    const saved=await archive.put({eventId:q.id,outcome:2,statement:report.ai.explanation.summary.length>=20?report.ai.explanation.summary:'Source-checked automatic YES assertion; see the archived report and evidence.',sourceURL:report.evidence[0].endpoint,
      attachment:JSON.stringify({reportHash:report.reportHash,assessment:report.assessment,ai:report.ai,sourceHash:report.evidence[0].payloadHash})},owner,manifest.draftHash);
    return {...saved,outcome:2};
  };
  configured=true;
  return await resolutionTick({manifest,owner,service,command,evidence,transport,enabled});
  }catch(error){
    if(error instanceof ResolutionDiagnostic)throw error;
    throw new ResolutionDiagnostic(configured?'WORKER_CHECK_FAILED':'CONFIGURATION_INVALID');
  }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  (async()=>{
    if(process.argv.slice(2).some(a=>a!=='--drain')||process.argv.length>3)throw Error('Use --drain or no arguments');
    const deadline=Date.now()+150000,limit=process.argv.includes('--drain')?12:1;
    for(let i=0;i<limit;i++){
      const result=await runResolution();console.log(JSON.stringify(result));
      if(!['submitted','confirmed'].includes(result.status)||Date.now()>deadline)break;
      await new Promise(resolve=>setTimeout(resolve,4000));
    }
  })().catch(error=>{console.error(JSON.stringify(resolutionFailure(error)));process.exitCode=1;});
}
