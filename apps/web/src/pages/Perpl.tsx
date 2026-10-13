import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import {
  PERPL_ACTIONS, PERPL_APP_URL, PERPL_DOCS_URL, PERPL_KEYS_URL, apiKeySignIn, applyFrame, beginOrder, collateralAmount,
  emptyDesk, formatScaled, nextRequestId, orderOutcome, orderRequest, parseApiSecret, parseApiToken,
  parsePerplContext, scaleUnits, tradeLeverage, type PerplAction, type PerplContext, type PerplDesk,
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
  const [action, setAction] = useState<PerplAction>(1);
  const [sizeText, setSizeText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [orderIdText, setOrderIdText] = useState('');
  const [amountText, setAmountText] = useState('');
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
  function draft() {
    if (!desk || !account || !market) throw new Error('Connect before placing an order.');
    const leverage = tradeLeverage(market.initialMargin);
    const requestId = nextRequestId(account.lastRequest, 0);
    const serial = desk.serial + 1;
    const sized = action !== 5 && action !== 6;
    const size = sized ? scaleUnits(sizeText.trim() || formatScaled(1, market.sizeDecimals), market.sizeDecimals) : undefined;
    const price = sized && priceText.trim() ? scaleUnits(priceText, market.priceDecimals) : 0;
    const orderId = action === 5 || action === 7 ? Number(orderIdText) : undefined;
    const frame = orderRequest({
      action, marketId: market.id, accountId: account.id, requestId, serial, leverage,
      size, price: sized ? price : undefined, orderId, amount: action === 6 ? amountText : undefined,
    });
    return { frame, requestId, serial };
  }
  function reviewOrder() {
    try { draft(); setStreamError(''); setReview(true); }
    catch (error) { setReview(false); setStreamError(error instanceof Error ? error.message : 'Check the order.'); }
  }
  function place() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !desk || !account || !market?.open || account.frozen || !account.forwarding || desk.stale || inFlight) return;
    try {
      const { frame, requestId, serial } = draft();
      setDesk(beginOrder(desk, { serial, requestId, marketId: market.id, accountId: account.id, action, phase: 'sent' }));
      socket.send(JSON.stringify(frame));
      setReview(false);
    } catch (error) { setStreamError(error instanceof Error ? error.message : 'The order could not be sent.'); }
  }

  const actionLabel = PERPL_ACTIONS.find(item => item.id === action)?.label ?? 'Order';
  const sized = action !== 5 && action !== 6;
  const summary = !market ? '' : action === 5 ? `Cancel order ${orderIdText.trim() || '…'} on ${market.symbol}.`
    : action === 6 ? `Add ${amountText.trim() || '…'} AUSD of position collateral on ${market.symbol}. This is not a fill.`
    : `${actionLabel} ${sizeText.trim() || formatScaled(1, market.sizeDecimals)} ${market.symbol} as a ${priceText.trim() ? `limit at ${priceText.trim()}` : 'market order'} at 1x.`;
  return <main id="main" className="page page-task perpl-page" tabIndex={-1}>
    <PageHeader back={<Link href="/markets" className="link-back"><ArrowLeft size={16} strokeWidth={1.75} /> Back to markets</Link>}
      title="Perpl testnet" lead="Open, close, cancel, or change a Monad testnet perpetual and wait for Perpl’s record. A Flurbo pool trade does not confirm it." />
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
        <p>Choose the action, then review it. A blank size uses the market minimum. A blank price is a market order (immediate-or-cancel) at 1x; a price is a limit that rests until it fills, expires, or you cancel it. “Accepted for forwarding” only means Perpl took the request. A trade counts when a fill arrives. Cancel and added collateral are not fills.</p>
        <div className="perpl-key">
          <label className="field">Action
            <select value={action} onChange={event => { setAction(Number(event.target.value) as PerplAction); setReview(false); }}>
              {PERPL_ACTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="field">Market
            <select value={marketId || ''} onChange={event => { setMarketId(Number(event.target.value)); setReview(false); }} disabled={!context}>
              {(context?.markets ?? []).filter(item => item.open).map(item => <option key={item.id} value={item.id}>{item.symbol}</option>)}
            </select>
          </label>
          {sized && <label className="field">Size{market ? ` (${market.symbol})` : ''}
            <input value={sizeText} onChange={event => { setSizeText(event.target.value); setReview(false); }} inputMode="decimal" placeholder={market ? formatScaled(1, market.sizeDecimals) : ''} autoComplete="off" />
          </label>}
          {sized && <label className="field">Limit price
            <input value={priceText} onChange={event => { setPriceText(event.target.value); setReview(false); }} inputMode="decimal" placeholder="Market if empty" autoComplete="off" />
          </label>}
          {(action === 5 || action === 7) && <label className="field">Order id
            <input value={orderIdText} onChange={event => { setOrderIdText(event.target.value); setReview(false); }} inputMode="numeric" autoComplete="off" />
          </label>}
          {action === 6 && <label className="field">Collateral (AUSD)
            <input value={amountText} onChange={event => { setAmountText(event.target.value); setReview(false); }} inputMode="decimal" autoComplete="off" />
          </label>}
        </div>
        {desk?.order?.orderId ? <p>Last order id in this session: {desk.order.orderId}. Use it to cancel or change that order.</p> : null}
        <div className="perpl-actions">
          {!review ? <button type="button" className="btn btn-primary" disabled={!market || link !== 'on' || !account || account.frozen || !account.forwarding || desk?.stale || inFlight} onClick={reviewOrder}>Review {actionLabel.toLowerCase()}</button>
            : <>
              <button type="button" className="btn btn-primary" disabled={link !== 'on' || !account || account.frozen || !account.forwarding || !!desk?.stale || inFlight} onClick={place}>Confirm testnet order</button>
              <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Back</button>
            </>}
        </div>
        {review && market && <p>Confirm: {summary} This uses test AUSD on Monad testnet.</p>}
        {outcome && <p className={`perpl-outcome callout ${outcome.tone === 'ok' ? 'callout-attention' : outcome.tone === 'bad' ? 'callout-danger' : ''}`} role="status">{outcome.text}{outcome.tone === 'ok' && outcome.txid && <> <a href={`https://testnet.monadscan.com/tx/${outcome.txid}`} target="_blank" rel="noreferrer">View transaction</a></>}</p>}
        {!outcome && confirmed && <p className="perpl-outcome callout callout-attention" role="status">{confirmed.text}{confirmed.txid && <> <a href={`https://testnet.monadscan.com/tx/${confirmed.txid}`} target="_blank" rel="noreferrer">View transaction</a></>}</p>}
        {waited && inFlight && <p role="status">No fill has arrived yet. This is not a confirmed trade.</p>}
      </li>
    </ol>
  </main>;
}
