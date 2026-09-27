import {useEffect,useRef,useState} from 'react';
import {linkTradingWallet} from '../wallet-links';
import {portfolioSources,type PortfolioSources} from '../portfolio-sources';
import {discoverWallets,type BrowserWallet} from '../auth/wallet-choice';
import AccountHoldings from './AccountHoldings';
import PortfolioDashboard from './PortfolioDashboard';
import type {MarketGroup} from '../market-directory';

export default function AccountPortfolio({account,namespace,groups}:{account:string;namespace:string;groups?:MarketGroup[]}) {
  const [wallets,setWallets]=useState<string[]|null>(null),[error,setError]=useState(''),[tick,setTick]=useState(0),[busy,setBusy]=useState(false);
  const [sources,setSources]=useState<PortfolioSources|null>(null);
  const currentAccount=useRef(account);currentAccount.current=account;
  async function refreshSources(){
    try{const data=await portfolioSources();if(currentAccount.current!==account)return;
      if(data.account.toLowerCase()!==account.toLowerCase())throw Error('Account changed. Sign in again.');
      setError('');setSources(data);setWallets([...new Set([...data.wallets,...(data.agentWallets||[])])]);
    }catch(e){if(currentAccount.current===account)setError(e instanceof Error?e.message:'Portfolio sources could not be refreshed.');}
  }
  const [providers,setProviders]=useState<BrowserWallet[]>([]);
  const [legacy,setLegacy]=useState(false);
  useEffect(()=>discoverWallets(w=>setProviders(old=>old.some(x=>x.provider===w.provider)?old:[...old,w])),[]);
  useEffect(()=>{const changed=()=>setTick(n=>n+1);window.addEventListener('flurbo:wallet-linked',changed);return()=>window.removeEventListener('flurbo:wallet-linked',changed);},[]);
  useEffect(()=>{const c=new AbortController();setError('');setWallets(null);
    void portfolioSources(c.signal).then(data=>{if(data.account.toLowerCase()!==account.toLowerCase())throw Error('Account changed. Sign in again.');if(!c.signal.aborted){setSources(data);setWallets([...new Set([...data.wallets,...(data.agentWallets||[])])]);}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();
  },[account,tick]);
  async function connect(){setBusy(true);setError('');try{
    const p=providers[0]?.provider;if(!p)throw Error('Open Flurbo in MetaMask or install its extension.');
    await p.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
    const addresses=await p.request({method:'eth_requestAccounts'});
    if(!Array.isArray(addresses)||!addresses[0])throw Error('Select your MetaMask wallet.');
    await linkTradingWallet(p,account,addresses[0]);setTick(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:'Wallet linking failed.');}finally{setBusy(false);}}
  return <section className="account-portfolio" aria-label="Account portfolio">
    <div className="portfolio-account-identity"><span className="eyebrow">Your Mera account</span><p>{account}</p></div>
    {error&&<p role="alert">{error} <button className="button button-outline" onClick={()=>setTick(n=>n+1)}>Retry</button></p>}
    {!wallets&&!error&&<p role="status">Loading your portfolio…</p>}
    {wallets?.length===0&&<p>Connect MetaMask to add your trading shares. <button className="button button-outline" disabled={busy} onClick={()=>void connect()}>{busy?'Check MetaMask…':'Connect MetaMask'}</button></p>}
    {wallets&&(groups?<><PortfolioDashboard key={account+wallets.join(',')} account={account} wallets={wallets} groups={groups} manualWallets={sources?.wallets||[]} agentExecutions={sources?.agentExecutions} onRefreshSources={refreshSources}/>{new URLSearchParams(window.location.search).get('legacy')==='1'?<details className="portfolio-legacy" onToggle={e=>setLegacy(e.currentTarget.open)}><summary>Earlier experimental holdings</summary>{legacy&&<><EarlierHoldings account={account} wallets={sources?.wallets||[]} namespace="original" label="Earlier demo holdings"/><EarlierHoldings account={account} wallets={sources?.wallets||[]} namespace="learning" label="Learning experiment holdings"/></>}</details>:<a className="portfolio-archive-link" href="/portfolio?legacy=1">Earlier experimental holdings</a>}</>:<AccountHoldings key={account+namespace} account={account} wallets={sources?.wallets||[]} namespace={namespace}/>)}
  </section>;
}

function EarlierHoldings({account,wallets,namespace,label}:{account:string;wallets:string[];namespace:string;label:string}){
  const [open,setOpen]=useState(false);
  return <details className={'legacy-'+namespace} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{label}</summary>{open&&<AccountHoldings account={account} wallets={wallets} namespace={namespace}/>}</details>;
}
