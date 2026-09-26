import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readCheckout,saveCheckout,clearCheckout} from '../src/checkout.ts';

test('checkout drafts restore inputs after approval, isolate login and pool, and contain no transaction authorization',()=>{
  const db=new Map<string,string>();
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>db.get(k)??null,setItem:(k:string,v:string)=>db.set(k,v),removeItem:(k:string)=>db.delete(k)}});
  const draft={event:1,yes:false,legs:[1],answers:{1:false},quantity:'5',side:'buy' as const,walletKind:'browser' as const};
  try{
    saveCheckout('rehearsal','0xABC',draft);assert.deepEqual(readCheckout('rehearsal','0xabc'),draft);
    assert.equal(readCheckout('pilot','0xabc'),null);assert.equal(readCheckout('rehearsal','0xdef'),null);
    const combined={...draft,legs:[0,1],rule:'OR' as const};
    saveCheckout('rehearsal','0xabc',combined);assert.deepEqual(readCheckout('rehearsal','0xabc'),combined);
    assert.throws(()=>saveCheckout('rehearsal','0xabc',{...combined,rule:'XOR' as any}));
    assert.throws(()=>saveCheckout('rehearsal','0xabc',{...draft,rule:'AT_LEAST_TWO'}));
    assert.throws(()=>saveCheckout('rehearsal','0xabc',{...draft,legs:[0,1,2,3]}));
    clearCheckout('rehearsal','0xabc');assert.equal(readCheckout('rehearsal','0xabc'),null);
    db.set('flurbo.checkout.v1:rehearsal:0xabc',JSON.stringify({...draft,event:99}));assert.throws(()=>readCheckout('rehearsal','0xabc'));
  }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete (globalThis as any).localStorage;}
});
