import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createPublicClient,http,recoverTransactionAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {monadTestnet} from 'viem/chains';
import {pilotService,pilotRpc,pilotEvidence} from '../server/pilot.mjs';
import {redisCommand} from '../server/redis-session.mjs';
import {evidenceAssistant} from '../server/evidence-assistant.mjs';
import {resolutionTick} from '../server/resolution-worker.mjs';

export async function runResolution(env=process.env){
  const manifest=JSON.parse(env.FLURBO_RESOLUTION_MANIFEST_JSON||'null');
  if(!manifest||manifest.pool!==env.FLURBO_RESOLUTION_POOL||manifest.rulesHash!==env.FLURBO_RESOLUTION_RULES_HASH)throw Error('Explicit pool and immutable rules allowlist required');
  const endpoint=env.FLURBO_ALCHEMY_TESTNET_RPC_URL||'https://testnet-rpc.monad.xyz';
  const rpc=pilotRpc(endpoint),service=pilotService({manifest,rpc}),command=redisCommand(env);
  const enabled=env.FLURBO_RESOLUTION_EXECUTE==='true';
  if(!['true','false'].includes(env.FLURBO_RESOLUTION_EXECUTE||'false'))throw Error('Invalid execution mode');
  const owner=env.FLURBO_RESOLUTION_SIGNER_ADDRESS?.toLowerCase();
  if(!/^0x[0-9a-f]{40}$/.test(owner||''))throw Error('Dedicated public signer address required');
  let account=null;
  if(enabled){account=privateKeyToAccount(env.FLURBO_RESOLUTION_PRIVATE_KEY);if(account.address.toLowerCase()!==owner)throw Error('Signer mismatch');}
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
  const assistant=evidenceAssistant({manifest,command,env});
  const evidence=async event=>{
    const q=manifest.publication.draft.events[event];
    if(manifest.publication.mode==='rehearsal'){
      const letter=event===0?'A':event===3?'D':null;
      if(!letter||q.source.recordId!==`flurbo-rehearsal.v1:${event}`||q.source.referenceUrl!=='https://flurbo.singu.online/rehearsal-rules'
        ||q.source.selectionRule!==`Scripted fixture ${letter} is YES. Exercise an unchallenged assertion.`)return null;
      const saved=await archive.put({eventId:q.id,outcome:2,statement:'Automatic practice assertion follows the immutable scripted YES fixture. This is not an AI prediction of a real-world event.',sourceURL:q.source.referenceUrl,attachment:JSON.stringify({rulesHash:manifest.rulesHash,fixture:q.source})},owner,manifest.draftHash);
      return {...saved,outcome:2};
    }
    const report=await assistant.review(q.id,true);
    if(report.assessment.recommendation!=='YES'||report.ai.status!=='generated')return null;
    const saved=await archive.put({eventId:q.id,outcome:2,statement:report.ai.explanation.summary.length>=20?report.ai.explanation.summary:'Source-checked automatic YES assertion; see the archived report and evidence.',sourceURL:report.evidence[0].endpoint,
      attachment:JSON.stringify({reportHash:report.reportHash,assessment:report.assessment,ai:report.ai,sourceHash:report.evidence[0].payloadHash})},owner,manifest.draftHash);
    return {...saved,outcome:2};
  };
  return resolutionTick({manifest,owner,service,command,evidence,transport,enabled});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  runResolution().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error(JSON.stringify({status:'resolution_stopped',message:'Inspect the explicit pool settings, signer funds, monitoring, evidence and pending journal. Sensitive upstream details withheld. No automatic replacement transaction.'}));process.exitCode=1;});
}
