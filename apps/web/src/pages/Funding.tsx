import {linkTradingWallet} from '../wallet-links';
import {useEffect, useRef, useState} from 'react';
import {formatUnits, toFunctionSelector} from 'viem';
import {Link} from 'wouter';
import {useAuth} from '../auth/context';
import {discoverWallets, type BrowserWallet} from '../auth/wallet-choice';
import {walletKey, tradingWalletKey} from '../portfolio';
import {TESTNET} from '../../server/network.mjs';
import './funding.css';

type Network = typeof TESTNET & {flurboFaucet?:boolean};
type Pending = {hash:string;owner:string;faucet:string};
const uint = (v:unknown) => { if (typeof v !== 'string' || !/^0x[0-9a-f]+$/i.test(v)) throw Error('Balance unavailable. Try refreshing.'); return BigInt(v); };
async function rpc(method:string, params:unknown[]) {
  const res = await fetch('/api/rpc', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({method,params}), signal:AbortSignal.timeout(15000)});
  const value = await res.json();
  if (!res.ok || value.error) throw Error('The network is unavailable. Try again shortly.');
  return value.result;
}
function fundingError(error:unknown, sending=false) {
  const e=error as {code?:number;message?:string;data?:unknown};
  if (e?.code===4001) return 'Request cancelled in MetaMask. No funding was confirmed.';
  const data=JSON.stringify(e?.data ?? '');
  if (data.includes('356680b7')) return 'The test AUSD dispenser is empty. Please try again after it is refilled.';
  if (data.includes(toFunctionSelector('TooSoon()').slice(2))) return 'You have already claimed today. Come back 24 hours after your last claim.';
  if (sending) return 'Submission status is uncertain. Check MetaMask activity before requesting again.';
  return e instanceof Error && /^(Install|Select|Wallet|Sign in|Get test MON|The |Balance|You |Faucet)/.test(e.message) ? e.message : 'The faucet could not complete this request. Refresh balances and try again.';
}

