import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import Home from "./pages/Home";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";

export const brand = "flurbo";

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`logo ${inverse ? "logo-inverse" : ""}`} aria-label="flurbo home">
      flurbo<span className="logo-dot" aria-hidden="true" />
    </span>
  );
}

function Header() {
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
          <a href="/#how-it-works">How it works</a>
          <a href="/#the-idea">The idea</a>
          <a href="/#faq">FAQ</a>
          <span className="nav-rule" aria-hidden="true" />
          <Link href="/login" className="nav-login">Sign in</Link>
          <Link href="/signup" className="nav-cta">Create an account <ArrowUpRight size={15} strokeWidth={1.8} /></Link>
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

function AuthShell({ mode }: { mode: "login" | "signup" }) {
  return (
    <AppShell>
      <AuthPage mode={mode} />
    </AppShell>
  );
}

export default function App() {
  const [location] = useLocation();
  const previousLocation = useRef(location);
  useEffect(() => {
    document.title = location === "/login" ? "Sign in preview | flurbo"
      : location === "/signup" ? "Account preview | flurbo"
      : location === "/" ? "flurbo | combine what you know" : "Page not found | flurbo";
    const changed = previousLocation.current !== location;
    previousLocation.current = location;
    const frame = requestAnimationFrame(() => {
      const anchor = document.getElementById(window.location.hash.slice(1));
      if (anchor) anchor.scrollIntoView();
      else if (changed) window.scrollTo({ top: 0, behavior: "instant" });
      if (changed) document.getElementById("main")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location]);
  return (
    <Switch>
      <Route path="/" component={() => <AppShell><Home /></AppShell>} />
      <Route path="/login" component={() => <AuthShell mode="login" />} />
      <Route path="/signup" component={() => <AuthShell mode="signup" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

export { Logo };
