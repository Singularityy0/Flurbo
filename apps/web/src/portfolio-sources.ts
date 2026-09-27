import {appFetch} from './platform-fetch';
import type {TradeActivity} from './portfolio-performance';
export type AgentExecution=Omit<TradeActivity,'quantity'|'cash'|'index'>&{quantity:string;cash:string;agentId:string;agentName:string};
export type PortfolioSources={account:string;wallets:string[];agentWallets?:string[];agentExecutions?:AgentExecution[]};
export async function portfolioSources(signal?:AbortSignal):Promise<PortfolioSources>{
  const response=await appFetch('/api/account/portfolio-sources',{credentials:'same-origin',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'Your portfolio could not be loaded.');return value;
}
// Receipt-verified recent executions make trades visible before the historical
// index catches up. Indexed logs take precedence and are never counted twice.
export function mergeAgentActivity(trades:TradeActivity[],executions:AgentExecution[]):TradeActivity[]{
  const seen=new Set(trades.map(t=>t.pool.toLowerCase()+':'+t.hash.toLowerCase())),result=[...trades];
  for(const e of executions){const key=e.pool.toLowerCase()+':'+e.hash.toLowerCase();if(seen.has(key))continue;seen.add(key);result.push({...e,quantity:BigInt(e.quantity),cash:BigInt(e.cash),index:0});}
  return result.sort((a,b)=>a.block-b.block||a.index-b.index);
}
export function tradeAgent(trade:TradeActivity,executions:AgentExecution[]){
  return executions.find(e=>e.pool===trade.pool&&e.hash===trade.hash&&e.owner===trade.owner&&e.scope===trade.scope&&e.mask===trade.mask&&e.action===trade.action);
}
