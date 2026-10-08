import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readKuruCollection,listingForCollection,parseKuruListing} from '../server/kuru-collection.mjs';
import {verifyKuruListing} from '../scripts/verify-kuru-listing.mjs';
import {localApi} from '../server/local-api.mjs';

const pool='0x'+'11'.repeat(20),receipt='0x'+'22'.repeat(20),market='0x'+'33'.repeat(20);
const cash='0x'+'44'.repeat(20),margin='0x'+'55'.repeat(20),wallet='0x'+'66'.repeat(20);
const hash='0x'+'77'.repeat(32),rulesHash='0x'+'88'.repeat(32);
const manifest={status:'verified_pilot_snapshot',chainId:10143,pool,rulesHash,resolver:'0x'+'99'.repeat(20),
  receipts:[receipt],publication:{draft:{closesAt:2000000000,events:[{id:'eth',question:'Will ETH/USD rise?'}]}}};
const listing={schema:'flurbo.kuru-listing.v1',status:'verified_kuru_snapshot',chainId:10143,
  pool,eventIndex:0,receipt,market,cash,margin,rulesHash,closesAt:2000000000,
  verifiedBlock:100,verifiedBlockHash:hash};
const words=(...values:bigint[])=>'0x'+values.map(value=>value.toString(16).padStart(64,'0')).join('');

test('Kuru listing is pinned to one verified collection and event',()=>{
  assert.deepEqual(parseKuruListing(JSON.stringify(listing)),listing);
  assert.equal(listingForCollection(listing,manifest,0),listing);
  assert.equal(listingForCollection(listing,manifest,1),null);
  assert.equal(listingForCollection(listing,{...manifest,pool:wallet},0),null);
  assert.throws(()=>parseKuruListing(JSON.stringify({...listing,status:'unverified_pilot_kuru'})),/Invalid/);
});

test('a simulated address with no deployed code cannot be published',async()=>{
  const deployment={status:'unverified_pilot_kuru',pool,eventIndex:0,receipt,market,cash,margin,operator:wallet};
  const client={getChainId:async()=>10143,getBlockNumber:async()=>101n,
    getBlock:async()=>({hash}),getCode:async()=> '0x',
    readContract:async({functionName}:{functionName:string})=>({funded:true,resolved:false,closesAt:2000000000n,
      resolver:manifest.resolver,collateral:cash,settlementRulesHash:rulesHash,baseTokens:receipt,
      pool,scope:1n,mask:2n,decimals:6n,verifiedMarket:true,creator:wallet} as Record<string,unknown>)[functionName]};
  await assert.rejects(verifyKuruListing({manifest,deployment,client,now:0}),/no deployed code/);
});

test('current Kuru snapshot is JSON serializable and closes trading at the pool deadline',async()=>{
  const params=words(1000000n,1000000n,BigInt(receipt),6n,BigInt(cash),6n,100n,10000n,100000000n,30n,10n);
  const client={getChainId:async()=>10143,getBlockNumber:async()=>101n,
    getBlock:async()=>({hash,timestamp:2000000000n}),getCode:async()=> '0x6000',
    readContract:async({functionName}:{functionName:string})=>({baseTokens:receipt,verifiedMarket:true,
      funded:true,resolved:false,closesAt:2000000000n,balanceOf:0n,allowance:0n,getBalance:0n,holdings:0n} as Record<string,unknown>)[functionName],
    call:async({data}:{data:string})=>({data:data==='0x90c9427c'?params:data==='0xb4de8b70'?words(2n**256n-1n,0n):words(0n)}),
    getLogs:async()=>[{address:market,blockNumber:101n,logIndex:1n,transactionIndex:2n,transactionHash:hash,topics:[],data:'0x',removed:false}]};
  const result=await readKuruCollection({listing,manifest,wallet,client,now:2000000000000});
  assert.equal(result.trading_available,false);
  assert.equal(result.wallet.address,wallet);
  assert.equal(result.contracts.eventIndex,0);
  assert.equal(result.kuru.best_bid_wad,null);
  assert.equal(result.activity.logs[0].blockNumber,101);
  assert.doesNotThrow(()=>JSON.stringify(result));
});

test('authenticated collection route publishes only the configured event listing',async()=>{
  const previous=process.env.FLURBO_KURU_LISTING_JSON;
  process.env.FLURBO_KURU_LISTING_JSON=JSON.stringify(listing);
  let api;
  try{
    api=localApi({store:{read:async()=>({method:'passkey',address:wallet})},previewAccess:{allows:async()=>true},
      practiceCollections:{catalog:{collections:[{namespace:`practice-${pool.slice(2)}`,label:'Test',pool}]},
        services:new Map([[`practice-${pool.slice(2)}`,{manifest}]])}});
  }finally{if(previous===undefined)delete process.env.FLURBO_KURU_LISTING_JSON;else process.env.FLURBO_KURU_LISTING_JSON=previous;}
  const request=async(event:number)=>{
    const req={url:`/api/practice-${pool.slice(2)}/kuru-listing?event=${event}`,method:'GET',headers:{host:'localhost:18767'}};
    let status=0,body:any;
    const res={writeHead:(code:number)=>{status=code;},end:(value:string)=>{body=JSON.parse(value);},setHeader:()=>{}};
    await api(req as any,res as any,()=>{});return {status,body};
  };
  const valid=await request(0);assert.equal(valid.status,200);assert.equal(valid.body.market,market);
  assert.equal((await request(1)).status,404);
});
