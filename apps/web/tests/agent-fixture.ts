import {decodeFunctionData,encodeFunctionResult,parseAbi} from 'viem';
import {agentApi} from '../server/agents/agent-api.mjs';
import {pilotFixture,owner} from './pilot-fixture.ts';

// Shared by agent API and browser tests: fake durable storage, an agent RPC over the pilot fixture with
// transaction mining, and a valid structured forecast. Not a test file.
export const alice='0x'+'ab'.repeat(20),bob='0x'+'cd'.repeat(20),origin='https://flurbo.singu.online',now=1_800_000_000;
export const multicall=parseAbi(['function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)']);

// Fake Upstash: the scripts the agent store sends, and nothing else.
export function fakeRedis(){
  const data=new Map<string,string>(),ttl=new Map<string,number>();
  const command=async(op:string,...a:any[])=>{
    if(op==='GET')return data.get(a[0])??null;
    if(op==='SET'){if(a.includes('NX')&&data.has(a[0]))return null;data.set(a[0],a[1]);return 'OK';}
    if(op==='DEL'){return data.delete(a[0])?1:0;}
    if(op==='MGET')return a.map(key=>data.get(key)??null);
    if(op==='EVAL'&&a[0].includes('ARGV[3]')){
      // The agent state save script: revision check, attribution claims, then the writes.
      const n=Number(a[1]),keys=a.slice(2,2+n),argv=a.slice(2+n),[key,rev]=keys,claims=keys.slice(2).map((k:string,i:number)=>({k,value:argv[3+2*i],mode:argv[4+2*i]}));
      if((data.get(rev)??'0')!==argv[0])return 0;
      if(claims.some((c:any)=>data.has(c.k)&&data.get(c.k)!==c.value&&c.mode==='claim'))return -1;
      for(const c of claims){if(c.mode==='release'){if(data.get(c.k)===c.value)data.delete(c.k);}else if(!data.has(c.k))data.set(c.k,c.value);}
      data.set(key,argv[1]);data.set(rev,argv[2]);return 1;
    }
    if(op==='EVAL'&&a[0].includes("redis.call('DEL'")){const [,,key,token]=a;if(data.get(key)===token){data.delete(key);return 1;}return 0;}
    if(op==='EVAL'&&a[0].includes('INCR')){const key=a[2],n=Number(data.get(key)??0)+1;data.set(key,String(n));if(n===1)ttl.set(key,Number(a[3]));return n;}
    if(op==='TTL')return data.has(a[0])?ttl.get(a[0])??-1:-2;
    if(op==='EXISTS')return data.has(a[0])?1:0;
    throw Error('Unexpected command '+op);
  };
  return {data,command};
}

export function setup({links=[owner],at=now}:{links?:string[];at?:number}={}){
  const f=pilotFixture(at,3),redis=fakeRedis(),txs=new Map<string,any>(),receipts=new Map<string,any>();
  // Agent RPC: multicall is expanded into the fixture's single reads; receipts come from a local table.
  const rpc=async(method:string,params:any[]=[])=>{
    if(method==='eth_call'&&params[0].to==='0xca11bde05977b3631167028862be2a173976ca11'){
      const calls=decodeFunctionData({abi:multicall,data:params[0].data}).args[0] as any[];
      const rows=[];
      for(const c of calls){try{rows.push({success:true,returnData:await f.rpc('eth_call',[{to:c.target,data:c.callData},params[1]])});}catch{rows.push({success:false,returnData:'0x'});}}
      return encodeFunctionResult({abi:multicall,functionName:'aggregate3',result:rows});
    }
    if(method==='eth_getTransactionByHash')return txs.get(params[0])??null;
    if(method==='eth_getTransactionReceipt')return receipts.get(params[0])??null;
    if(method==='eth_getBlockByNumber'&&params[0]==='latest')return {number:'0x70',hash:'0x'+'44'.repeat(32),timestamp:'0x'+at.toString(16)};
    if(method==='eth_getBlockByNumber'&&params[0]==='0x69')return {number:'0x69',hash:'0x'+'69'.repeat(32)};
    return f.rpc(method,params);
  };
  let clock=at;
  const linked={list:async(account:string)=>({account,wallets:links.map(w=>w.toLowerCase())})};
  const make=()=>agentApi({command:redis.command,hosted:true,serviceFor:(ns:string)=>ns==='pilot'?f.service:null,links:linked,rpc,now:()=>clock});
  const api=make();
  const call=async(login:string,method:string,path:string,input?:unknown,which=api)=>which.handle({method,path,input,login:{address:login,method:'passkey'},origin});
  const mine=(tx:{from:string;to:string;data:string},hash:string,{status='0x1',logs=[] as any[]}={})=>{
    txs.set(hash,{hash,chainId:'0x279f',from:tx.from,to:tx.to,input:tx.data,value:'0x0',blockHash:'0x'+'69'.repeat(32),blockNumber:'0x69'});
    receipts.set(hash,{transactionHash:hash,blockHash:'0x'+'69'.repeat(32),blockNumber:'0x69',status,logs});
  };
  return {f,redis,api,make,call,rpc,mine,txs,advance:(s:number)=>{clock+=s;}};
}
export const forecast=(pool:string,over:Record<string,unknown>={},at=now)=>({schema:'flurbo.agent-forecast.v1',pool,joint:{events:[0,1],statesPpm:['300000','100000','150000','450000']},
  evidence:[{id:'e1',title:'Release candidate tagged',source:'Project release page',url:'https://github.com/ethereum/go-ethereum/releases',observedAt:new Date((at-3600)*1000).toISOString(),note:'Illustrative test note.'}],
  assumptions:['Both releases share a dependency.'],uncertainty:'Test forecast only.',explanation:'The two releases usually ship together, so the joint outcome is more likely than independence suggests.',
  selfReportedConfidence:'medium',source:{kind:'provider',name:'claims-to-be-a-provider'},createdAt:new Date((at-60)*1000).toISOString(),...over});

