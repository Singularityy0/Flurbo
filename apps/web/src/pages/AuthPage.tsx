import { ArrowUpRight, CircleArrowLeft, LockKeyhole, Copy, LogOut } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Logo } from "../App";
import { useAuth } from "../auth/context";

type AuthMode = "login" | "signup" | "account";

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { controller, state, policy } = useAuth();
  const [, navigate] = useLocation();
  const [name, setName] = useState("Flurbo account");
  const [allowNew, setAllowNew] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const isLogin = mode !== "signup";
  const active = !!state.address;
  useEffect(() => { if (active && !state.busy) navigate('/markets'); }, [active, state.busy, navigate]);
  const localHref = policy.localUrl ? new URL(isLogin ? "/login" : "/signup", policy.localUrl).href : undefined;

  async function authenticate(chooseAnother = false) {
    const succeeded = await controller.authenticate(isLogin ? "login" : "signup", name, chooseAnother, allowNew);
    if (succeeded) navigate("/markets");
  }
  function submit(event: FormEvent) { event.preventDefault(); void authenticate(); }
  async function copyAddress() {
    if (!state.address) return;
    try { await navigator.clipboard.writeText(state.address); setCopyStatus("Address copied."); }
    catch { setCopyStatus("Copy was unavailable. You can select the address above."); }
  }

  return (
    <main id="main" tabIndex={-1} className="auth-page section-light">
      <div className="auth-grid">
        <div className="auth-aside">
          <Link href="/" className="auth-back"><CircleArrowLeft size={17} /> Back to flurbo</Link>
          <div className="auth-aside-copy">
            <span className="eyebrow">{active ? "Your place in the picture" : isLogin ? "Welcome back" : "Make a little room"}</span>
            <h1>{active ? "A familiar way in." : isLogin ? "Your view. Your account." : "Create your place in the picture."}</h1>
            <p>{active ? "Your passkey opens the same account each time. Keep access to it through your password manager."
              : isLogin ? "Use your saved Flurbo passkey to return to your account."
              : "Start with a passkey. Your device or password manager handles the sign-in, without another password to remember."}</p>
          </div>
          <div className="auth-aside-mark" aria-hidden="true"><span className="auth-mark-orbit orbit-one" /><span className="auth-mark-orbit orbit-two" /><span className="auth-mark-core" /></div>
        </div>
        <div className="auth-panel-wrap">
          <div className="auth-panel">
            <div className="auth-panel-brand"><Logo /><span>{policy.local ? "local test" : "passkey account"}</span></div>
            <div className="unavailable-icon"><LockKeyhole size={21} strokeWidth={1.6} /></div>
            <p className="eyebrow">{active ? "Signed in with Mera" : "Powered by Mera"}</p>
            <h2>{active ? "You're in." : isLogin ? "Sign in with your passkey." : "One passkey. Your account."}</h2>
            {policy.local && <div className="honesty-note">Local test account only. This passkey will not work on flurbo.singu.online. Do not send real funds to this account.</div>}
            {active ? <>
              <p className="auth-panel-copy">Your account is ready. Opening your workspace.</p>
              <div className="account-address"><span className="eyebrow">Mera account address</span><code>{state.address}</code></div>
              <button type="button" className="text-link auth-copy" onClick={() => void copyAddress()}><Copy size={15} /> Copy address</button>
              <p className="auth-feedback" role="status">{copyStatus}</p>
              <p className="auth-panel-copy">Your login stays available for seven days. Connect MetaMask to trade; this account address is only for sign-in.</p>
              <button type="button" className="button button-dark auth-explore" onClick={() => { controller.signOut("You are signed out. Your passkey stays in your password manager."); navigate("/login"); }}><LogOut size={16} /> Sign out</button>
              <Link href="/#the-idea" className="text-link auth-return">Explore Flurbo <ArrowUpRight size={15} /></Link>
            </> : <>
              <p className="auth-panel-copy">{isLogin ? "Confirm with your device's screen lock, fingerprint, or password manager."
                : "Your passkey creates an account address. Keep the passkey available in your password manager so you can return on another device."}</p>
              {!policy.rpId ? <div className="auth-unavailable" role="status"><p>{policy.reason}</p>{localHref && <a className="button button-dark auth-explore" href={localHref}>Continue on localhost <ArrowUpRight size={16} /></a>}</div>
              : <form onSubmit={submit} className="auth-form" aria-busy={state.busy}>
                {!isLogin && <>
                  <label htmlFor="passkey-name">Passkey name</label>
                  <input id="passkey-name" name="passkey-name" type="text" autoComplete="off" maxLength={48} value={name} onChange={event => setName(event.target.value)} disabled={state.busy} aria-describedby="passkey-name-help" />
                  <p id="passkey-name-help" className="auth-help">A label in your password manager, not a public username.</p>
                  {state.remembered && <label className="auth-checkbox"><input type="checkbox" checked={allowNew} onChange={event => setAllowNew(event.target.checked)} disabled={state.busy} /><span>A passkey is remembered here. Create a separate account with a new address.</span></label>}
                </>}
                <button type="submit" className="button button-dark auth-explore" disabled={state.busy || (!isLogin && state.remembered && !allowNew)}>
                  {state.busy ? "Waiting for your passkey..." : isLogin ? "Sign in with a passkey" : "Create a passkey"}
                  {!state.busy && <ArrowUpRight size={17} />}
                </button>
                {isLogin && state.remembered && <button type="button" className="text-link auth-alternative" disabled={state.busy} onClick={() => void authenticate(true)}>Choose another passkey</button>}
                {state.busy && <button type="button" className="text-link auth-alternative" onClick={() => controller.signOut("Sign-in cancelled here. Dismiss any remaining device prompt before trying again.")}>Cancel</button>}
              </form>}
              <p className="auth-help">Your Mera passkey is your Flurbo login. After signing in, connect MetaMask to trade. Mera is for account access only.</p>
              {state.error && <p className="auth-error" role="alert">{state.error}</p>}
              <div className="auth-switch">{isLogin ? "New to Flurbo?" : "Already have a passkey?"} <Link href={isLogin ? "/signup" : "/login"}>{isLogin ? "Create an account" : "Sign in"} <ArrowUpRight size={14} /></Link></div>
            </>}
            {state.notice && <p className="auth-feedback" role="status">{state.notice}</p>}
          </div>
          <p className="auth-footnote">Some devices ask you to confirm twice during setup. A compatible passkey provider is required. <a href="https://mera.category.xyz/authenticator-support/" target="_blank" rel="noreferrer">Check device support</a>.</p>
        </div>
      </div>
    </main>
  );
}
