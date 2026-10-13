import { useState } from 'react';
import { useAuth } from '../auth/context';
import { meraProvider } from '../auth/mera-provider';
import { openNote, sealNote, VAULT_STORAGE } from '../auth/passkey-vault';
import { linkTradingWallet } from '../wallet-links';

function rememberedId(rpId: string) {
  try {
    const value = JSON.parse(localStorage.getItem(`flurbo.passkey.v1:${rpId}`) ?? 'null') as { credentialId?: string };
    return typeof value?.credentialId === 'string' ? value.credentialId : '';
  } catch { return ''; }
}

export default function PasskeyAccount() {
  const { controller, state, policy } = useAuth();
  const [note, setNote] = useState('');
  const [opened, setOpened] = useState('');
  const [vaultReady, setVaultReady] = useState(() => {
    try { return !!localStorage.getItem(VAULT_STORAGE); } catch { return false; }
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const session = state.signingExpiresAt !== null && state.signingExpiresAt > Date.now();
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await fn(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The passkey step could not finish.'); }
    finally { setBusy(false); }
  }
  return <section className="panel access-card" aria-label="Passkey account">
    <div className="panel-head"><h2>Passkey account</h2></div>
    <p>This passkey is the account. A trading session lets it sign Monad testnet contract calls for ten minutes without MetaMask. Closing the tab, or Lock, wipes the signer. The key is not stored.</p>
    <p role="status">{session && state.signingExpiresAt ? `Trading session open until ${new Date(state.signingExpiresAt).toLocaleTimeString()}.` : 'Trading session locked. Sign-in does not keep a signer.'}</p>
    <div className="access-actions">
      <button className="btn btn-primary" disabled={busy || !state.address} onClick={() => void run(async () => {
        const openedSession = session || await controller.unlockSigning();
        if (!openedSession) throw new Error(controller.getSnapshot().error || 'The trading session was not opened.');
        if (!state.address) return;
        await linkTradingWallet(meraProvider(controller), state.address, state.address);
        setMessage('This passkey address can now trade. Fund it with test MON for fees and test AUSD for the market.');
      })}>{busy ? 'Waiting for the passkey…' : session ? 'Link this passkey for trading' : 'Open a trading session'}</button>
      <button className="btn btn-secondary" disabled={busy || !session} onClick={() => controller.lockSigning()}>Lock</button>
    </div>
    <h3>A second key from the same passkey</h3>
    <p>Save a private note under a new PRF salt. That salt is not the one that derives the trading account. Only the ciphertext stays in this browser. The same passkey opens it on another device.</p>
    <label className="field">Private note
      <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={3} autoComplete="off" spellCheck={false} />
    </label>
    <div className="access-actions">
      <button className="btn btn-secondary" disabled={busy || !policy.rpId || !note.trim()} onClick={() => void run(async () => {
        if (!policy.rpId) return;
        const credentialId = rememberedId(policy.rpId);
        if (!credentialId) throw new Error('Sign in on this browser before sealing a note.');
        const vault = await sealNote({ rpId: policy.rpId, credentialId, note: note.trim() });
        localStorage.setItem(VAULT_STORAGE, JSON.stringify(vault));
        setNote(''); setOpened(''); setVaultReady(true); setMessage('The note is sealed. The trading key was not used.');
      })}>Seal note</button>
      <button className="btn btn-secondary" disabled={busy || !vaultReady || !policy.rpId} onClick={() => void run(async () => {
        if (!policy.rpId) return;
        const raw = localStorage.getItem(VAULT_STORAGE);
        if (!raw) throw new Error('No sealed note is saved in this browser.');
        const text = await openNote({ rpId: policy.rpId, vault: JSON.parse(raw) });
        setOpened(text); setMessage('Opened with the note’s own passkey salt.');
      })}>Open note</button>
    </div>
    {opened && <p role="status">{opened}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
