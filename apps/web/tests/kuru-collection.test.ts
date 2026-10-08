import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readKuruCollection,listingForCollection,parseKuruListing,parseKuruListings} from '../server/kuru-collection.mjs';
import {combineKuruListings} from '../scripts/combine-kuru-listings.mjs';
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

const second={pool:'0x'+'aa'.repeat(20),receipt:'0x'+'bb'.repeat(20),market:'0x'+'cc'.repeat(20),rulesHash:'0x'+'dd'.repeat(32)};
const listingTwo={...listing,...second};
const manifestTwo={...manifest,pool:second.pool,rulesHash:second.rulesHash,receipts:[second.receipt]};
const many=(count:number)=>({schema:'flurbo.kuru-listings.v1',listings:Array.from({length:count},(_,i)=>
  ({...listing,pool:'0x'+(i+1).toString(16).padStart(40,'0')}))});

test('a single legacy listing object still parses and resolves',()=>{
  assert.deepEqual(parseKuruListings(JSON.stringify(listing)),[listing]);
  assert.deepEqual(parseKuruListings(null),[]);
  assert.deepEqual(parseKuruListings(undefined),[]);
  assert.equal(listingForCollection(listing,manifest,0),listing);
  assert.equal(listingForCollection(null,manifest,0),null);
});

test('two listings on different pools each resolve to their own collection',()=>{
  const listings=parseKuruListings(JSON.stringify({schema:'flurbo.kuru-listings.v1',listings:[listing,listingTwo]}));
  assert.equal(listings.length,2);
  assert.equal(listingForCollection(listings,manifest,0)?.market,market);
  assert.equal(listingForCollection(listings,manifestTwo,0)?.market,second.market);
  assert.equal(listingForCollection(listings,manifestTwo,1),null);
  assert.equal(listingForCollection(listings,{...manifest,pool:wallet},0),null);
});

test('a repeated pool and event, too many listings or an unknown schema are rejected',()=>{
  assert.throws(()=>parseKuruListings({schema:'flurbo.kuru-listings.v1',listings:[listing,{...listing,market:second.market}]}),/Invalid Kuru listing configuration/);
  assert.equal(parseKuruListings(many(8)).length,8);
  assert.throws(()=>parseKuruListings(many(9)),/Invalid Kuru listing configuration/);
  assert.throws(()=>parseKuruListings({schema:'flurbo.kuru-listings.v1',listings:[]}),/Invalid Kuru listing configuration/);
  assert.throws(()=>parseKuruListings({schema:'flurbo.kuru-listings.v2',listings:[listing]}),/Invalid Kuru listing configuration/);
  assert.throws(()=>parseKuruListings('{not json'),/Invalid Kuru listing configuration/);
});

test('combining listings requires verified snapshots and produces a parseable bundle',()=>{
  const combined=combineKuruListings([listing,listingTwo]);
  assert.equal(combined.schema,'flurbo.kuru-listings.v1');
  assert.deepEqual(parseKuruListings(JSON.stringify(combined)),[listing,listingTwo]);
  assert.throws(()=>combineKuruListings([listing,{...listingTwo,status:'unverified_pilot_kuru'}]),/verified_kuru_snapshot/);
  assert.throws(()=>combineKuruListings([listing,listing]),/Invalid Kuru listing configuration/);
  assert.throws(()=>combineKuruListings([]),/Invalid Kuru listing configuration/);
});

test('authenticated route serves each configured pool from a multi-listing value',async()=>{
  const previous=process.env.FLURBO_KURU_LISTING_JSON;
  process.env.FLURBO_KURU_LISTING_JSON=JSON.stringify(combineKuruListings([listing,listingTwo]));
  let api;
  try{
    api=localApi({store:{read:async()=>({method:'passkey',address:wallet})},previewAccess:{allows:async()=>true},
      practiceCollections:{catalog:{collections:[{namespace:`practice-${pool.slice(2)}`,label:'One',pool},{namespace:`practice-${second.pool.slice(2)}`,label:'Two',pool:second.pool}]},
        services:new Map([[`practice-${pool.slice(2)}`,{manifest}],[`practice-${second.pool.slice(2)}`,{manifest:manifestTwo}]])}});
  }finally{if(previous===undefined)delete process.env.FLURBO_KURU_LISTING_JSON;else process.env.FLURBO_KURU_LISTING_JSON=previous;}
  const request=async(poolAddress:string,event:number)=>{
    const req={url:`/api/practice-${poolAddress.slice(2)}/kuru-listing?event=${event}`,method:'GET',headers:{host:'localhost:18767'}};
    let status=0,body:any;
    const res={writeHead:(code:number)=>{status=code;},end:(value:string)=>{body=JSON.parse(value);},setHeader:()=>{}};
    await api(req as any,res as any,()=>{});return {status,body};
  };
  assert.equal((await request(pool,0)).body.market,market);
  assert.equal((await request(second.pool,0)).body.market,second.market);
  assert.equal((await request(pool,1)).status,404);
});
