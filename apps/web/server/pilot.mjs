import { decodeFunctionResult, encodeFunctionData, keccak256, stringToHex } from 'viem';
import { pilotCash, pilotCashAbi, pilotPoolAbi, resolverAbi, pilotCall, evidenceURI, validClaim } from '../shared/pilot.mjs';
import {holderResolverAbi,dependsOnEvent,challengeCandidates} from '../shared/holder-challenge.mjs';

const address = value => {
  if(typeof value!=='string' || !/^0x[0-9a-f]{40}$/i.test(value) || /^0x0{40}$/i.test(value)) throw new Error('Invalid wallet');
  return value.toLowerCase();
};
const uint = value => { if(typeof value!=='string' || !/^(0|[1-9][0-9]{0,30})$/.test(value)) throw new Error('Invalid amount'); return BigInt(value); };
const json = value => JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));

export function pilotRpc(endpoint,request=fetch) {
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port||!['testnet-rpc.monad.xyz','monad-testnet.g.alchemy.com'].includes(url.hostname))throw new Error('Public Monad testnet RPC required');
  let id=0;
  return async(method,params=[])=>{
    if(!['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_estimateGas','eth_gasPrice','eth_getLogs'].includes(method))throw new Error('Pilot service is read-only');
    const callId=++id;
    const response=await request(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:callId,method,params}),signal:AbortSignal.timeout(15_000)});
    if(!response.ok && ![400,413].includes(response.status))throw new Error('Pilot RPC unavailable');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>1_000_000)throw new Error('Pilot RPC response too large');chunks.push(chunk);}
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(result.id!==callId||result.jsonrpc!=='2.0')throw new Error('Pilot RPC rejected the read');
    if(result.error) {
      // Keep provider details (which may contain credentials) out of errors.
      const error=new Error('Pilot RPC rejected the read');
      if(method==='eth_getLogs' && /block range|range.{0,40}(limit|large|exceed)|limit.{0,40}range|too many (results|logs)|response size/i.test(String(result.error.message||''))) error.code='LOG_RANGE_LIMIT';
      throw error;
    }
    if(!response.ok||!Object.hasOwn(result,'result'))throw new Error('Pilot RPC rejected the read');
    return result.result;
  };
}

