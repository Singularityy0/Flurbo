import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight, ArrowLeft, Layers3, Wallet, Activity, LogOut, Copy, LockKeyhole, Check } from 'lucide-react';
import { useAuth } from '../auth/context';
import { meraProvider } from '../auth/mera-provider';
import { mountDashboard } from '../../../dashboard/app.mjs';
import dashboardHtml from '../../../dashboard/index.html?raw';
import dashboardCss from '../../../dashboard/styles.css?raw';
import workspaceCss from './workspace-core.css?raw';
import './workspace.css';

type Panel = 'trade' | 'positions' | 'activity';
function CoreMarket({ account, panel }: { account: string | null; panel: Panel }) {
  const { controller } = useAuth();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shadow = host.current!.shadowRoot || host.current!.attachShadow({ mode: 'open' });
    const source = new DOMParser().parseFromString(dashboardHtml, 'text/html');
    const main = source.querySelector('main')!;
    main.querySelector('.hero')?.remove(); main.querySelector('footer')?.remove();
    main.removeAttribute('id'); main.className = 'mvp-content';
    main.querySelector('#compose-title')!.textContent = 'Build your prediction.';
    main.querySelector('#account-title')!.textContent = 'Your positions.';
    main.querySelector('#trade-title')!.textContent = 'Make it yours.';
    main.querySelector('#book-title')!.textContent = 'A market for the basics.';
    main.querySelector('.account > .muted')!.textContent = 'Your selected wallet, its available balance, and the claims you are following.';
    main.querySelector('.account .pill')!.textContent = 'On-chain balances';
    main.querySelector('#setup-status')!.textContent = 'Fund your selected account with local test AUSD and MON. Mera and extension wallets have separate addresses.';
    main.querySelector('.wallet-help p:last-child')!.textContent = 'For Mera, unlock signing at the top of this workspace before confirming. Extension wallets use their own confirmation window.';
    main.querySelector('label[for="wallet-provider"]')!.textContent = 'Trading wallet';
    main.querySelector('.trading > .caption')!.textContent = 'Every approval, trade and redemption needs your confirmation. Mera signs here after review; extension wallets open their own prompt.';
    // Progressive disclosure keeps conversion and settlement available without
    // making the first trade compete with every advanced action.
    for (const heading of Array.from(main.querySelectorAll('.trading h3'))) {
      const details = document.createElement('details'); details.className = 'advanced-action';
      const summary = document.createElement('summary'); summary.textContent = heading.textContent;
      details.append(summary); heading.before(details);
      let node = heading.nextElementSibling;
      while (node && node.tagName !== 'H3' && node.id !== 'review-details') { const next = node.nextElementSibling; details.append(node); node = next; }
      heading.remove();
    }
    const style = document.createElement('style'); style.textContent = dashboardCss.replace(':root', ':host') + '\n' + workspaceCss;
    shadow.replaceChildren(style, main);
    main.setAttribute('data-panel', host.current!.dataset.panel || 'trade');
    const provider = meraProvider(controller);
    const unmount = mountDashboard(shadow, { account: account || undefined, consumer: true, credentials: 'same-origin',
      providers: account ? [{ name: 'Flurbo passkey (Mera)', provider }] : [] });
    return () => { unmount(); provider.destroy(); };
  }, [account, controller]);
  useEffect(() => { host.current?.shadowRoot?.querySelector('main')?.setAttribute('data-panel', panel); }, [panel]);
  return <div ref={host} data-panel={panel} className="core-market" />;
}

export default function Workspace() {
  const { controller, state } = useAuth();
  const [panel, setPanel] = useState<Panel>('trade');
  const [copied, setCopied] = useState(false);
  const address = state.address;
  const tabs = [{ key: 'trade', label: 'Explore & trade', icon: Layers3 }, { key: 'positions', label: 'Your positions', icon: Wallet }, { key: 'activity', label: 'Activity & network', icon: Activity }] as const;
  return <main id="main" tabIndex={-1} className="consumer-workspace">
    <aside className="workspace-sidebar">
      <Link className="workspace-back" href="/"><ArrowLeft size={16} /> Back to the idea</Link>
      <span className="eyebrow">Your workspace</span>
      <nav aria-label="Workspace">{tabs.map(({key,label,icon: Icon}) => <button key={key} type="button" aria-current={panel === key ? 'page' : undefined} onClick={() => setPanel(key)}><Icon size={18}/>{label}{panel === key && <span className="workspace-nav-dot"/>}</button>)}</nav>
      <div className="workspace-note"><span className="eyebrow">One shared pool</span><p>Separate ideas.<br/><em>Connected possibilities.</em></p><span>Synthetic events on a local Monad fork. Test assets only.</span></div>
      {address && <button className="workspace-signout" onClick={() => { void controller.signOut('Signed out. Your passkey remains available.'); }}><LogOut size={15}/> Sign out</button>}
    </aside>
    <div className="workspace-body">
      <header className="workspace-heading"><div><span className="eyebrow">Flurbo / {panel === 'trade' ? 'Make your move' : panel === 'positions' ? 'Keep the bigger picture' : 'Follow the details'}</span><h1>{panel === 'trade' ? <>A view worth <em>combining.</em></> : panel === 'positions' ? <>Your piece of <em>the picture.</em></> : <>Every move, <em>in view.</em></>}</h1><p>{panel === 'trade' ? 'Choose the outcomes you believe in. Get one price from one shared pool.' : panel === 'positions' ? 'Follow your holdings and what they pay when the outcome is known.' : 'Check transactions, pool contracts and settlement on the local network.'}</p></div><span className="workspace-network"><i/> Local test market</span></header>
      <section className="workspace-identity" aria-label="Account access">
        <div className="identity-symbol"><Wallet size={20}/></div>
        <div className="identity-copy"><span className="eyebrow">{address ? 'Your Flurbo account' : 'Make yourself at home'}</span>{state.restoring ? <p>Restoring your session...</p> : address ? <><button title="Copy full account address" onClick={async () => { try { await navigator.clipboard.writeText(address); setCopied(true); } catch { setCopied(false); } }} className="identity-address">{address.slice(0, 8)}...{address.slice(-6)} {copied ? <Check size={14}/> : <Copy size={14}/>}</button><span className="identity-caption">{state.signingExpiresAt ? 'Signing is open for this visit. Login stays active for seven days.' : 'Welcome back. Your login is saved; unlock signing when you want to trade.'}</span></> : <p>Sign in to use your Mera account, or explore with an extension wallet.</p>}</div>
        {address ? <button className="button button-dark" disabled={state.busy || !!state.signingExpiresAt} onClick={() => void controller.authenticate('login')}><LockKeyhole size={15}/>{state.busy ? 'Confirm your passkey...' : state.signingExpiresAt ? 'Signing unlocked' : 'Unlock signing'}</button> : <Link href="/login" className="button button-dark">Sign in <ArrowUpRight size={16}/></Link>}
      </section>
      {state.error && <p role="alert" className="auth-error">{state.error}</p>}
      {state.notice && <p role="status" className="auth-feedback">{state.notice}</p>}
      <CoreMarket account={address} panel={panel}/>
      <footer className="workspace-footer"><span>One pool. More possibilities.</span><span>Local prototype / AUSD collateral / Synthetic outcomes</span></footer>
    </div>
  </main>;
}
