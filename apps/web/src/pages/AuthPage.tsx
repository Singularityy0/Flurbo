import { ArrowUpRight, CircleArrowLeft, LockKeyhole } from "lucide-react";
import { Link } from "wouter";
import { Logo } from "../App";

type AuthMode = "login" | "signup";

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const isLogin = mode === "login";
  return (
    <main id="main" tabIndex={-1} className="auth-page section-light">
      <div className="auth-grid">
        <div className="auth-aside">
          <Link href="/" className="auth-back"><CircleArrowLeft size={17} /> Back to flurbo</Link>
          <div className="auth-aside-copy"><span className="eyebrow">{isLogin ? "Welcome back, eventually" : "Make a little room"}</span><h1>{isLogin ? "Sign in when the door is ready." : "Create your place in the picture."}</h1><p>{isLogin ? "We’re shaping the account experience around clarity and control. It isn’t available in this preview yet." : "Accounts are part of the future Flurbo experience. This preview does not create an account."}</p></div>
          <div className="auth-aside-mark"><span className="auth-mark-orbit orbit-one" /><span className="auth-mark-orbit orbit-two" /><span className="auth-mark-core" /></div>
        </div>
        <div className="auth-panel-wrap">
          <div className="auth-panel">
            <div className="auth-panel-brand"><Logo /><span>preview state</span></div>
            <div className="unavailable-icon"><LockKeyhole size={21} strokeWidth={1.6} /></div>
            <p className="eyebrow">Authentication unavailable</p>
            <h2>{isLogin ? "Sign in is not live yet." : "Account creation is not live yet."}</h2>
            <p className="auth-panel-copy">{isLogin ? "Mera passkey authentication is planned for a future release. For now, this screen is here to show the direction. It does not collect credentials." : "We’re not collecting email addresses, passwords, or passkeys here. This screen is a visual preview of the future account path."}</p>
            <div className="honesty-note"><span>No credentials collected. No account created. No fake success.</span></div>
            <Link href="/#the-idea" className="button button-dark auth-explore">Explore how Flurbo works <ArrowUpRight size={17} /></Link>
            <div className="auth-switch">{isLogin ? "New to Flurbo?" : "Looking for sign in?"} <Link href={isLogin ? "/signup" : "/login"}>{isLogin ? "View account preview" : "View sign in preview"} <ArrowUpRight size={14} /></Link></div>
          </div>
          <p className="auth-footnote">This page is intentionally inactive while Flurbo is still in development.</p>
        </div>
      </div>
    </main>
  );
}
