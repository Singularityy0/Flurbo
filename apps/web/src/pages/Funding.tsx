import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/context';
import { discoverWallets, type BrowserWallet } from '../auth/wallet-choice';
import { walletKey, tradingWalletKey } from '../portfolio';
import { TESTNET } from '../../server/network.mjs';

export default function Funding() {
  const { state } = useAuth();
  const [wallets, setWallets] = useState<BrowserWallet[]>([]), [owner, setOwner] = useState('');
  const providerRef = useRef<BrowserWallet['provider'] | null>(null);
  const generation = useRef(0);
  useEffect(() => discoverWallets(w => setWallets(old => old.some(v => v.provider === w.provider) ? old : [...old, w])), []);
  useEffect(() => {
    const p = wallets[0]?.provider as any;
    const changed = () => { generation.current++; providerRef.current = null; setOwner(''); };
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) p?.on?.(event, changed);
    return () => { changed(); for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) p?.removeListener?.(event, changed); };
  }, [wallets[0]?.provider]);
  async function connect() {
    if (busy) return;
    setBusy(true);
    const version = generation.current;
    try {
      const p = wallets[0]?.provider;
      if (!p) throw new Error('Install MetaMask or open this site in the MetaMask browser.');
      const accounts = await p.request({method:'eth_requestAccounts'});
      if (!Array.isArray(accounts) || !/^0x[0-9a-f]{40}$/i.test(accounts[0] || '')) throw new Error('Select a MetaMask account.');
      if (await p.request({method:'eth_chainId'}) !== '0x279f') throw new Error('Select Monad testnet in MetaMask, then reconnect.');
      if (version !== generation.current) throw new Error('Wallet changed. Reconnect MetaMask.');
      const address = accounts[0].toLowerCase();
      providerRef.current = p; setOwner(address);
      if (state.address) try { sessionStorage.setItem(walletKey(state.address), address); sessionStorage.setItem(tradingWalletKey(state.address), address); } catch {}
      setMessage('MetaMask connected. Fund this address with test MON, then request test AUSD.');
    } catch(e) { setMessage(e instanceof Error ? e.message : 'MetaMask connection failed.'); }
    finally { setBusy(false); }
  }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('AUSD is your trading balance. MON pays network fees. These are test assets.');
  const [hash, setHash] = useState('');
  const [checking, setChecking] = useState(false);

  async function requestFunds() {
    if (busy || !state.address || !owner || hash) return;
    setBusy(true); setMessage('Review the AUSD faucet request. It uses MON for gas and grants no token allowance.');
    const provider = providerRef.current, version = generation.current;
    try {
      if (!provider) throw new Error('Choose your wallet');
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== owner.toLowerCase()) throw new Error('Reconnect the MetaMask account shown here');
      if (await provider.request({method: 'eth_chainId'}) !== '0x279f') throw new Error('Choose Monad testnet');
      const reference = await fetch('/api/rpc', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({method:'eth_getBlockByNumber',params:['latest',false]}) });
      const referenceBlock = (await reference.json()).result;
      if (!reference.ok || !referenceBlock?.hash || !referenceBlock?.number) throw new Error('Public chain unavailable');
      const walletBlock = await provider.request({method:'eth_getBlockByNumber',params:[referenceBlock.number,false]}) as {hash?: string} | null;
      if (walletBlock?.hash?.toLowerCase() !== referenceBlock.hash.toLowerCase()) throw new Error('Wallet is connected to another fork');
      const tx = { from: owner, to: TESTNET.faucet, data: TESTNET.faucetSelector + owner.slice(2).toLowerCase().padStart(64, '0'), value: '0x0', chainId: '0x279f' };
      await provider.request({ method: 'eth_call', params: [tx, 'latest'] });
      const gas = BigInt(await provider.request({ method: 'eth_estimateGas', params: [tx] }) as string) * 120n / 100n;
      const gasPrice = BigInt(await provider.request({ method: 'eth_gasPrice' }) as string) * 2n;
      if (gas <= 0n || gas > 1_000_000n || gasPrice <= 0n) throw new Error('Faucet gas estimate unavailable');
      const current = await provider.request({method:'eth_accounts'});
      if (version !== generation.current || !Array.isArray(current) || current[0]?.toLowerCase() !== owner || await provider.request({method:'eth_chainId'}) !== '0x279f') throw new Error('MetaMask changed before submission.');
      const result = await provider.request({ method: 'eth_sendTransaction', params: [{ ...tx, gas: '0x' + gas.toString(16), gasPrice: '0x' + gasPrice.toString(16) }] });
      if (typeof result !== 'string' || !/^0x[0-9a-f]{64}$/i.test(result)) throw new Error('Check your wallet for submission status');
      setHash(result); setMessage('Faucet transaction submitted. Check its status before requesting again.');
    } catch { setMessage('The faucet request did not complete here. Check your wallet for a pending transaction before retrying. Confirm the selected address, public testnet RPC, MON balance and faucet availability.'); }
    finally { setBusy(false); }
  }

  async function checkStatus() {
    if (!hash || checking) return;
    setChecking(true);
    try {
      const response = await fetch('/api/rpc', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({method:'eth_getTransactionReceipt',params:[hash]}) });
      const payload = await response.json();
      if (!response.ok) throw new Error('Receipt unavailable');
      setMessage(!payload.result ? 'Still pending or not found. Check the explorer before retrying.' : payload.result.status === '0x1' ? 'Faucet transaction succeeded. Refresh your positions to read your AUSD balance.' : 'Faucet transaction reverted. No successful funding is confirmed.');
    } catch { setMessage('Status unavailable. Check the explorer; do not assume the request failed.'); }
    finally { setChecking(false); }
  }
  return <details className="workspace-funding"><summary>Fund MetaMask on Monad testnet</summary>
    <p>Mera is for sign-in only. Your MetaMask wallet holds the test funds you trade with.</p>
    <button className="button button-outline" disabled={busy} onClick={() => void connect()}>{owner ? 'Reconnect MetaMask' : 'Connect MetaMask'}</button>
    {owner && <p>Send test AUSD and MON to your MetaMask address: <code>{owner}</code>.</p>}
    <p><a href={TESTNET.monFaucet} target="_blank" rel="noreferrer">Get test MON from the Monad faucet</a>. Once MON arrives, request test AUSD below.</p>
    <button className="button button-dark" disabled={busy || !!hash || !owner} onClick={() => void requestFunds()}>{busy ? 'Confirm in your wallet...' : 'Request test AUSD'}</button>
    {hash && <p><a href={`${TESTNET.explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View faucet transaction</a> <button className="text-link" disabled={checking} onClick={() => void checkStatus()}>Check status</button></p>}
    <p role="status">{message}</p>
    <p className="auth-help">AUSD contract: <code>{TESTNET.cash}</code>. Faucet limits may apply. Confirm the faucet request in MetaMask. Never send mainnet assets to testnet.</p>
  </details>;
}
