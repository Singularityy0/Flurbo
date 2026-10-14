import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { discoverWallets, type BrowserWallet } from '../auth/wallet-choice';
import { TESTNET } from '../../server/network.mjs';
import {
  PERPL_ACTIONS, PERPL_APP_URL, PERPL_DOCS_URL, PERPL_KEYS_URL, applyFrame, beginOrder, collateralAmount,
  emptyDesk, enrollApiKey, formatScaled, nextRequestId, orderOutcome, orderRequest, parseApiSecret, parseApiToken, resumeDesk,
  parsePerplContext, scaleUnits, tradeLeverage, type PerplAction, type PerplContext, type PerplDesk,
} from '../perpl';
import './perpl.css';
import { tradingSocketUrl, wireTradingSocket } from '../perpl-connection';
import { emptyPortfolio, portfolioFrame } from '../perpl-portfolio';
import PerplPortfolio from './PerplPortfolio';

const STORAGE = 'flurbo.perpl.testnet.v1';
const OPENED = 'flurbo.perpl.opened';
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
  const [enrolling, setEnrolling] = useState(false);
  const [openedPerpl, setOpenedPerpl] = useState(false);
  const [wallets, setWallets] = useState<BrowserWallet[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [marketId, setMarketId] = useState(0);
  const [desk, setDesk] = useState<PerplDesk | null>(null);
  const [portfolio, setPortfolio] = useState(emptyPortfolio);
  const [refreshed, setRefreshed] = useState<number|null>(null);
  const [selectedAccount, setSelectedAccount] = useState<number|null>(null);
  const [link, setLink] = useState<LinkState>('off');
  const [streamError, setStreamError] = useState('');
  const [action, setAction] = useState<PerplAction>(1);
  const [sizeText, setSizeText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [orderIdText, setOrderIdText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [review, setReview] = useState(false);
  const [waited, setWaited] = useState(false);
  const [accountWait, setAccountWait] = useState(false);
  const [confirmed, setConfirmed] = useState<{ text: string; txid?: string } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const deskRef = useRef<PerplDesk | null>(null);
  const reviewed = useRef<{ action: PerplAction; sizeText: string; priceText: string } | null>(null);
  const reconnects = useRef(0);
  const stopConnection = useRef<() => void>(() => {});
  deskRef.current = desk;
  const account = desk?.accounts.find(account=>account.id===selectedAccount) ?? desk?.accounts[0];
  const accountHasBalance = !!account && /^\d+$/.test(account.balance) && BigInt(account.balance) > 0n;
  const market = context?.markets.find(item => item.id === marketId) ?? null;
  const outcome = desk ? orderOutcome(desk.order, desk.stale) : null;
  const inFlight = desk?.order?.phase === 'sent' || desk?.order?.phase === 'admitted';

  useEffect(() => { setSaved(readSaved()); try { setOpenedPerpl(sessionStorage.getItem(OPENED) === '1'); } catch { /* The Perpl link still works. */ } }, []);
  useEffect(() => discoverWallets(wallet => setWallets(current => current.some(item => item.provider === wallet.provider) ? current : [...current, wallet])), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/perpl/context', { credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to load Perpl markets.' : 'Perpl market data is unavailable. Try again shortly.');
        return parsePerplContext(await response.json());
      })
      .then(value => { setContext(value); setDesk(emptyDesk(value.instanceId)); setRefreshed(Date.now()); setContextError(''); })
      .catch(error => { if (!controller.signal.aborted) setContextError(error instanceof Error ? error.message : 'Perpl market data is unavailable. Try again shortly.'); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller=new AbortController();
    let busy=false;
    const timer=setInterval(()=>{
      if(busy||document.visibilityState==='hidden')return;
      busy=true;
      void fetch('/api/perpl/context',{credentials:'same-origin',signal:controller.signal})
        .then(async response=>{if(!response.ok)throw new Error('Market refresh failed');return parsePerplContext(await response.json());})
        .then(value=>{setContext(current=>current?.instanceId===value.instanceId?value:current);setRefreshed(Date.now());})
        .catch(()=>{/* Keep the last snapshot and its timestamp. */}).finally(()=>{busy=false;});
    },30_000);
    return()=>{clearInterval(timer);controller.abort();};
  },[]);
  useEffect(() => {
    if (!context) return;
    setMarketId(current => context.markets.some(item => item.id === current && item.open) ? current : context.markets.find(item => item.open)?.id ?? 0);
  }, [context]);
  useEffect(() => { if (outcome?.tone === 'ok') setConfirmed({ text: outcome.text, txid: outcome.txid }); }, [outcome?.tone, outcome?.text, outcome?.txid]);
  useEffect(() => {
    if (link !== 'on' || account || desk?.listed) return;
    const timer = setTimeout(() => setAccountWait(true), 12_000);
    return () => { clearTimeout(timer); setAccountWait(false); };
  }, [link, account, desk?.listed]);
  useEffect(() => {
    if (!inFlight) return;
    const timer = setTimeout(() => setWaited(true), 30_000);
    return () => { clearTimeout(timer); setWaited(false); };
  }, [inFlight, desk?.order?.requestId]);

  useEffect(() => () => {
    stopConnection.current();
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
  function keyErrorText(error: unknown) {
    const code = (error as { code?: number })?.code;
    if (code === 4001) return 'Enrollment cancelled in MetaMask.';
    return error instanceof Error ? error.message : 'That key could not be created.';
  }
  async function enroll() {
    if (enrolling) return;
    setEnrolling(true); setKeyError('');
    try {
      const provider = wallets[0]?.provider;
      if (!provider) throw new Error('Open Flurbo in MetaMask or install its extension.');
      await provider.request({ method: 'eth_requestAccounts' });
      if (await provider.request({ method: 'eth_chainId' }) !== '0x279f') {
        try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] }); }
        catch (error) {
          if ((error as { code?: number })?.code !== 4902) throw error;
          await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x279f', chainName: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: [TESTNET.rpc], blockExplorerUrls: [TESTNET.explorer] }] });
        }
      }
      const accounts = await provider.request({ method: 'eth_accounts' });
      const address = Array.isArray(accounts) ? String(accounts[0] ?? '') : '';
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Select a MetaMask account.');
      if (await provider.request({ method: 'eth_chainId' }) !== '0x279f') throw new Error('Select Monad testnet in MetaMask and try again.');
      const enrolled = await enrollApiKey({
        address,
        signTypedData: async typedData => {
          const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [address, JSON.stringify(typedData)] });
          if (typeof signature !== 'string') throw new Error('MetaMask did not return an enrollment signature.');
          return signature;
        },
      });
      sessionStorage.setItem(STORAGE, JSON.stringify({ token: enrolled.token, secret: enrolled.secretHex }));
      setSaved({ token: enrolled.token, secret: enrolled.secret }); setTokenInput(''); setSecretInput('');
    } catch (error) { setKeyError(keyErrorText(error)); }
    finally { setEnrolling(false); }
  }
  function forgetKey() {
    stopConnection.current();
    const previous = socketRef.current;
    socketRef.current = null;
    previous?.close();
    sessionStorage.removeItem(STORAGE);
    setSaved(null); setLink('off'); setReview(false); setStreamError(''); setConfirmed(null);
    setPortfolio(emptyPortfolio()); setSelectedAccount(null);
    if (context) setDesk(emptyDesk(context.instanceId));
  }
  function connect(preserve = false) {
    if (!saved || !context) return;
    stopConnection.current();
    const previous = socketRef.current;
    socketRef.current = null;
    previous?.close();
    setStreamError(''); setReview(false); setLink('connecting');
    if (!preserve) reconnects.current = 0;
    const next = preserve ? resumeDesk(deskRef.current, context.instanceId) : emptyDesk(context.instanceId);
    setDesk(next);
    setPortfolio(emptyPortfolio());
    const socket = new WebSocket(tradingSocketUrl(location));
    socketRef.current = socket;
    const key = saved;
    stopConnection.current = wireTradingSocket(socket, key, {
      ready: () => { if (socketRef.current === socket) setLink('on'); },
      frame: frame => { if (socketRef.current === socket) { setDesk(current => current ? applyFrame(current, frame) : current); setPortfolio(current=>portfolioFrame(current,frame)); } },
      error: message => { if (socketRef.current === socket) { setStreamError(message); setLink('off'); } },
    });
    socket.onclose = event => {
      if (socketRef.current !== socket) return;
      stopConnection.current();
      const phase = deskRef.current?.order?.phase;
      if (phase === 'filled') { setLink('off'); return; }
      if ((phase === 'sent' || phase === 'admitted') && reconnects.current < 1) {
        reconnects.current += 1;
        connect(true);
        return;
      }
      setLink('off');
      if (event.code === 3401) setStreamError('Perpl rejected this key. Create a trade-scoped key and try again.');
      else if (event.code !== 1000) setStreamError('The Perpl connection closed before a fill.');
    };
  }
  function draft(overrides?: { action?: PerplAction; sizeText?: string; priceText?: string }) {
    if (!desk || !account || !market) throw new Error('Connect before placing an order.');
    const nextAction = overrides?.action ?? action;
    const nextSize = overrides?.sizeText ?? sizeText;
    const nextPrice = overrides?.priceText ?? priceText;
    const leverage = tradeLeverage(market.initialMargin);
    const requestId = nextRequestId(account.lastRequest, 0);
    const serial = desk.serial + 1;
    const sized = nextAction !== 5 && nextAction !== 6;
    const size = sized ? scaleUnits(nextSize.trim() || formatScaled(1, market.sizeDecimals), market.sizeDecimals) : undefined;
    const price = sized && nextPrice.trim() ? scaleUnits(nextPrice, market.priceDecimals) : 0;
    const orderId = nextAction === 5 || nextAction === 7 ? Number(orderIdText) : undefined;
    const frame = orderRequest({
      action: nextAction, marketId: market.id, accountId: account.id, requestId, serial, leverage,
      size, price: sized ? price : undefined, orderId, amount: nextAction === 6 ? amountText : undefined,
    });
    return { frame, requestId, serial };
  }
  function reviewOrder() {
    try { draft(); reviewed.current = { action, sizeText, priceText }; setStreamError(''); setReview(true); }
    catch (error) { reviewed.current = null; setReview(false); setStreamError(error instanceof Error ? error.message : 'Check the order.'); }
  }
  function reviewFill() {
    const marketOrder = { action: 1 as PerplAction, sizeText: '', priceText: '' };
    setAction(1); setSizeText(''); setPriceText(''); setOrderIdText(''); setAmountText('');
    try { draft(marketOrder); reviewed.current = marketOrder; setStreamError(''); setReview(true); }
    catch (error) { reviewed.current = null; setReview(false); setStreamError(error instanceof Error ? error.message : 'Check the order.'); }
  }
  function place() {
    const socket = socketRef.current;
    const chosen = reviewed.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !desk || !accountHasBalance || !account || !market?.open || account.frozen || !account.forwarding || desk.stale || inFlight || !chosen) return;
    try {
      const { frame, requestId, serial } = draft(chosen);
      setDesk(beginOrder(desk, { serial, requestId, marketId: market.id, accountId: account.id, action: chosen.action, phase: 'sent' }));
      socket.send(JSON.stringify(frame));
      reviewed.current = null;
      setReview(false);
    } catch (error) { setStreamError(error instanceof Error ? error.message : 'The order could not be sent.'); }
  }

  const actionLabel = PERPL_ACTIONS.find(item => item.id === action)?.label ?? 'Order';
  const sized = action !== 5 && action !== 6;
  const summary = !market ? '' : action === 5 ? `Cancel order ${orderIdText.trim() || '…'} on ${market.symbol}.`
    : action === 6 ? `Add ${amountText.trim() || '…'} AUSD of position collateral on ${market.symbol}. This is not a fill.`
    : `${actionLabel} ${sizeText.trim() || formatScaled(1, market.sizeDecimals)} ${market.symbol} as a ${priceText.trim() ? `limit at ${priceText.trim()}` : 'market order'} at 1x.`;
  return <main id="main" className="page perpl-page" tabIndex={-1}>
    <PageHeader back={<Link href="/markets" className="link-back"><ArrowLeft size={16} strokeWidth={1.75} /> Back to markets</Link>}
      title="Perpl testnet" lead="Open, close, cancel, or change a Monad testnet perpetual and wait for Perpl’s record. A Flurbo pool trade does not confirm it." />
    <p className="callout">Connect the MetaMask wallet on Perpl, then create the trade key here. Those are two separate steps. The private key stays in this browser session.</p>
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
          <a href={PERPL_DOCS_URL} target="_blank" rel="noreferrer">Enrollment and signing</a></div>
        <p>Create a trading key so Flurbo can submit the orders you confirm.</p>
        {saved ? <div className="perpl-actions"><p>A key is saved for this browser session.</p><button type="button" className="btn btn-secondary" onClick={forgetKey}>Remove key</button></div>
          : <>
            <ol className="perpl-substeps">
              <li className={openedPerpl ? 'done' : ''}>
                <h3><span className="perpl-index">1</span> Set up your Perpl account</h3>
                <p>Complete these steps on Perpl during your first visit:</p>
                <ol className="perpl-setup-checklist">
                  <li>Connect MetaMask with the same wallet you will use in Flurbo, on Monad testnet.</li>
                  <li>Keep test MON in that wallet for transaction fees and test AUSD for your deposit. If needed, get test funds from <Link href="/fund">Get test funds</Link> before opening Perpl.</li>
                  <li>Use Perpl’s deposit flow to fund your trading account with at least {context ? collateralAmount(context.minimumDeposit) : '100'} test AUSD. Approve the token allowance and confirm the deposit in MetaMask when requested. A wallet balance alone is not a deposit.</li>
                  <li>Enable One-Click Trading on Perpl and approve any wallet confirmation it requests.</li>
                  <li>Check that your Perpl trading account shows the deposit, then return to this Flurbo tab.</li>
                </ol>
                <div className="perpl-actions"><a className="btn btn-primary" href={PERPL_APP_URL} target="_blank" rel="noreferrer" onClick={() => { try { sessionStorage.setItem(OPENED, '1'); } catch { /* The visit still counts on this page. */ } setOpenedPerpl(true); }}>Open Perpl</a></div>
              </li>
              <li>
                <h3><span className="perpl-index">2</span> Create the trade key</h3>
                <p>Back in Flurbo, use the same MetaMask account and approve the key signature. Then select Connect below to load your trading balance.</p>
                <div className="perpl-actions"><button type="button" className="btn btn-primary" disabled={enrolling} onClick={() => void enroll()}>{enrolling ? 'Confirm in MetaMask…' : 'Create a trade key with MetaMask'}</button></div>
              </li>
            </ol>
            {keyError && <p className="field-error" role="alert">{keyError}</p>}
            <details className="perpl-existing">
              <summary>Use an existing key</summary>
              <p>Paste a token and Ed25519 private key from <a href={PERPL_KEYS_URL} target="_blank" rel="noreferrer">Perpl’s key page</a> if you already created one there.</p>
              <form className="perpl-key" onSubmit={saveKey}>
                <label className="field">API token<input value={tokenInput} onChange={event => setTokenInput(event.target.value)} autoComplete="off" spellCheck={false} required /></label>
                <label className="field">Private key<input value={secretInput} onChange={event => setSecretInput(event.target.value)} type="password" autoComplete="off" spellCheck={false} required /></label>
                <button type="submit" className="btn btn-secondary">Save key in this session</button>
              </form>
            </details>
          </>}
      </li>
      <li className={account ? 'done' : ''}>
        <div className="perpl-step-head"><h2><span className="perpl-index">3</span> Account</h2></div>
        <p>Select Connect to load your Perpl trading balance and One-Click Trading status. If you have already completed setup on Perpl, you do not need to repeat it. <a href={PERPL_APP_URL} target="_blank" rel="noreferrer">Open Perpl</a></p>
        <div className="perpl-actions">
          <button type="button" className="btn btn-primary" onClick={() => connect()} disabled={!saved || !context || link === 'connecting'}>{link === 'on' ? 'Reconnect' : link === 'connecting' ? 'Connecting…' : 'Connect'}</button>
        </div>
        {streamError && <p role="alert">{streamError}</p>}
        {link === 'on' && !account && !desk?.listed && <p role="status">{accountWait ? 'Perpl has not sent an exchange account. Reconnect, or remove the key and create it again.' : 'The key is signed in. Perpl has not sent an exchange account yet.'}</p>}
        {link === 'on' && !account && desk?.listed && <p role="alert">Perpl replied with no exchange account. There is nothing to trade yet. Deposit at least 100 AUSD on Perpl, turn on one-click trading, then reconnect.</p>}
        {account && <dl className="perpl-markets">
          <div><dt>Account</dt><dd>{account.id}</dd></div>
          <div><dt>Balance</dt><dd>{collateralAmount(account.balance) || '—'} AUSD</dd></div>
          <div><dt>One-click trading</dt><dd>{account.forwarding ? 'On' : 'Off'}</dd></div>
        </dl>}
        {account?.frozen && <p role="alert">This account is frozen, so an order cannot be sent.</p>}
        {account && !accountHasBalance && <p role="alert">This exchange account has no AUSD balance yet. Deposit at least 100 AUSD on Perpl, then reconnect.</p>}
        {account && !account.forwarding && <p role="alert">Turn on one-click trading in Perpl, then reconnect. An order sent while it is off does not reach the chain.</p>}
      </li>
      <li>
        <div className="perpl-step-head"><h2><span className="perpl-index">4</span> Order and fill</h2></div>
        <p>Choose an action and market, review the order, then confirm. Leave size blank to use the minimum and price blank for a market order at 1x. Enter a price for a limit order. Your trade is complete when Perpl reports a fill; an accepted request is still pending. Canceling an order or adding collateral does not execute a trade.</p>
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
          {!review ? <>
            <button type="button" className="btn btn-primary" disabled={!market || link !== 'on' || !accountHasBalance || account?.frozen || !account?.forwarding || desk?.stale || inFlight} onClick={reviewFill}>Review the market fill</button>
            <button type="button" className="btn btn-secondary" disabled={!market || link !== 'on' || !accountHasBalance || account?.frozen || !account?.forwarding || desk?.stale || inFlight} onClick={reviewOrder}>Review {actionLabel.toLowerCase()}</button>
          </>
            : <>
              <button type="button" className="btn btn-primary" disabled={link !== 'on' || !accountHasBalance || account?.frozen || !account?.forwarding || !!desk?.stale || inFlight} onClick={place}>Confirm testnet order</button>
              <button type="button" className="btn btn-secondary" onClick={() => setReview(false)}>Back</button>
            </>}
        </div>
        {review && market && <p>Confirm: {summary} This uses test AUSD on Monad testnet.</p>}
        {outcome && <p className={`perpl-outcome callout ${outcome.tone === 'ok' ? 'callout-attention' : outcome.tone === 'bad' ? 'callout-danger' : ''}`} role="status">{outcome.text}{outcome.tone === 'ok' && outcome.txid && <> <a className="perpl-tx" href={`https://testnet.monadscan.com/tx/${outcome.txid}`} target="_blank" rel="noreferrer">{outcome.txid}</a></>}</p>}
        {!outcome && confirmed && <p className="perpl-outcome callout callout-attention" role="status">{confirmed.text}{confirmed.txid && <> <a className="perpl-tx" href={`https://testnet.monadscan.com/tx/${confirmed.txid}`} target="_blank" rel="noreferrer">{confirmed.txid}</a></>}</p>}
        {waited && inFlight && <p role="status">No fill has arrived yet. This is not a confirmed trade.</p>}
      </li>
    </ol>
    {context && <PerplPortfolio apiKey={saved} portfolio={portfolio} context={context} connected={link==='on'} stale={!!desk?.stale} refreshed={refreshed} onClose={position=>{
      setSelectedAccount(position.account);setMarketId(position.market);setAction(position.side===1?3:4);
      const m=context.markets.find(m=>m.id===position.market);
      setSizeText(m?formatScaled(position.size,m.sizeDecimals):'');setPriceText('');setReview(false);
      document.querySelector('.perpl-steps > li:last-child')?.scrollIntoView({behavior:'smooth',block:'start'});
    }}/>}
  </main>;
}