export function pilotService({manifest, rpc, now=()=>Math.floor(Date.now()/1000)}) {
  if(manifest?.schema!=='flurbo.pilot-manifest.v1' || manifest.status!=='verified_pilot_snapshot' || manifest.chainId!==10143
    || ![2,3,4].includes(manifest.publication?.draft?.events?.length) || ![3,5].includes(manifest.publication?.reviewers?.length)) throw new Error('Verified pilot manifest required');
  address(manifest.pool); address(manifest.resolver);
  if(manifest.challengePolicy&&(manifest.challengePolicy.version!=='account-holders-v1'||address(manifest.challengePolicy.authority)!==manifest.challengePolicy.authority))throw Error('Invalid holder challenge policy');
  for(const key of [manifest.pool,manifest.resolver]) if(!/^0x[0-9a-f]{64}$/.test(manifest.codeHashes?.[key]||'')) throw new Error('Compiled pilot evidence required');
  const tagFor = s=>'0x'+BigInt(s.blockNumber).toString(16);
  async function read(to,abi,functionName,args=[],tag='latest') {
    const data=encodeFunctionData({abi,functionName,args});
    return decodeFunctionResult({abi,functionName,data:await rpc('eth_call',[{to,data},tag])});
  }
  async function snapshot() {
    if(BigInt(await rpc('eth_chainId',[]))!==10143n) throw new Error('Wrong network');
    const anchor=await rpc('eth_getBlockByNumber',['0x'+BigInt(manifest.verifiedBlock).toString(16),false]);
    if(anchor?.hash?.toLowerCase()!==manifest.verifiedBlockHash) throw new Error('Deployment anchor changed');
    const head=await rpc('eth_getBlockByNumber',['latest',false]);
    if(!head || !/^0x[0-9a-f]{64}$/i.test(head.hash) || now()-Number(BigInt(head.timestamp))>180 || now()-Number(BigInt(head.timestamp)) < -15) throw new Error('Stale chain data');
    for(const to of [manifest.pool,manifest.resolver]) {
      const code=await rpc('eth_getCode',[to,head.number]);
      if(keccak256(code)!==manifest.codeHashes[to]) throw new Error('Contract code changed');
    }
    if((await read(manifest.pool,pilotPoolAbi,'settlementRulesHash',[],head.number)).toLowerCase()!==manifest.rulesHash
      || (await read(manifest.resolver,resolverAbi,'pool',[],head.number)).toLowerCase()!==manifest.pool) throw new Error('Pilot binding changed');
    if(manifest.challengePolicy&&(await read(manifest.resolver,holderResolverAbi,'eligibilitySigner',[],head.number)).toLowerCase()!==manifest.challengePolicy.authority)throw Error('Challenge authority changed');
    return {blockNumber:BigInt(head.number).toString(),blockHash:head.hash.toLowerCase(),timestamp:Number(BigInt(head.timestamp))};
  }
  async function stable(s) { if((await rpc('eth_getBlockByNumber',[tagFor(s),false]))?.hash?.toLowerCase()!==s.blockHash) throw new Error('Snapshot changed'); }
  async function account(owner) {
    owner=address(owner);
    const s=await snapshot();
    const cash=await read(pilotCash,pilotCashAbi,'balanceOf',[owner],tagFor(s));
    // A traded scope is retained in the pool's factor tables. Use it to discover
    // candidate combinations without waiting for the historical event index.
    // A scope says nothing about this wallet's ownership; positions() checks that.
    const factors=await read(manifest.pool,pilotPoolAbi,'factors',[],tagFor(s));
    const claimScopes=[...new Set(factors.map(f=>f.scope))];
    await stable(s);
    return json({manifest,snapshot:s,wallet:{address:owner,cash},claimScopes});
  }
  async function status(owner) {
    if(owner) address(owner);
    const s=await snapshot(), tag=tagFor(s);
    const cases=[];
    for(let i=0;i<manifest.publication.draft.events.length;i++) {
      const state=await read(manifest.resolver,resolverAbi,'caseState',[i],tag);
      cases.push({...state,assertionDeadline:await read(manifest.resolver,resolverAbi,'assertionDeadline',[i],tag),
        voted:owner?await read(manifest.resolver,resolverAbi,'voted',[i,owner],tag):false});
    }
    const liquidity=await read(manifest.pool,pilotPoolAbi,'liquidity',[],tag);
    const result={manifest,snapshot:s,cases,maxTradeQuantityAtoms:liquidity<100_000_000n?liquidity:100_000_000n,delivered:await read(manifest.resolver,resolverAbi,'delivered',[],tag),
      requiredCollateral:await read(manifest.pool,pilotPoolAbi,'requiredCollateral',[],tag),
      poolCash:await read(pilotCash,pilotCashAbi,'balanceOf',[manifest.pool],tag),
      resolved:await read(manifest.pool,pilotPoolAbi,'resolved',[],tag),voidMask:await read(manifest.pool,pilotPoolAbi,'voidMask',[],tag),
      wallet:owner?{address:owner,cash:await read(pilotCash,pilotCashAbi,'balanceOf',[owner],tag),credits:await read(manifest.resolver,resolverAbi,'credits',[owner],tag),
        reviewer:await read(manifest.resolver,resolverAbi,'isReviewer',[owner],tag)}:null};
    await stable(s); return json(result);
  }
  // One verified snapshot for the browse page. Prices are one-share buy costs,
  // never promises of execution or wallet approvals.
  async function markets() {
    const s=await snapshot(),tag=tagFor(s);
    const resolved=await read(manifest.pool,pilotPoolAbi,'resolved',[],tag);
    const open=s.timestamp<manifest.publication.draft.closesAt && !resolved;
    const prices=await Promise.all(manifest.publication.draft.events.map(async(_,event)=>({event,
      yes:open?await read(manifest.pool,pilotPoolAbi,'quoteBuy',[2**event,2n,1_000_000n],tag):null,
      no:open?await read(manifest.pool,pilotPoolAbi,'quoteBuy',[2**event,1n,1_000_000n],tag):null})));
    await stable(s);return json({manifest,snapshot:s,open,resolved,prices});
  }
  async function prepare(input) {
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['owner','action','event','outcome','evidenceHash','evidenceURI','scope','mask','quantity','slippageBps','authorization','signature'].includes(k))) throw new Error('Invalid action');
    if((input.authorization||input.signature)&&(!manifest.challengePolicy||input.action!=='dispute'))throw Error('Unexpected challenge authorization');
    const owner=address(input.owner), s=await snapshot(), tag=tagFor(s);
    let to=manifest.resolver, abi=resolverAbi, name=input.action, args=[], amount=0n, minimumReceived=0n, title=name;
    if(['assertOutcome','dispute','vote'].includes(name)) {
      if(!Number.isInteger(input.event) || input.event<0 || input.event>=manifest.publication.draft.events.length || ![1,2,3].includes(input.outcome)
        || !/^0x[0-9a-f]{64}$/i.test(input.evidenceHash||'') || /^0x0{64}$/.test(input.evidenceHash) || !evidenceURI(input.evidenceURI)) throw new Error('Evidence and outcome required');
      args=[input.event,input.outcome,input.evidenceHash,input.evidenceURI];
      const c=await read(manifest.resolver,resolverAbi,'caseState',[input.event],tag);
      const reviewer=await read(manifest.resolver,resolverAbi,'isReviewer',[owner],tag);
      if(name==='assertOutcome') {
        const end=manifest.publication.draft.events[input.event].observationEndsAt;
        if(reviewer || c.phase!==0 || s.timestamp<end || s.timestamp>=end+manifest.publication.assertionPeriod)throw new Error('Assertion window is not open for this wallet');
      }else if(name==='dispute') {
        if(reviewer || c.phase!==1 || c.asserter.toLowerCase()===owner || c.proposal===input.outcome || BigInt(s.timestamp)>=c.challengeUntil)throw new Error('Challenge is not available for this wallet and outcome');
        if(manifest.challengePolicy){
          if(!input.authorization||!input.signature||input.authorization.challenger!==owner)throw Error('Account eligibility authorization required');
          abi=holderResolverAbi;args.push(input.authorization,input.signature);
        }
      }else if(!reviewer || c.phase!==2 || BigInt(s.timestamp)>=c.voteUntil || await read(manifest.resolver,resolverAbi,'voted',[input.event,owner],tag))throw new Error('Vote is not available for this reviewer');
      if(name!=='vote') amount=BigInt(manifest.publication.bondAtoms);
    } else if(name==='finalize') {
      if(!Number.isInteger(input.event) || input.event<0 || input.event>=manifest.publication.draft.events.length) throw new Error('Invalid event');
      args=[input.event];
    } else if(['buy','sell','redeem'].includes(name)) {
      to=manifest.pool; abi=pilotPoolAbi;
      const mask=uint(input.mask), quantity=uint(input.quantity);
      if(!validClaim(input.scope,mask,manifest.publication.draft.events.length) || quantity===0n || quantity>100_000_000n) throw new Error('Unsupported claim or quantity');
      args=[input.scope,mask,quantity];
      if(name!=='buy' && await read(to,abi,'holdings',[owner,input.scope,mask],tag)<quantity) throw new Error('Not enough shares in this wallet');
      if(name!=='redeem') {
        if(![10,50,100].includes(input.slippageBps)) throw new Error('Choose a supported slippage limit');
        const quote=await read(to,abi,name==='buy'?'quoteBuy':'quoteSell',args,tag);
        const limit=name==='buy'?(quote*BigInt(10000+input.slippageBps)+9999n)/10000n:quote*BigInt(10000-input.slippageBps)/10000n;
        const deadline=Math.min(s.timestamp+300,manifest.publication.draft.closesAt-1);
        args.push(limit,BigInt(deadline));
        if(name==='buy') amount=limit;
        else minimumReceived=limit;
      }
    } else if(!['deliver','withdrawBond'].includes(name)) throw new Error('Unsupported pilot action');
    const originalData=encodeFunctionData({abi,functionName:name,args});
    if(!pilotCall({to,data:originalData,manifest})) throw new Error('Action exceeds pilot policy');
    if(amount) {
      if(await read(pilotCash,pilotCashAbi,'balanceOf',[owner],tag)<amount) throw new Error('Not enough test AUSD in this wallet');
      if(await read(pilotCash,pilotCashAbi,'allowance',[owner,to],tag)<amount) {
        title=`Approve ${input.action}`; args=[to,amount]; to=pilotCash; abi=pilotCashAbi; name='approve';
      }
    }
    const data=encodeFunctionData({abi,functionName:name,args}), transaction={from:owner,to,data,value:'0x0',chainId:'0x279f'};
    await rpc('eth_call',[transaction,tag]);
    const gasLimit=BigInt(await rpc('eth_estimateGas',[transaction]))*120n/100n;
    const gasPrice=BigInt(await rpc('eth_gasPrice',[]));
    if(gasLimit<=0n || gasLimit>15_000_000n || gasPrice<=0n || gasPrice>500_000_000_000n) throw new Error('Gas exceeds pilot policy');
    await stable(s);
    return json({schema:'flurbo.pilot-review.v1',manifest,snapshot:s,expiresAt:s.timestamp+300,action:name,requested:input,title,
      amountAtoms:amount.toString(),minimumReceivedAtoms:minimumReceived.toString(),gasLimit:gasLimit.toString(),gasPrice:gasPrice.toString(),maximumFeeWei:(gasLimit*gasPrice).toString(),
      transaction,notice:name==='approve'?'Approve the exact token allowance, then review the intended action separately.':'Review the outcome, evidence and wallet before confirming.'});
  }
  async function position(owner,scope,mask) {
    address(owner); const m=uint(mask);
    if(!validClaim(scope,m,manifest.publication.draft.events.length)) throw new Error('Unsupported claim');
    const s=await snapshot(),tag=tagFor(s);
    const quantity=await read(manifest.pool,pilotPoolAbi,'holdings',[owner,scope,m],tag);
    const resolved=await read(manifest.pool,pilotPoolAbi,'resolved',[],tag);
    const fraction=resolved?await read(manifest.pool,pilotPoolAbi,'payoutFraction',[scope,m],tag):null;
    await stable(s);
    return json({snapshot:s,owner,scope,mask,quantity,payoutAtoms:fraction?quantity*fraction[0]/fraction[1]:null,fraction});
  }
  async function positions(owner,claims) {
    address(owner);
    if(!Array.isArray(claims)||claims.length>30)throw new Error('Use pages of at most thirty claims');
    const s=await snapshot(),tag=tagFor(s),resolved=await read(manifest.pool,pilotPoolAbi,'resolved',[],tag),rows=[];
    // Validate the entire request before doing holdings reads. Bound parallelism
    // so a page does not serialize thirty RPC round trips (or burst thirty).
    for(const claim of claims){
      const mask=uint(claim.mask);
      if(!validClaim(claim.scope,mask,manifest.publication.draft.events.length))throw new Error('Unsupported claim');
    }
    for(let offset=0;offset<claims.length;offset+=4)rows.push(...await Promise.all(claims.slice(offset,offset+4).map(async claim=>{
      const mask=uint(claim.mask),quantity=await read(manifest.pool,pilotPoolAbi,'holdings',[owner,claim.scope,mask],tag);
      const fraction=resolved&&quantity>0n?await read(manifest.pool,pilotPoolAbi,'payoutFraction',[claim.scope,mask],tag):null;
      return {...claim,quantity,payoutAtoms:resolved?(fraction?quantity*fraction[0]/fraction[1]:0n):null};
    })));
    await stable(s);return json({snapshot:s,owner,rows});
  }
  async function stakeAt(event,stake,s){
    if(!stake||Object.keys(stake).sort().join(',')!=='holder,mask,scope,wrapped'||typeof stake.wrapped!=='boolean')throw Error('Invalid holding witness');
    const holder=address(stake.holder),mask=uint(stake.mask),tag=tagFor(s);
    if(!dependsOnEvent(stake.scope,mask,event,manifest.publication.draft.events.length))return false;
    if(manifest.challengePolicy)return read(manifest.resolver,holderResolverAbi,'hasQualifyingShares',[holder,event,stake.scope,mask,stake.wrapped],tag);
    if(stake.wrapped){
      if(stake.scope!==2**event||![1n,2n].includes(mask))return false;
      const token=await read(manifest.pool,pilotPoolAbi,'baseTokens',[stake.scope,Number(mask)],tag);
      return !/^0x0{40}$/.test(token)&&await read(token,pilotCashAbi,'balanceOf',[holder],tag)>0n;
    }
    return await read(manifest.pool,pilotPoolAbi,'holdings',[holder,stake.scope,mask],tag)>0n;
  }
  async function challengeStake(event,stake){
    const s=await snapshot();
    if(!Number.isInteger(event)||event<0||event>=manifest.publication.draft.events.length)throw Error('Invalid event');
    const c=await read(manifest.resolver,resolverAbi,'caseState',[event],tagFor(s));
    const eligible=c.phase===1&&BigInt(s.timestamp)<c.challengeUntil&&await stakeAt(event,stake,s);
    await stable(s);return json({eligible,snapshot:s,challengeUntil:c.challengeUntil});
  }
  async function challengeEligibility(wallets,event,cursor=0){
    if(!Array.isArray(wallets)||wallets.length>20||!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(event)||event<0||event>=manifest.publication.draft.events.length)throw Error('Invalid eligibility request');
    wallets=wallets.map(address);
    const s=await snapshot(),tag=tagFor(s),factors=await read(manifest.pool,pilotPoolAbi,'factors',[],tag);
    const candidates=challengeCandidates(wallets,event,manifest.publication.draft.events.length,[...new Set(factors.map(f=>f.scope))]);
    // Bounded continuation prevents a wallet with no positions from causing an unbounded RPC scan.
    const page=candidates.slice(cursor,cursor+24);let witness=null;
    for(let i=0;i<page.length&&!witness;i+=4){const batch=page.slice(i,i+4),checks=await Promise.all(batch.map(stake=>stakeAt(event,stake,s)));witness=batch.find((_,j)=>checks[j])||null;}
    await stable(s);return json({eligible:!!witness,stake:witness,nextCursor:witness||cursor+24>=candidates.length?null:cursor+24,snapshot:s});
  }
  return {manifest,status,account,markets,prepare,snapshot,position,positions,challengeStake,challengeEligibility};
}

