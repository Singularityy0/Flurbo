import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import Home from "./pages/Home";
import Docs from './pages/Docs';
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";
import { useAuth } from "./auth/context";
import Workspace from './pages/Workspace';
import Markets from './pages/Markets';
import EvidenceReview from './pages/EvidenceReview';
import FundingPage from './pages/FundingPage';
import {useTestingAccess} from './auth/testing-access';
import {usePreviewAccess} from './auth/preview-access';
import AccessPage from './pages/AccessPage';

export const brand = "flurbo";

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`logo ${inverse ? "logo-inverse" : ""}`} aria-label="flurbo home">
      flurbo<span className="logo-dot" aria-hidden="true" />
    </span>
  );
}

function Header() {
  const { state } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const isHome = location === "/";

  useEffect(() => setOpen(false), [location]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false);
    };
    // This is a non-modal disclosure; normal tab order stays available.
    header.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <header ref={header} className={`site-header ${isHome ? "site-header-home" : "site-header-subpage"}`}>
      <div className="header-inner">
        <Link href="/" className="brand-link" aria-label="Flurbo home">
          <Logo />
        </Link>
        <nav id="main-nav" className={`main-nav ${open ? "main-nav-open" : ""}`} aria-label="Main navigation"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}>
          {state.address ? <><Link href="/markets">Markets</Link><Link href="/portfolio">Portfolio</Link><Link href="/access">Your account</Link></> : <><a href="/#how-it-works">How it works</a><a href="/#the-idea">The idea</a></>}
          <Link href="/docs" aria-current={location === '/docs' ? 'page' : undefined}>Docs</Link>
          <span className="nav-rule" aria-hidden="true" />
          {state.address ? (isHome ? <Link href="/markets" className="nav-cta">Explore markets <ArrowUpRight size={15} strokeWidth={1.8} /></Link> : <Link href="/" className="nav-login">About Flurbo</Link>) : <>
            <Link href="/login" className="nav-login">Sign in</Link>
            <Link href="/signup" className="nav-cta">Get early access <ArrowUpRight size={15} strokeWidth={1.8} /></Link>
          </>}
        </nav>
        <button ref={menuButton} className="mobile-menu" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-controls="main-nav" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      {children}
    </div>
  );
}

function AuthShell({ mode }: { mode: "login" | "signup" | "account" }) {
  return (
    <AppShell>
      <AuthPage mode={mode} />
    </AppShell>
  );
}

function AccountRoute() {
  const preview = usePreviewAccess();
  const testingAccess = useTestingAccess();
  const [location] = useLocation();
  const { controller, state } = useAuth();
  const [, navigate] = useLocation();
  const authenticated = !!state.address && state.expiresAt !== null && state.expiresAt > Date.now();

  useEffect(() => {
    if (!state.restoring && !authenticated) navigate('/login', { replace: true });
  }, [state.restoring, authenticated, navigate]);

  useEffect(() => {
    if (!authenticated || state.expiresAt === null) return;
    const timer = setTimeout(controller.checkExpiry, Math.max(0, state.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [controller, authenticated, state.expiresAt]);

  // Do not mount the market, its data requests or wallet listeners until the
  // server-backed login has been restored. Remembered addresses are not login.
  return <AppShell>{state.restoring
    ? <main id="main" tabIndex={-1} className="auth-page"><p role="status">Checking your session...</p></main>
    : authenticated ? ((!preview.access?.approved || location==='/access')?<AccessPage {...preview}/>:location==='/fund'?<FundingPage/>:['/account','/kuru','/events','/rehearsal','/evidence'].includes(location)&&!testingAccess?<main id="main" className="auth-page"><h1>Operator access only</h1><Link href="/markets">Back to markets</Link></main>:location==='/evidence'?<EvidenceReview/>:(location.startsWith('/markets/')||['/markets','/portfolio'].includes(location)) ? <Markets /> : <Workspace />) : null}</AppShell>;
}

export default function App() {
  const [location] = useLocation();
  const previousLocation = useRef(location);
  useEffect(() => {
    document.title = location === "/login" ? "Sign in | flurbo"
      : location === "/signup" ? "Create an account | flurbo"
      : location.startsWith("/markets") ? "Markets | flurbo"
      : location === "/access" ? "Your access | flurbo"
      : location === "/fund" ? "Get test funds | flurbo"
      : location === "/docs" ? "Documentation | flurbo"
      : location === "/account" ? "Your account | flurbo"
      : location === "/portfolio" ? "Your portfolio | flurbo"
      : location === "/kuru" ? "Kuru order book | flurbo"
      : location === "/events" ? "Real events | flurbo"
      : location === "/evidence" ? "Evidence review | flurbo"
      : location === "/rehearsal" ? "Testnet rehearsal | flurbo"
      : location === "/" ? "flurbo | combine what you know" : "Page not found | flurbo";
    const changed = previousLocation.current !== location;
    previousLocation.current = location;
    const frame = requestAnimationFrame(() => {
      const anchor = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (anchor) anchor.scrollIntoView();
      else if (changed) window.scrollTo({ top: 0, behavior: "instant" });
      if (changed) document.getElementById("main")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location]);
  return (
    <Switch>
      <Route path="/" component={() => <AppShell><Home /></AppShell>} />
      <Route path="/docs" component={() => <AppShell><Docs /></AppShell>} />
      <Route path="/login" component={() => <AuthShell mode="login" />} />
      <Route path="/signup" component={() => <AuthShell mode="signup" />} />
      <Route path="/markets" component={AccountRoute} />
      <Route path="/markets/:collection/:event" component={AccountRoute} />
      <Route path="/fund" component={AccountRoute} />
      <Route path="/access" component={AccountRoute} />
      <Route path="/account" component={AccountRoute} />
      <Route path="/portfolio" component={AccountRoute} />
      <Route path="/history"><Redirect to="/portfolio" replace /></Route>
      <Route path="/kuru" component={AccountRoute} />
      <Route path="/events" component={AccountRoute} />
      <Route path="/rehearsal" component={AccountRoute} />
      <Route path="/evidence" component={AccountRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

export { Logo };
