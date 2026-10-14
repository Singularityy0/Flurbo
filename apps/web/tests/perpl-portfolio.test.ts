import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPortfolio, portfolioFrame, estimatedPnl, ausd } from '../src/perpl-portfolio.ts';
const p={pid:4,acc:3,mkt:16,s:100,ep:1000,lv:100,c:'10000000',st:1,sd:1};
test('snapshots load positions and updates remove closed positions without disturbing other accounts',()=>{
  let state=portfolioFrame(emptyPortfolio(),{mt:26,d:[p,{...p,acc:8}]});
  assert.equal(state.positionsLoaded,true);assert.equal(state.positions.length,2);
  state=portfolioFrame(state,{mt:27,d:[{...p,st:2}]});
  assert.equal(state.positions.length,1);assert.equal(state.positions[0].account,8);
  state=portfolioFrame(state,{mt:26,d:[]});assert.equal(state.positions.length,0);
});
test('order removal and repeated fill delivery are handled without duplicate records',()=>{
  const o={oid:9,acc:3,mkt:16,t:1,s:100,p:1000,st:2};
  let state=portfolioFrame(emptyPortfolio(),{mt:23,d:[o]});assert.equal(state.orders.length,1);
  state=portfolioFrame(state,{mt:24,d:[{...o,r:true}]});assert.equal(state.orders.length,0);
  const frame={mt:25,d:[{...o,f:'100',at:{b:1,tx:1,l:1,txid:'0x'+'ab'.repeat(32)}}]};
  state=portfolioFrame(state,frame);state=portfolioFrame(state,frame);assert.equal(state.fills.length,1);
});
test('PnL applies side and asset scaling; signed AUSD amounts preserve losses',()=>{
  const state=portfolioFrame(emptyPortfolio(),{mt:26,d:[p]});
  const m={mark:1100,priceDecimals:1,sizeDecimals:2};
  assert.equal(estimatedPnl(state.positions[0],m),10);
  assert.equal(estimatedPnl({...state.positions[0],side:2},m),-10);
  assert.equal(ausd('-12345678'),'-12.345678');
  assert.equal(ausd('-100'),'-0.0001');
});
test('account stats are isolated and malformed positions do not produce invented values',()=>{
  const s={id:3,td:'100',tw:'0',tv:'100',tf:'1',trp:'-2',wr:5000,tt:2};
  let state=portfolioFrame(emptyPortfolio(),{mt:19,addr:'0x'+'ab'.repeat(20),sts:[s]});
  assert.equal(state.stats[0].realized,'-2');
  state=portfolioFrame(state,{mt:28,...s,trp:'3'});assert.equal(state.stats.length,1);assert.equal(state.stats[0].realized,'3');
  state=portfolioFrame(state,{mt:26,d:[{...p,ep:'oops'}]});assert.equal(state.positions.length,0);
});

test('official partially filled orders retain only remaining size',()=>{
 const state=portfolioFrame(emptyPortfolio(),{mt:23,d:[{oid:9,acc:3,mkt:16,t:1,os:100,fs:40,p:1000,st:3}]});
 assert.equal(state.orders[0].size,60);
});
