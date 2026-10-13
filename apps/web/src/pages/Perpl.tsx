import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import {
  PERPL_APP_URL, PERPL_DOCS_URL, PERPL_KEYS_URL, apiKeySignIn, applyFrame, beginOrder, collateralAmount,
  emptyDesk, formatScaled, minimumLong, nextRequestId, orderOutcome, parseApiSecret, parseApiToken,
  parsePerplContext, tradeLeverage, type PerplContext, type PerplDesk,
} from '../perpl';
import './perpl.css';

const STORAGE = 'flurbo.perpl.testnet.v1';
type Saved = { token: string; secret: Uint8Array };
type LinkState = 'off' | 'connecting' | 'on';

function readSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    if (!raw) return null;
    const value = JSON.parse(raw) as { token?: string; secret?: string };
    return { token: parseApiToken(String(value.token ?? '')), secret: parseApiSecret(String(value.secret ?? '')) };
  } catch { return null; }
}

export default function Perpl() {
  const [context, setContext] = useState<PerplContext | null>(null);
  const [contextError, setContextError] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [keyError, setKeyError] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [marketId, setMarketId] = useState(0);
  const [desk, setDesk] = useState<PerplDesk | null>(null);
  const [link, setLink] = useState<LinkState>('off');
  const [streamError, setStreamError] = useState('');
  const [review, setReview] = useState(false);
  const [waited, setWaited] = useState(false);
  const [confirmed, setConfirmed] = useState<{ text: string; txid?: string } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const deskRef = useRef<PerplDesk | null>(null);
  deskRef.current = desk;
  const account = desk?.accounts[0];
  const market = context?.markets.find(item => item.id === marketId) ?? null;
  const outcome = desk ? orderOutcome(desk.order, desk.stale) : null;
  const inFlight = desk?.order?.phase === 'sent' || desk?.order?.phase === 'admitted';

  useEffect(() => { setSaved(readSaved()); }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/perpl/context', { credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to load Perpl markets.' : 'Perpl market data is unavailable. Try again shortly.');
        return parsePerplContext(await response.json());
      })
      .then(value => { setContext(value); setDesk(emptyDesk(value.instanceId)); setContextError(''); })
      .catch(error => { if (!controller.signal.aborted) setContextError(error instanceof Error ? error.message : 'Perpl market data is unavailable. Try again shortly.'); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!context) return;
    setMarketId(current => context.markets.some(item => item.id === current && item.open) ? current : context.markets.find(item => item.open)?.id ?? 0);
  }, [context]);
  useEffect(() => { if (outcome?.tone === 'ok') setConfirmed({ text: outcome.text, txid: outcome.txid }); }, [outcome?.tone, outcome?.text, outcome?.txid]);
  useEffect(() => {
    if (!inFlight) return;
    const timer = setTimeout(() => setWaited(true), 30_000);
    return () => { clearTimeout(timer); setWaited(false); };
  }, [inFlight, desk?.order?.requestId]);

  useEffect(() => () => {
    const previous = socketRef.current;
    socketRef.current = null;
    previous?.close();
  }, []);
  function saveKey(event: FormEvent) {
    event.preventDefault();
    try {
      const token = parseApiToken(tokenInput);
      const secret = parseApiSecret(secretInput);
      const next = { token, secret };
      sessionStorage.setItem(STORAGE, JSON.stringify({ token, secret: secretInput.trim() }));
      setSaved(next); setTokenInput(''); setSecretInput(''); setKeyError('');
    } catch (error) { setKeyError(error instanceof Error ? error.message : 'That key could not be saved.'); }
  }
  function forgetKey() {
    const previous = socketRef.current;
    socketRef.current = null;
    previous?.close();
    sessionStorage.removeItem(STORAGE);
    setSaved(null); setLink('off'); setReview(false); setStreamError(''); setConfirmed(null);
    if (context) setDesk(emptyDesk(context.instanceId));
  }
  function connect() {
    if (!saved || !context) return;
    const previous = socketRef.current;
    socketRef.current = null;
    previous?.close();
    setStreamError(''); setReview(false); setLink('connecting');
    const next = emptyDesk(context.instanceId);
    setDesk(next);
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/perpl/trade`);
    socketRef.current = socket;
    const key = saved;
    socket.onopen = () => {
      setLink('on');
      void apiKeySignIn(key.secret, key.token).then(frame => {
        if (socketRef.current === socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
      }).catch(() => setStreamError('This key could not be signed.'));
    };
    socket.onmessage = event => {
      if (typeof event.data !== 'string') return;
      try { setDesk(current => current ? applyFrame(current, JSON.parse(event.data)) : current); } catch { setStreamError('Perpl sent a market update this page could not read.'); }
    };
    socket.onclose = event => {
      if (socketRef.current !== socket) return;
      setLink('off');
      if (deskRef.current?.order?.phase === 'filled') return;
      if (event.code === 3401) setStreamError('Perpl rejected this key. Create a trade-scoped key and paste it again.');
      else if (event.code !== 1000) setStreamError('The Perpl connection closed before a fill.');
    };
  }
  function place() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !desk || !account || !market?.open || account.frozen || !account.forwarding || desk.stale || inFlight) return;
    try {
      const leverage = tradeLeverage(market.initialMargin);
      const requestId = nextRequestId(account.lastRequest, 0);
      const serial = desk.serial + 1;
      const frame = minimumLong({ marketId: market.id, accountId: account.id, requestId, serial, leverage });
      setDesk(beginOrder(desk, { serial, requestId, marketId: market.id, accountId: account.id, phase: 'sent' }));
      socket.send(JSON.stringify(frame));
      setReview(false);
    } catch (error) { setStreamError(error instanceof Error ? error.message : 'The order could not be sent.'); }
  }

  const minimum = market ? `${formatScaled(1, market.sizeDecimals)} ${market.symbol}` : '';
  return <main id="main" className="page page-task perpl-page" tabIndex={-1}>
    <PageHeader back={<Link href="/markets" className="link-back"><ArrowLeft size={16} strokeWidth={1.75} /> Back to markets</Link>}
      title="Perpl testnet" lead="Place one Monad testnet perpetual and wait for Perpl’s fill record. A Flurbo pool trade does not confirm it." />
    <p className="callout">Perpl has not approved key enrollment from this site. Create the key on Perpl, then paste it here. The private key stays in this browser session. This server only relays messages that are already signed.</p>
    <ol className="perpl-steps">
      <li className={context ? 'done' : ''}>
        <div className="perpl-step-head"><h2><span className="perpl-index">1</span> Markets</h2></div>
        {contextError && <p role="alert">{contextError}</p>}
        {!context && !contextError && <p role="status">Loading Perpl markets…</p>}
        {context && <dl className="perpl-markets">
          {context.markets.map(item => <div key={item.id}><dt>{item.symbol}{item.open ? '' : ' (closed)'}</dt><dd>{formatScaled(item.mark, item.priceDecimals)}</dd></div>)}
        </dl>}
      </li>
      <li className={saved ? 'done' : ''}>
        <div className="perpl-step-head"><h2><span className="perpl-index">2</span> API key</h2>
          <a href={PERPL_KEYS_URL} target="_blank" rel="noreferrer">Create a testnet key</a></div>
        <p>On Perpl, create a key with trade scope for Monad testnet (chain 10143). Paste the token and the Ed25519 private key below. <a href={PERPL_DOCS_URL} target="_blank" rel="noreferrer">Perpl’s authentication guide</a> describes this paste path, and the order and fill rules.</p>
        {saved ? <div className="perpl-actions"><p>A key is saved for this browser session.</p><button type="button" className="btn btn-secondary" onClick={forgetKey}>Remove key</button></div>
          : <form className="perpl-key" onSubmit={saveKey}>
            <label className="field">API token<input value={tokenInput} onChange={event => setTokenInput(event.target.value)} autoComplete="off" spellCheck={false} required /></label>
            <label className="field">Private key<input value={secretInput} onChange={event => setSecretInput(event.target.value)} type="password" autoComplete="off" spellCheck={false} required /></label>
            {keyError && <p className="field-error" role="alert">{keyError}</p>}
            <button type="submit" className="btn btn-primary">Save key in this session</button>
          </form>}
      </li>
      <li className={account ? 'done' : ''}>
        <div className="perpl-step-head"><h2><span className="perpl-index">3</span> Account</h2></div>
        <p>An enrolled key is not an exchange account. Open one on Perpl with at least {context ? collateralAmount(context.minimumDeposit) : '…'} AUSD, and turn on one-click trading so orders can be forwarded. <a href={PERPL_APP_URL} target="_blank" rel="noreferrer">Open the Perpl testnet app</a></p>
        <div className="perpl-actions">
          <button type="button" className="btn btn-primary" onClick={connect} disabled={!saved || !context || link === 'connecting'}>{link === 'on' ? 'Reconnect' : link === 'connecting' ? 'Connecting…' : 'Connect'}</button>
        </div>
        {streamError && <p role="alert">{streamError}</p>}
        {link === 'on' && !account && <p role="status">Connected. Waiting for the account snapshot.</p>}
        {account && <dl className="perpl-markets">
          <div><dt>Account</dt><dd>{account.id}</dd></div>
          <div><dt>Balance</dt><dd>{collateralAmount(account.balance) || '—'} AUSD</dd></div>
          <div><dt>One-click trading</dt><dd>{account.forwarding ? 'On' : 'Off'}</dd></div>
        </dl>}
        {account?.frozen && <p role="alert">This account is frozen, so an order cannot be sent.</p>}
        {account && !account.forwarding && <p role="alert">Turn on one-click trading in Perpl, then reconnect. An order sent while it is off does not reach the chain.</p>}
      </li>
      <li>
        <div className="perpl-step-head"><h2><span className="perpl-index">4</span> Order and fill</h2></div>
        <p>The order is the minimum size, a market buy (long), immediate-or-cancel, at 1x. “Accepted for forwarding” only means Perpl took the request. The trade counts when a fill arrives, including its transaction when Perpl sends one.</p>
        <label className="field">Market
          <select value={marketId || ''} onChange={event => { setMarketId(Number(event.target.value)); setReview(false); }} disabled={!context}>
            {(context?.markets ?? []).filter(item => item.open).map(item => <option key={item.id} value={item.id}>{item.symbol}</option>)}
          </select>
        </label>
        <div className="perpl-actions">
          {!review ? <button type="button" className="btn btn-primary" disabled={!market || link !== 'on' || !account || account.frozen || !account.forwarding || desk?.stale || inFlight} onClick={() => setReview(true)}>Review {minimum}</button>
            : <>
              <button type="button" className="btn btn-primary" disabled={link !== 'on' || !account || account.frozen || !account.forwarding || !!desk?.stale || inFlight} onClick={place}>Confirm testnet order</button>
              <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Cancel</button>
            </>}
        </div>
        {review && market && <p>Confirm a long of {minimum} on {market.symbol}. This uses test AUSD on Monad testnet.</p>}
        {outcome && <p className={`perpl-outcome callout ${outcome.tone === 'ok' ? 'callout-attention' : outcome.tone === 'bad' ? 'callout-danger' : ''}`} role="status">{outcome.text}{outcome.tone === 'ok' && outcome.txid && <> <a href={`https://testnet.monadscan.com/tx/${outcome.txid}`} target="_blank" rel="noreferrer">View transaction</a></>}</p>}
        {!outcome && confirmed && <p className="perpl-outcome callout callout-attention" role="status">{confirmed.text}{confirmed.txid && <> <a href={`https://testnet.monadscan.com/tx/${confirmed.txid}`} target="_blank" rel="noreferrer">View transaction</a></>}</p>}
        {waited && inFlight && <p role="status">No fill has arrived yet. This is not a confirmed trade.</p>}
      </li>
    </ol>
  </main>;
}
