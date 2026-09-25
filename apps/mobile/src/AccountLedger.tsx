import {useEffect,useState} from 'react';
import {linkedWallets} from '../../web/src/wallet-links';
import type {PilotNamespace} from '../../web/src/pilot';
import {Ledger} from './Ledger';
import {externalWallet} from './wallet';
import {Button,Copy,Notice,Title,Card} from './ui';
export function AccountLedger({account,namespace,history}:{account:string;namespace:PilotNamespace;history:boolean}) {
  const [wallets,setWallets]=useState<string[]|null>(null),[error,setError]=useState(''),[tick,setTick]=useState(0),[busy,setBusy]=useState(false);
  useEffect(()=>{const c=new AbortController();setWallets(null);setError('');
    void linkedWallets(c.signal).then(result=>{if(result.account!==account.toLowerCase())throw Error('Account changed. Sign in again.');if(!c.signal.aborted)setWallets(result.wallets);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();
  },[account,tick]);
  return <><Title>Your {history?'history':'portfolio'}.</Title><Copy>All your linked wallets, under one Flurbo account.</Copy><Notice>{error}</Notice>
    <Button title={busy?'Check MetaMask…':'Link a wallet'} disabled={busy} onPress={()=>{setBusy(true);void externalWallet.connect().finally(()=>{setBusy(false);setTick(n=>n+1);});}}/>
    <Button secondary title="Refresh wallets" onPress={()=>setTick(n=>n+1)}/>
    {!wallets&&!error&&<Copy>Loading your wallets…</Copy>}
    {wallets?.length===0&&<Copy>Link your MetaMask wallet once. Existing holdings and future trades will appear automatically.</Copy>}
    {wallets?.map(wallet=><Card key={wallet}><Copy small>MetaMask {wallet.slice(0,8)}…{wallet.slice(-6)}</Copy><Ledger namespace={namespace} address={wallet} history={history} linked/></Card>)}
  </>;
}
