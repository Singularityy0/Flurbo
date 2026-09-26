import {useEffect,useRef,useState} from 'react';
import {discoverWallets,type BrowserWallet} from '../auth/wallet-choice';
import {watchTradingWallet} from '../auth/trading-session';
import {linkedWallets,linkTradingWallet} from '../wallet-links';

export default function TradingWallets({account}:{account:string}){
  const [provider,setProvider]=useState<BrowserWallet['provider']|null>(null),[wallets,setWallets]=useState<string[]>([]),[owner,setOwner]=useState(''),[status,setStatus]=useState('checking'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const live=useRef(true),working=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>discoverWallets(w=>setProvider(old=>old||w.provider)),[]);
  useEffect(()=>{
    let cancelled=false;
    const load=()=>void linkedWallets().then(value=>{if(!cancelled&&value.account.toLowerCase()===account.toLowerCase())setWallets(value.wallets);}).catch(()=>{if(!cancelled)setError('Linked wallets could not be loaded. Refresh to retry.');});
    load();window.addEventListener('flurbo:wallet-linked',load);
    return()=>{cancelled=true;window.removeEventListener('flurbo:wallet-linked',load);};
  },[account]);
  useEffect(()=>{if(!provider){setStatus('disconnected');return;}return watchTradingWallet({provider,account,links:linkedWallets,publish:value=>{setOwner(value.owner);setStatus(value.status);}});},[provider,account]);
  async function connect(switchAccount=false){
    if(working.current)return;working.current=true;setBusy(true);setError('');
    try{
      if(!provider)throw Error('Open Flurbo in MetaMask or install its extension.');
      if(switchAccount)await provider.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
      const addresses=await provider.request({method:'eth_requestAccounts'});
      if(!Array.isArray(addresses)||!addresses[0])throw Error('Select a MetaMask wallet.');
      await linkTradingWallet(provider,account,addresses[0],()=>live.current);
      // An existing link does not emit a linking event. Refresh the read-only
      // connection after the user unlocks or explicitly selects that wallet.
      window.dispatchEvent(new Event('flurbo:wallet-linked'));
    }catch(e){if(live.current)setError(e instanceof Error?e.message:'Wallet connection failed.');}
    finally{working.current=false;if(live.current)setBusy(false);}
  }
  return <section className="access-card" aria-label="Trading wallets">
    <h2>Trading wallets</h2><p>Your linked wallets stay with this Mera account. Portfolio combines their shares, trades and collected payouts, even when MetaMask is disconnected.</p>
    <p>{owner?`Active for trading: ${owner.slice(0,8)}...${owner.slice(-6)}`:status==='checking'?'Checking MetaMask...':status==='unlinked'?'Link your selected wallet once to use it with this account.':'Connect MetaMask when you want to trade.'}</p>
    <div className="access-actions"><button className="button button-dark" disabled={busy} onClick={()=>void connect(!!owner)}>{busy?'Check MetaMask...':owner?'Switch wallet':status==='unlinked'?'Link selected wallet':'Connect MetaMask'}</button>{!owner&&wallets.length>0&&<button className="button button-outline" disabled={busy} onClick={()=>void connect(true)}>Choose another wallet</button>}</div>
    <details><summary>{wallets.length} linked {wallets.length===1?'wallet':'wallets'}</summary>{wallets.map(wallet=><p key={wallet}><code style={{overflowWrap:'anywhere'}}>{wallet}</code></p>)}<p>Adding a new wallet requires a signature proving you own it. This does not move funds.</p></details>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
