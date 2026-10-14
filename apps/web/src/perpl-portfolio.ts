// Read-only projection of Perpl's account streams. This module never submits orders.
export type Position = { id: number; account: number; market: number; side: 1 | 2; size: number; entry: number; leverage: number; collateral: string; status: number };
export type OpenOrder = { id: number; account: number; market: number; type: number; size: number; price: number; status: number };
export type TradeFill = { key: string; account: number; market: number; type: number; size: number; price: number | null; fee: string; hash: string | null };
export type AccountStats = { account: number; deposits: string; withdrawals: string; volume: string; fees: string; realized: string; winRate: number; trades: number };
export type Portfolio = { wallet: string | null; positions: Position[]; orders: OpenOrder[]; fills: TradeFill[]; stats: AccountStats[]; positionsLoaded: boolean; ordersLoaded: boolean; updated: number | null };
export const emptyPortfolio = (): Portfolio => ({ wallet: null, positions: [], orders: [], fills: [], stats: [], positionsLoaded: false, ordersLoaded: false, updated: null });
const obj = (value: unknown): Record<string, any> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
const num = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const amount = (value: unknown): value is string => typeof value === 'string' && /^-?\d{1,40}$/.test(value);
function stats(value: unknown): AccountStats | null {
  const r = obj(value);
  if (!r || !num(r.id) || !num(r.wr) || !num(r.tt) || ![r.td,r.tw,r.tv,r.tf,r.trp].every(amount)) return null;
  return { account:r.id, deposits:r.td, withdrawals:r.tw, volume:r.tv, fees:r.tf, realized:r.trp, winRate:r.wr, trades:r.tt };
}
function position(value: unknown): Position | null {
  const r=obj(value);
  if (!r || ![r.pid,r.acc,r.mkt,r.s,r.ep,r.lv,r.st].every(num) || !amount(r.c) || ![1,2].includes(r.sd)) return null;
  return { id:r.pid, account:r.acc, market:r.mkt, side:r.sd, size:r.s, entry:r.ep, leverage:r.lv, collateral:r.c, status:r.st };
}
function order(value: unknown): OpenOrder | null {
  const r=obj(value);
  if (!r || ![r.oid,r.acc,r.mkt,r.t,r.s,r.st].every(num) || (r.p !== undefined && !num(r.p))) return null;
  return { id:r.oid, account:r.acc, market:r.mkt, type:r.t, size:r.s, price:r.p ?? 0, status:r.st };
}
function merge<T extends {id:number;account:number;market:number}>(rows:T[], row:T) {
  return [...rows.filter(old=>old.id!==row.id || old.account!==row.account || old.market!==row.market),row];
}
export function portfolioFrame(previous: Portfolio, value: unknown, now=Date.now()): Portfolio {
  const f=obj(value); if (!f) return previous;
  if (f.mt===19) return { ...previous, wallet:typeof f.addr==='string' && /^0x[0-9a-f]{40}$/i.test(f.addr)?f.addr:null, stats:Array.isArray(f.sts)?f.sts.map(stats).filter((r:AccountStats|null):r is AccountStats=>r!==null):[],updated:now };
  if (f.mt===28) { const row=stats(f); return row?{...previous,stats:[...previous.stats.filter(s=>s.account!==row.account),row],updated:now}:previous; }
  if ([26,27].includes(f.mt) && Array.isArray(f.d)) {
    let rows=f.mt===26?[]:previous.positions;
    for (const raw of f.d) { const row=position(raw); if(row) rows=merge(rows,row).filter(p=>p.status===1 && p.size>0); }
    return {...previous,positions:rows,positionsLoaded:true,updated:now};
  }
  if ([23,24].includes(f.mt) && Array.isArray(f.d)) {
    let rows=f.mt===23?[]:previous.orders;
    for(const raw of f.d) { const row=order(raw); if(row) rows=merge(rows,row).filter(o=>!([4,5,6,7].includes(o.status)) && !(obj(raw)?.r===true && o.id===row.id && o.account===row.account && o.market===row.market)); }
    return {...previous,orders:rows,ordersLoaded:true,updated:now};
  }
  if (f.mt===25 && Array.isArray(f.d)) {
    let fills=previous.fills;
    for(const raw of f.d) {
      const r=obj(raw); if(!r || ![r.acc,r.mkt,r.oid,r.s,r.t].every(num) || !amount(r.f))continue;
      const at=obj(r.at); const hash=typeof at?.txid==='string'&&/^0x[0-9a-f]{64}$/i.test(at.txid)?at.txid:null;
      const key=JSON.stringify([r.acc,r.mkt,r.oid,at?.b,at?.tx,at?.l,r.p,r.s,r.t]);
      fills=[...fills.filter(fill=>fill.key!==key),{key,account:r.acc,market:r.mkt,type:r.t,size:r.s,price:num(r.p)?r.p:null,fee:r.f,hash}].slice(-100);
    }
    return {...previous,fills,updated:now};
  }
  return previous;
}
export function estimatedPnl(position:Position, market:{mark:number;priceDecimals:number;sizeDecimals:number}) {
  return ((market.mark-position.entry)/10**market.priceDecimals)*(position.size/10**market.sizeDecimals)*(position.side===1?1:-1);
}
export function ausd(raw:string) {
  if(!amount(raw))return '—';
  const value=BigInt(raw),neg=value<0n,absolute=neg?-value:value;
  const fraction=String(absolute%1_000_000n).padStart(6,'0').replace(/0+$/,'').padEnd(2,'0');
  return `${neg?'-':''}${absolute/1_000_000n}.${fraction}`;
}