export default function Funding({expanded=false}:{expanded?:boolean}) {
  const {state}=useAuth();
  const [wallets,setWallets]=useState<BrowserWallet[]>([]),[owner,setOwner]=useState('');
  const [network,setNetwork]=useState<Network|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [balances,setBalances]=useState<{ausd:bigint;mon:bigint;stock:bigint;nextClaim:bigint}|null>(null);
  const [pending,setPending]=useState<Pending|null>(null),[checking,setChecking]=useState(false),[uncertain,setUncertain]=useState(false);
  const providerRef=useRef<BrowserWallet['provider']|null>(null), generation=useRef(0), checkingRef=useRef(false), busyRef=useRef(false);
  const key='flurbo.faucet.pending.v1:'+state.address;
  useEffect(()=>discoverWallets(w=>setWallets(old=>old.some(v=>v.provider===w.provider)?old:[...old,w])),[]);
  useEffect(()=>{
    const c=new AbortController();
    void fetch('/api/network',{credentials:'same-origin',signal:AbortSignal.any([c.signal,AbortSignal.timeout(10000)])}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(n=>{
      if(n.chain_id!==10143||n.environment!=='public_testnet'||n.cash!==TESTNET.cash||!/^0x[0-9a-f]{40}$/i.test(n.faucet))throw Error();
      if(!c.signal.aborted)setNetwork(n);
    }).catch(()=>{if(!c.signal.aborted)setMessage('Funding settings are unavailable. Reload to try again.');});
    try {const p=JSON.parse(localStorage.getItem(key)||'null');if(p&&/^0x[0-9a-f]{64}$/i.test(p.hash)&&[p.owner,p.faucet].every(a=>/^0x[0-9a-f]{40}$/i.test(a)))setPending(p);}catch{}
    return()=>c.abort();
  },[key]);
  useEffect(()=>{
    const p=wallets[0]?.provider as any;
    const changed=()=>{generation.current++;providerRef.current=null;setOwner('');setBalances(null);};
    for(const event of ['accountsChanged','chainChanged','disconnect'])p?.on?.(event,changed);
    return()=>{changed();for(const event of ['accountsChanged','chainChanged','disconnect'])p?.removeListener?.(event,changed);};
  },[wallets[0]?.provider]);
  async function readBalances(address=owner, version=generation.current) {
    if(!address||!network)return;
    const balanceOf=(account:string)=>rpc('eth_call',[{to:TESTNET.cash,data:'0x70a08231'+account.slice(2).padStart(64,'0')},'latest']);
    const values=await Promise.all([balanceOf(address),rpc('eth_getBalance',[address,'latest']),balanceOf(network.faucet),network.flurboFaucet?rpc('eth_call',[{to:network.faucet,data:toFunctionSelector('nextClaimAt(address)')+address.slice(2).padStart(64,'0')},'latest']):'0x0']);
    if(version===generation.current)setBalances({ausd:uint(values[0]),mon:uint(values[1]),stock:uint(values[2]),nextClaim:uint(values[3])});
  }
  async function connect() {
    if(busyRef.current||!network)return;busyRef.current=true;setBusy(true);setMessage('');
    try {
      const p=wallets[0]?.provider;if(!p)throw Error('Install MetaMask or open Flurbo in the MetaMask browser.');
      await p.request({method:'eth_requestAccounts'});
      if(await p.request({method:'eth_chainId'})!=='0x279f'){
        try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x279f'}]});}
        catch(e){if((e as any)?.code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:'0x279f',chainName:'Monad Testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:[TESTNET.rpc],blockExplorerUrls:[TESTNET.explorer]}]});}
      }
      const version=generation.current,accounts=await p.request({method:'eth_accounts'});
      if(!Array.isArray(accounts)||!/^0x[0-9a-f]{40}$/i.test(accounts[0]||''))throw Error('Select a MetaMask account.');
      if(await p.request({method:'eth_chainId'})!=='0x279f')throw Error('Select Monad testnet in MetaMask and reconnect.');
      const address=accounts[0].toLowerCase();if(!state.address)throw Error('Sign in first.');
      await linkTradingWallet(p,state.address,address,()=>version===generation.current);
      if(version!==generation.current)throw Error('Wallet changed. Reconnect MetaMask.');
      providerRef.current=p;setOwner(address);
      try{sessionStorage.setItem(walletKey(state.address),address);sessionStorage.setItem(tradingWalletKey(state.address),address);}catch{}
      await readBalances(address,version);
    }catch(e){setMessage(fundingError(e));}finally{busyRef.current=false;setBusy(false);}
  }
  async function requestFunds() {
    if(busyRef.current||!owner||!network||pending||uncertain)return;busyRef.current=true;setBusy(true);
    const version=generation.current,p=providerRef.current;let sending=false;
    setMessage('Confirm the test AUSD request in MetaMask.');
    try{
      if(!p)throw Error('Select MetaMask first.');
      const block=await rpc('eth_getBlockByNumber',['latest',false]);
      const walletBlock=await p.request({method:'eth_getBlockByNumber',params:[block.number,false]}) as {hash?:string};
      if(!block.hash||walletBlock?.hash?.toLowerCase()!==block.hash.toLowerCase())throw Error('Wallet network does not match Monad testnet. Reconnect.');
      const tx={from:owner,to:network.faucet,data:TESTNET.faucetSelector+owner.slice(2).padStart(64,'0'),value:'0x0',chainId:'0x279f'};
      await p.request({method:'eth_call',params:[tx,'latest']});
      const gas=uint(await p.request({method:'eth_estimateGas',params:[tx]}))*120n/100n;
      const gasPrice=uint(await p.request({method:'eth_gasPrice'}))*2n;
      if(gas<=0n||gas>1000000n||gasPrice<=0n)throw Error('Faucet gas estimate unavailable.');
      if(uint(await rpc('eth_getBalance',[owner,'latest']))<gas*gasPrice)throw Error('Get test MON for network fees first, then refresh your balance.');
      const accounts=await p.request({method:'eth_accounts'});
      if(version!==generation.current||!Array.isArray(accounts)||accounts[0]?.toLowerCase()!==owner||await p.request({method:'eth_chainId'})!=='0x279f')throw Error('Wallet changed. Reconnect MetaMask.');
      sending=true;
      const hash=await p.request({method:'eth_sendTransaction',params:[{...tx,gas:'0x'+gas.toString(16),gasPrice:'0x'+gasPrice.toString(16)}]});
      if(typeof hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(hash))throw Error();
      const saved={hash,owner,faucet:network.faucet};
      try{localStorage.setItem(key,JSON.stringify(saved));}catch{}
      setPending(saved);setMessage('Request sent. Waiting for confirmation…');
    }catch(e){if(sending&&(e as any)?.code!==4001)setUncertain(true);setMessage(fundingError(e,sending));}
    finally{busyRef.current=false;setBusy(false);}
  }
  async function checkStatus() {
    if(!pending||checkingRef.current)return;checkingRef.current=true;setChecking(true);
    try{
      const receipt=await rpc('eth_getTransactionReceipt',[pending.hash]);
      if(!receipt){setMessage('Still waiting for confirmation. Your request is saved if you leave this page.');return;}
      if(receipt.transactionHash?.toLowerCase()!==pending.hash.toLowerCase()||receipt.to?.toLowerCase()!==pending.faucet.toLowerCase()||receipt.from?.toLowerCase()!==pending.owner.toLowerCase()||!['0x0','0x1'].includes(receipt.status))throw Error();
      try{localStorage.removeItem(key);}catch{}
      setPending(null);
      setMessage(receipt.status==='0x1'?'Test AUSD request confirmed. You can return to the markets.':'The request reverted. Refresh balances before trying again.');
      await readBalances();
    }catch{setMessage('Confirmation is unavailable. Check the transaction below before retrying.');}
    finally{checkingRef.current=false;setChecking(false);}
  }
  useEffect(()=>{if(!pending)return;let tries=0;void checkStatus();const timer=setInterval(()=>{if(++tries>=15){clearInterval(timer);return;}if(!document.hidden)void checkStatus();},8000);return()=>clearInterval(timer);},[pending?.hash,owner]);
  const empty=balances && balances.stock<(network?.flurboFaucet?50000000n:10000000000n);
  const cooldown=balances&&balances.nextClaim>BigInt(Math.floor(Date.now()/1000));
  const content=<div className="funding-card">
    <div><h2>Your trading wallet</h2><p>Test funds go to MetaMask. Your Mera account keeps you signed in.</p></div>
    <div className="funding-actions"><button className="button button-dark" disabled={busy||!network} onClick={()=>void connect()}>{busy?'Check MetaMask…':owner?'Reconnect MetaMask':'Connect MetaMask'}</button>{owner&&<button className="button button-outline" disabled={busy} onClick={()=>void readBalances().catch(e=>setMessage(fundingError(e)))}>Refresh balances</button>}</div>
    {owner&&<p className="funding-address">{owner}</p>}
    {balances&&<div className="funding-balances"><div><span>Trading balance</span><strong>{formatUnits(balances.ausd,6)} AUSD</strong></div><div><span>Network fees</span><strong>{Number(formatUnits(balances.mon,18)).toFixed(4)} MON</strong></div></div>}
    <section><h2>1. Get test MON</h2><p>MON pays the small network fee. Use the MetaMask address shown above.</p><div className="funding-actions"><a className="button button-outline" href={TESTNET.monFaucet} target="_blank" rel="noreferrer">Open MON faucet ↗</a>{owner&&<button className="button button-outline" onClick={()=>void navigator.clipboard.writeText(owner).then(()=>setMessage('MetaMask address copied.')).catch(()=>setMessage('Copy the MetaMask address shown above.'))}>Copy wallet address</button>}</div></section>
    <section><h2>2. Get test AUSD</h2><p>{network?.flurboFaucet?'Request 50 AUSD, once every 24 hours per wallet.':'Request test tokens from the AUSD faucet.'}</p>
      {empty&&<p role="status">The test AUSD dispenser needs a refill. Please try again later.</p>}
      {cooldown&&<p>Next request: {new Date(Number(balances!.nextClaim)*1000).toLocaleString()}.</p>}
      <button className="button button-dark" disabled={busy||!!pending||uncertain||!owner||!balances||balances.mon===0n||!!empty||!!cooldown} onClick={()=>void requestFunds()}>Request test AUSD</button>
      {owner&&balances?.mon===0n&&<p>Get test MON first, then refresh balances.</p>}
    </section>
    {pending&&<div className="funding-actions"><a href={`${TESTNET.explorer}/tx/${pending.hash}`} target="_blank" rel="noreferrer">View faucet transaction ↗</a><button className="button button-outline" disabled={checking} onClick={()=>void checkStatus()}>Check status</button></div>}
    {message&&<p role="status">{message}</p>}
    {uncertain&&<button className="button button-outline" onClick={()=>{setUncertain(false);setMessage('Refresh balances before requesting again.');}}>I checked MetaMask activity</button>}
    <Link href="/markets" className="button button-outline">Back to markets →</Link>
  </div>;
  return expanded?content:<details className="workspace-funding"><summary>Get test funds</summary>{content}</details>;
}
