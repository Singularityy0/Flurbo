import type { PilotNamespace } from './pilot';

export type CheckoutDraft={event:number;yes:boolean;legs:number[];answers:Record<number,boolean>;quantity:string;side:'buy'|'sell'|'redeem';walletKind?:'mera'|'browser'};
const key=(namespace:PilotNamespace,login:string)=>`flurbo.checkout.v1:${namespace}:${login.toLowerCase()}`;
function valid(value:unknown):value is CheckoutDraft {
  const d=value as CheckoutDraft;
  return !!d&&Number.isInteger(d.event)&&d.event>=0&&d.event<4&&typeof d.yes==='boolean'
    &&Array.isArray(d.legs)&&d.legs.length>0&&d.legs.length<=3&&new Set(d.legs).size===d.legs.length&&d.legs.includes(d.event)
    &&d.legs.every(i=>Number.isInteger(i)&&i>=0&&i<4)&&!!d.answers&&typeof d.answers==='object'
    &&Object.entries(d.answers).every(([i,v])=>/^[0-3]$/.test(i)&&typeof v==='boolean')
    &&typeof d.quantity==='string'&&d.quantity.length<=40
    &&['buy','sell','redeem'].includes(d.side)&&[undefined,'mera','browser'].includes(d.walletKind);
}
// Only form fields are restored. A saved draft never grants signing permission.
export function readCheckout(namespace:PilotNamespace,login:string):CheckoutDraft|null {
  const raw=localStorage.getItem(key(namespace,login));
  if(!raw)return null;
  if(raw.length>2000)throw new Error('Saved prediction is invalid.');
  const draft:unknown=JSON.parse(raw);
  if(!valid(draft))throw new Error('Saved prediction is invalid.');
  return draft;
}
export function saveCheckout(namespace:PilotNamespace,login:string,draft:CheckoutDraft){
  if(!valid(draft))throw new Error('Invalid prediction draft.');
  localStorage.setItem(key(namespace,login),JSON.stringify(draft));
}
export function clearCheckout(namespace:PilotNamespace,login:string){localStorage.removeItem(key(namespace,login));}
