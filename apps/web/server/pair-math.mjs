// Independent outward-rounded enumeration for the 2..4-event pilot only.
// All liability arithmetic remains integer token atoms. See docs/PAIR_ANALYTICS.md.
const S=10n**48n, U128=(1n<<128n)-1n;
const ceil=(a,b)=>(a+b-1n)/b;
const atom=v=>{if(typeof v!=='string'||! /^(0|[1-9][0-9]{0,38})$/.test(v)||BigInt(v)>U128)throw new Error('Invalid snapshot atom');return BigInt(v);};
export function validatePairSnapshot(s) {
  if(!s||![2,3,4].includes(s.events)||!Number.isInteger(s.a)||!Number.isInteger(s.b)||s.a===s.b||Math.min(s.a,s.b)<0||Math.max(s.a,s.b)>=s.events)throw new Error('Invalid event pair');
  const liquidity=atom(s.liquidity);if(!liquidity)throw new Error('Invalid liquidity');
  if(!Array.isArray(s.order)||s.order.length!==s.events||[...s.order].sort().some((v,i)=>v!==i))throw new Error('Invalid elimination order');
  if(!Array.isArray(s.factors)||s.factors.length>64)throw new Error('Invalid factors');
  let maxima=0n;
  for(const f of s.factors){
    if(!Number.isInteger(f.scope)||f.scope<1||f.scope>=2**s.events)throw new Error('Invalid scope');
    const bits=f.scope.toString(2).replaceAll('0','').length;
    if(bits>3||!Array.isArray(f.values)||f.values.length!==2**bits)throw new Error('Invalid table');
    maxima+=f.values.map(atom).reduce((a,b)=>a>b?a:b,0n);
  }
  if(maxima>100n*liquidity)throw new Error('Snapshot exceeds numerical domain');
  // Same width limit as FactoredLmsr and PilotPool, checked without floats.
  let scopes=s.factors.map(f=>f.scope);
  for(const event of s.order){
    const matching=scopes.filter(scope=>scope&(1<<event)),joined=matching.reduce((a,b)=>a|b,1<<event);
    if(joined.toString(2).replaceAll('0','').length>3)throw new Error('Unsupported graph width');
    scopes=scopes.filter(scope=>!(scope&(1<<event)));scopes.push(joined&~(1<<event));
  }
  return s;
}

function weight(n,d) {
  // exp(-n/d), with 0 <= n/d <= 100. Reduce by 128 so Taylor argument < 1.
  let lo=S,hi=S,termLo=S,termHi=S;
  for(let k=1n;k<=64n;k++){
    termLo=termLo*n/(d*128n*k);termHi=ceil(termHi*n,d*128n*k);
    lo+=termLo;hi+=termHi;
  }
  // Remaining positive Taylor terms <= twice the next term (ratio < 1/2).
  hi+=2n*ceil(termHi*n,d*128n*65n);
  let lower=S*S/hi,upper=ceil(S*S,lo);
  for(let k=0;k<7;k++){lower=lower*lower/S;upper=ceil(upper*upper,S);}
  return [lower,upper];
}
const sum=xs=>xs.reduce(([a,b],[c,d])=>[a+c,b+d],[0n,0n]);
const ratio=([a,b],[c,d])=>{if(c<=0n)throw new Error('Unbounded probability');return [a*S/d,ceil(b*S,c)];};
const product=([a,b],[c,d])=>[a*c/S,ceil(b*d,S)];
const rounded=v=>v<0n?-((-v*1000n+S/2n)/S):(v*1000n+S/2n)/S;
export function certifiedPair(s) {
  validatePairSnapshot(s);
  const scores=Array.from({length:2**s.events},(_,state)=>s.factors.reduce((q,f)=>{
    let local=0,bit=0;for(let event=0;event<s.events;event++)if(f.scope&(1<<event)){if(state&(1<<event))local|=1<<bit;bit++;}
    return q+BigInt(f.values[local]);
  },0n));
  const max=scores.reduce((a,b)=>a>b?a:b,0n),weights=scores.map(q=>weight(max-q,BigInt(s.liquidity)));
  const select=fn=>sum(weights.filter((_,x)=>fn(x))),total=sum(weights);
  const wa=select(x=>x&(1<<s.a)),wb=select(x=>x&(1<<s.b)),wnb=select(x=>!(x&(1<<s.b)));
  const wab=select(x=>(x&(1<<s.a))&&(x&(1<<s.b))),wanb=select(x=>(x&(1<<s.a))&&!(x&(1<<s.b)));
  const a=ratio(wa,total),b=ratio(wb,total),nb=ratio(wnb,total),joint=ratio(wab,total),independent=product(a,b);
  // Cutoff is a display policy, not a statement that a rare event is impossible.
  const intervals={a,b,joint,givenYes:b[0]>=S/1_000_000_000n?ratio(wab,wb):null,givenNo:nb[0]>=S/1_000_000_000n?ratio(wanb,wnb):null,
    independent,difference:[joint[0]-independent[1],joint[1]-independent[0]]};
  const values={},reasons={};
  for(const [key,bounds] of Object.entries(intervals)){
    values[key]=bounds&&rounded(bounds[0])===rounded(bounds[1])?Number(rounded(bounds[0])):null;
    if(values[key]===null)reasons[key]=bounds?'rounding_uncertain':'rare_condition';
  }
  return {values,reasons};
}
export function pairInput(s){validatePairSnapshot(s);return [1,s.events,s.a,s.b,s.liquidity,...s.order,s.factors.length,...s.factors.flatMap(f=>[f.scope,...f.values])].join(' ');}