export function pilotEvidence(command, origin, now=()=>Date.now()) {
  const key=hash=>`flurbo:pilot:evidence:v1:${hash}`;
  return {
    async put(input,login,draftHash) {
      if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['eventId','outcome','statement','sourceURL','attachment'].includes(k))
        || typeof input.eventId!=='string' || input.eventId.length>96 || ![1,2,3].includes(input.outcome)
        || typeof input.statement!=='string' || input.statement.trim().length<20 || input.statement.length>8000
        || !evidenceURI(input.sourceURL) || typeof input.attachment!=='string' || input.attachment.length>12000) throw new Error('Provide bounded public evidence');
      const body=JSON.stringify({schema:'flurbo.pilot-evidence.v1',draftHash,uploader:login,eventId:input.eventId,outcome:input.outcome,
        statement:input.statement,sourceURL:input.sourceURL,attachment:input.attachment});
      const hash=keccak256(stringToHex(body));
      if(await command('GET',key(hash))===body) return {hash,uri:`${origin}/api/pilot/evidence/${hash}`,body};
      // Durable account and service caps bound new uploads across restarts. Reusing identical evidence is free.
      const hour=Math.floor(now()/3_600_000);
      const quota="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],7200) end; return n";
      const accountCount=Number(await command('EVAL',quota,1,`flurbo:pilot:evidence-quota:${hour}:${login}`));
      if(!Number.isSafeInteger(accountCount)||accountCount<1||accountCount>20) throw new Error('Evidence upload limit reached. Reuse stored evidence or retry next hour.');
      const serviceCount=Number(await command('EVAL',quota,1,`flurbo:pilot:evidence-quota:${hour}:all`));
      if(!Number.isSafeInteger(serviceCount)||serviceCount<1||serviceCount>200) throw new Error('Evidence service upload limit reached. Retry next hour.');
      // No expiry: evidence must outlive a login, deployment and settlement. Immutable by content hash.
      await command('SET',key(hash),body,'NX');
      if(await command('GET',key(hash))!==body) throw new Error('Evidence persistence failed');
      return {hash,uri:`${origin}/api/pilot/evidence/${hash}`,body};
    },
    async get(hash) {
      if(!/^0x[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid evidence hash');
      const body=await command('GET',key(hash));
      if(typeof body!=='string' || keccak256(stringToHex(body))!==hash) throw new Error('Evidence unavailable');
      return body;
    },
  };
}
