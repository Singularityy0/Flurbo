import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {appFetch} from '../platform-fetch';
export default function VisitorStatus(){
  const [ready,setReady]=useState<boolean|null>(null);
  useEffect(()=>{const c=new AbortController();void appFetch('/api/preview',{cache:'no-store',signal:AbortSignal.any([c.signal,AbortSignal.timeout(10000)])}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(v=>{if(!c.signal.aborted)setReady(!!v.applicationUrl);}).catch(()=>{});return()=>c.abort();},[]);
  return <section className="home-visitor-status" aria-label="Preview access"><span className="eyebrow">An invitation to explore</span><p><strong>Invite-based testnet preview</strong></p><p>{ready===true?'Create a passkey account, then request access from your account page. Approved testers can explore markets, trade with test assets and follow their shares.':ready===false?'Applications are not open yet. You can create your passkey account now and return when invitations become available.':'Create a passkey account to check access. Markets and portfolios are available to approved testers.'}</p><div className="home-status-actions"><Link href="/access" className="text-link">Check your access</Link><Link href="/docs#getting-started" className="text-link">How to join</Link></div></section>;
}
