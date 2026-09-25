import {useEffect,useState} from 'react';
import {linkedWallets,linkTradingWallet} from '../wallet-links';
import {discoverWallets,type BrowserWallet} from '../auth/wallet-choice';
import {isPracticeNamespace,type PilotNamespace} from '../pilot';
import PilotLedger from './PilotLedger';
import Portfolio from './Portfolio';

export default function AccountPortfolio({account,namespace,history}:{account:string;namespace:string;history:boolean}) {
  const [wallets,setWallets]=useState<string[]|null>(null),[error,setError]=useState(''),[tick,setTick]=useState(0),[busy,setBusy]=useState(false);
  const [providers,setProviders]=useState<BrowserWallet[]>([]),[filter,setFilter]=useState('all');
  const [lookup,setLookup]=useState(''),[view,setView]=useState('');
  useEffect(()=>discoverWallets(w=>setProviders(old=>old.some(x=>x.provider===w.provider)?old:[...old,w])),[]);
  useEffect(()=>{const changed=()=>setTick(n=>n+1);window.addEventListener('flurbo:wallet-linked',changed);return()=>window.removeEventListener('flurbo:wallet-linked',changed);},[]);
  useEffect(()=>{const c=new AbortController();setError('');setWallets(null);
    void linkedWallets(c.signal).then(data=>{if(data.account.toLowerCase()!==account.toLowerCase())throw Error('Account changed. Sign in again.');if(!c.signal.aborted)setWallets(data.wallets);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();
  },[account,tick]);
  async function connect(){setBusy(true);setError('');try{
    const p=providers[0]?.provider;if(!p)throw Error('Open Flurbo in MetaMask or install its extension.');
    await p.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
    const addresses=await p.request({method:'eth_requestAccounts'});
    if(!Array.isArray(addresses)||!addresses[0])throw Error('Select your MetaMask wallet.');
    await linkTradingWallet(p,account,addresses[0]);setTick(n=>n+1);
  }catch(e){setError(e instanceof Error?e.message:'Wallet linking failed.');}finally{setBusy(false);}}
  const ledger=(wallet:string)=>(isPracticeNamespace(namespace)||namespace==='pilot')?<PilotLedger key={account+namespace+wallet+history} namespace={namespace as PilotNamespace} account={account} history={history} initialWallet={wallet} linked/>:<Portfolio key={account+namespace+wallet+history} account={account} market={namespace==='learning'?'learning':'original'} history={history} initialWallet={wallet} linked/>;
  return <section className="account-portfolio" aria-label="Account portfolio">
    <div className="portfolio-toolbar"><p>{wallets?.length?`All your linked wallets. ${wallets.length} connected to this account.`:'Your predictions follow your Flurbo account.'}</p><button className="button button-outline" disabled={busy} onClick={()=>void connect()}>{busy?'Check MetaMask…':'Link a wallet'}</button></div>
    {error&&<p role="alert">{error} <button className="button button-outline" onClick={()=>setTick(n=>n+1)}>Retry</button></p>}
    {!wallets&&!error&&<p role="status">Loading your wallets…</p>}
    {wallets?.length===0&&<p>Connect the MetaMask wallet you use for predictions once. Its existing holdings and future trades will appear here automatically.</p>}
    {wallets&&wallets.length>1&&<label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All wallets</option>{wallets.map(w=><option key={w} value={w}>{w.slice(0,8)}…{w.slice(-6)}</option>)}</select></label>}
    <details className="portfolio-legacy"><summary>Look up another address</summary><form onSubmit={e=>{e.preventDefault();if(/^0x[0-9a-f]{40}$/i.test(lookup.trim()))setView(lookup.trim().toLowerCase());else setError('Enter a valid public address.');}}><label>Wallet to view<input value={lookup} onChange={e=>setLookup(e.target.value)}/></label><button className="button button-outline">View wallet</button></form><p>Read-only lookup. This does not link a wallet to your account.</p></details>
    {view&&<><button className="button button-outline" onClick={()=>setView('')}>Back to my wallets</button>{ledger(view)}</>}
    {!view&&wallets?.filter(w=>filter==='all'||filter===w).map(w=><section className="linked-wallet-ledger" key={w}><details><summary>Wallet {w.slice(0,8)}…{w.slice(-6)}</summary><p>{w}</p><p>Use this MetaMask wallet to sell its shares or collect payouts.</p></details>{ledger(w)}</section>)}
    <details className="portfolio-legacy"><summary>Earlier Mera holdings</summary><p>For positions bought before the MetaMask-only flow.</p>{/* Lazy rendering avoids scanning an unused legacy address. */}<LegacyHoldings render={()=>ledger(account)}/></details>
  </section>;
}
function LegacyHoldings({render}:{render:()=>React.ReactNode}) { const [show,setShow]=useState(false);return show?render():<button className="button button-outline" onClick={()=>setShow(true)}>Load earlier holdings</button>; }
