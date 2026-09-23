import { useState } from 'react';
import { useAuth } from '../auth/context';
import { meraProvider } from '../auth/mera-provider';
import { TESTNET } from '../../server/network.mjs';

export default function Funding() {
  const { controller, state } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('AUSD is your trading balance. MON pays network fees. These are test assets.');
  const [hash, setHash] = useState('');
  const [checking, setChecking] = useState(false);

  async function requestFunds() {
    if (busy || !state.address) return;
    setBusy(true); setMessage('Review the AUSD faucet request. It uses MON for gas and grants no token allowance.');
    const mera = meraProvider(controller);
    const provider = mera;
    try {
      if (!provider) throw new Error('Choose your wallet');
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!Array.isArray(accounts) || accounts[0]?.toLowerCase() !== state.address.toLowerCase()) throw new Error('Select the signed-in address in your wallet');
      if (await provider.request({method: 'eth_chainId'}) !== '0x279f') throw new Error('Choose Monad testnet');
      const reference = await fetch('/api/rpc', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({method:'eth_getBlockByNumber',params:['latest',false]}) });
      const referenceBlock = (await reference.json()).result;
      if (!reference.ok || !referenceBlock?.hash || !referenceBlock?.number) throw new Error('Public chain unavailable');
      const walletBlock = await provider.request({method:'eth_getBlockByNumber',params:[referenceBlock.number,false]}) as {hash?: string} | null;
      if (walletBlock?.hash?.toLowerCase() !== referenceBlock.hash.toLowerCase()) throw new Error('Wallet is connected to another fork');
      const tx = { from: state.address, to: TESTNET.faucet, data: TESTNET.faucetSelector + state.address.slice(2).toLowerCase().padStart(64, '0'), value: '0x0', chainId: '0x279f' };
      await provider.request({ method: 'eth_call', params: [tx, 'latest'] });
      const gas = BigInt(await provider.request({ method: 'eth_estimateGas', params: [tx] }) as string) * 120n / 100n;
      const gasPrice = BigInt(await provider.request({ method: 'eth_gasPrice' }) as string) * 2n;
      if (gas <= 0n || gas > 1_000_000n || gasPrice <= 0n) throw new Error('Faucet gas estimate unavailable');
      const result = await provider.request({ method: 'eth_sendTransaction', params: [{ ...tx, gas: '0x' + gas.toString(16), gasPrice: '0x' + gasPrice.toString(16) }] });
      if (typeof result !== 'string' || !/^0x[0-9a-f]{64}$/i.test(result)) throw new Error('Check your wallet for submission status');
      setHash(result); setMessage('Faucet transaction submitted. Check its status before requesting again.');
    } catch { setMessage('The faucet request did not complete here. Check your wallet for a pending transaction before retrying. Confirm the selected address, public testnet RPC, MON balance and faucet availability.'); }
    finally { mera?.destroy(); setBusy(false); }
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
  return <details className="workspace-funding"><summary>Fund your Mera wallet on Monad testnet</summary>
    <p>Send test AUSD and MON to <code>{state.address}</code>. A different wallet address has a separate balance.</p>
    <p><a href={TESTNET.monFaucet} target="_blank" rel="noreferrer">Get test MON from the Monad faucet</a>. Once MON arrives, request test AUSD below.</p>
    <button className="button button-dark" disabled={busy || !!hash || !state.signingExpiresAt} onClick={() => void requestFunds()}>{busy ? 'Confirm in your wallet...' : 'Request test AUSD'}</button>
    {hash && <p><a href={`${TESTNET.explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View faucet transaction</a> <button className="text-link" disabled={checking} onClick={() => void checkStatus()}>Check status</button></p>}
    <p role="status">{message}</p>
    <p className="auth-help">AUSD contract: <code>{TESTNET.cash}</code>. Faucet limits may apply. Passkey users must unlock signing first. Never send mainnet assets to testnet.</p>
  </details>;
}
