import {useState} from 'react';
import {Link} from 'wouter';
import {useAuth} from '../auth/context';
import type {Access} from '../auth/preview-access';
import TradingWallets from './TradingWallets';
import {AccessApplication,ApplicationReview} from './AccessApplication';
import './access.css';

export default function AccessPage({access,error,refresh}:{access:Access|null;error:string;refresh():void}){
  const {state,controller}=useAuth();
  const [copied,setCopied]=useState('');
  async function copy(){try{await navigator.clipboard.writeText(state.address!);setCopied('Address copied');}catch{setCopied('Select the address to copy it.');}}
  return <main id="main" tabIndex={-1} className="access-page">
    <header><span className="eyebrow">Flurbo / Your account</span><h1>{access?.approved?<>Your <em>account.</em></>:<>Your place in the <em>preview.</em></>}</h1><p>A Monad testnet experience for individual and combined predictions. Test assets only.</p></header>
    <section className="access-card" aria-label="Your access status">
      <span className="market-badge">{access?.approved?'Access approved':'Invite-based testnet'}</span>
      {(!access?.nativeApplications||access.approved)&&<><h2>{error?'Let’s check again':!access?'Checking your access':access.approved?'You’re ready to explore':'Your account is ready'}</h2>
      <p>{!access&&!error?'Verifying access for your Mera account.':access?.approved?'Browse questions, explore connections and follow your predictions in Portfolio.':access?.applicationUrl?'Request access using the account address below. Creating an account does not submit an application or approve access.':'Applications are not open yet. Keep this passkey to return to the same account when access becomes available.'}</p></>}
      {access?.nativeApplications&&!access.approved&&<AccessApplication key={state.address} refresh={refresh}/>}
      {access?.nativeApplications&&!access.approved?<p className="access-note">Account captured automatically · <span title={state.address||''}>{state.address?.slice(0,8)}…{state.address?.slice(-6)}</span></p>:<div className="access-identity"><span className="eyebrow">Your Mera account</span><code>{state.address}</code><button className="text-link" onClick={()=>void copy()}>Copy address</button><span role="status">{copied}</span></div>}
      {(!access?.nativeApplications||access.approved)&&<div className="access-actions">{access?.approved?<Link href="/markets" className="button button-dark">Explore markets</Link>:access?.applicationUrl?<a href={access.applicationUrl} target="_blank" rel="noreferrer" className="button button-dark">Request access</a>:null}<button className="button button-outline" onClick={refresh}>{access?.approved?'Refresh access':'Check access'}</button></div>}
      {error&&<p role="alert">{error}</p>}
      {!access?.approved&&!access?.applicationUrl&&!access?.nativeApplications&&<div className="access-placeholder"><strong>Request access · Coming soon</strong><p>The application method is being prepared. Your account is saved; no application has been submitted.</p></div>}
      {access?.approved?<p className="access-note">Your passkey signs you in. Your linked MetaMask wallets hold your trading funds. <Link href="/fund">Get test funds</Link> · <Link href="/portfolio">View portfolio</Link></p>:!access?.nativeApplications?<p className="access-note">Approval is for this Mera account. Once approved, link MetaMask to trade. Never include a seed phrase, private key or passkey recovery details in an application.</p>:null}
    </section>
    {access?.approved&&state.address&&<TradingWallets key={state.address} account={state.address}/>}
    {access?.nativeApplications&&access.testingTools&&<ApplicationReview key={'review-'+state.address}/>}
    <footer><Link href="/docs">Read the guide</Link><button className="text-link" onClick={()=>void controller.signOut()}>Sign out</button></footer>
  </main>;
}
