import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import { useReveal } from "../useReveal";

const events = [
  {
    key: "one",
    eyebrow: "event 01",
    title: "The sun sets after 7 pm",
    detail: "a simple yes / no claim",
    tone: "lilac",
  },
  {
    key: "two",
    eyebrow: "event 02",
    title: "The night market opens",
    detail: "another simple yes / no claim",
    tone: "mint",
  },
];

function ConceptCombiner() {
  const [selected, setSelected] = useState<string[]>(["one"]);
  const reducedMotion = useReducedMotion();
  const allSelected = selected.length === events.length;
  const combinedCopy = allSelected
    ? "the sun sets after 7 pm and the night market opens"
    : selected.length === 1
      ? events.find((event) => event.key === selected[0])?.title.toLowerCase() ?? "choose an event"
      : "choose an event to see the combination";

  const toggle = (key: string) => {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  return (
    <div className="concept-stage" aria-label="Illustrative event combination">
      <div className="concept-stage-topline">
        <span className="eyebrow eyebrow-light">Illustrative concept</span>
        <span className="stage-no-price">No executable price</span>
      </div>
      <div className="event-stack">
        {events.map((event, index) => {
          const active = selected.includes(event.key);
          return (
            <button
              key={event.key}
              className={`event-plane ${event.tone} ${active ? "event-plane-active" : ""}`}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(event.key)}
              style={{ zIndex: index + 1 }}
            >
              <span className="event-plane-number">0{index + 1}</span>
              <span className="event-plane-copy">
                <span className="event-plane-eyebrow">{event.eyebrow}</span>
                <strong>{event.title}</strong>
                <small>{event.detail}</small>
              </span>
              <motion.span className={`event-check ${active ? "event-check-active" : ""}`} aria-hidden="true"
                initial={false} animate={{ scale: active && !reducedMotion ? [1, 1.18, 1] : 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.28 }}>
                {active && <Check size={14} strokeWidth={2.5} />}
              </motion.span>
            </button>
          );
        })}
      </div>
      <div className={`combination-result ${allSelected ? "combination-result-active" : ""}`}>
        <span className="result-kicker"><Sparkles size={14} /> together, that reads as</span>
        <div role="status" aria-live="polite" aria-atomic="true">
          <motion.p key={combinedCopy} initial={reducedMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>“{combinedCopy}.”</motion.p>
        </div>
        <div className="result-footer">
          <span>{allSelected ? "one combined prediction" : "select both to combine"}</span>
          <span className="result-arrow" aria-hidden="true">↗</span>
        </div>
      </div>
      <p className="stage-footnote">A visual example for learning only. Flurbo is not live here.</p>
    </div>
  );
}

function WordmarkRule({ children }: { children: React.ReactNode }) {
  return <div className="section-rule"><span>{children}</span><span className="rule-line" /></div>;
}

function Home() {
  const heroReveal = useReveal();
  const howReveal = useReveal();
  const poolReveal = useReveal();
  const faqReveal = useReveal();
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const reducedMotion = useReducedMotion();

  const poolItems = useMemo(() => [
    { label: "one event", angle: "pool-orbit-a" },
    { label: "another event", angle: "pool-orbit-b" },
    { label: "the combination", angle: "pool-orbit-c" },
  ], []);

  return (
    <main id="main" tabIndex={-1}>
      <section className="hero section-light" ref={heroReveal}>
        <div className="hero-grid">
          <div className="hero-copy reveal-item">
            <p className="eyebrow">A new shape for prediction</p>
            <h1>Combine what you know.</h1>
            <p className="hero-lede">Flurbo helps people price connected yes-or-no questions together, so the whole picture can make sense at once.</p>
            <div className="hero-actions">
              <a href="#the-idea" className="button button-dark">See the idea <ArrowDownRight size={17} /></a>
              <a href="#how-it-works" className="text-link">How it works <ArrowUpRight size={15} /></a>
            </div>
            <p className="micro-note"><span className="micro-dot" /> Preview only — no live markets or accounts yet.</p>
          </div>
          <div className="hero-art reveal-item reveal-item-late">
            <ConceptCombiner />
          </div>
        </div>
        <div className="hero-bottomline">
          <span>on-chain combinatorial prediction market maker</span>
          <span className="hero-bottomline-mark">01 / 04</span>
        </div>
      </section>

      <section className="statement-section section-light" id="the-idea">
        <div className="statement-grid">
          <div className="statement-aside"><WordmarkRule>the idea</WordmarkRule><span className="aside-index">01</span></div>
          <div className="statement-copy">
            <h2>Questions rarely live alone.</h2>
            <p>“Will it rain?” and “Will the match sell out?” feel like separate questions — until you realize your answer to one changes how you read the other.</p>
            <p className="serif-emphasis">Flurbo gives connected predictions a shared place to meet.</p>
          </div>
        </div>
      </section>

      <section className="steps-section section-ivory" id="how-it-works" ref={howReveal}>
        <div className="section-wrap reveal-item">
          <div className="section-heading-row">
            <div><p className="eyebrow">A smaller learning curve</p><h2>Three moves, not a maze.</h2></div>
            <p className="section-intro">Start with separate claims. Notice the connection. See how one shared pool can keep the meaning aligned.</p>
          </div>
          <div className="step-list">
            <article className="step-row">
              <span className="step-number">01</span>
              <div className="step-title"><h3>Choose a yes-or-no idea.</h3><p>Something specific enough to answer, simple enough to explain.</p></div>
              <span className="step-mark">/</span>
            </article>
            <article className="step-row">
              <span className="step-number">02</span>
              <div className="step-title"><h3>Spot what belongs together.</h3><p>Flurbo lets related events share a common view of possibility.</p></div>
              <span className="step-mark">+</span>
            </article>
            <article className="step-row">
              <span className="step-number">03</span>
              <div className="step-title"><h3>Read the combination plainly.</h3><p>Understand the cost and the possible payout before anything else.</p></div>
              <span className="step-mark">↗</span>
            </article>
          </div>
        </div>
      </section>

      <section className="pool-section section-forest" ref={poolReveal}>
        <div className="pool-text reveal-item">
          <WordmarkRule>the shared pool</WordmarkRule>
          <h2>One pool.<br /><em>More context.</em></h2>
          <p>Instead of pricing each question in isolation, Flurbo uses one shared liquidity pool to keep related individual and multi-leg claims coherent.</p>
          <p className="pool-disclaimer">The visual is illustrative. It does not show live liquidity, returns, or a functioning market.</p>
        </div>
        <div className="pool-visual reveal-item reveal-item-late" aria-label="Illustrative shared pool diagram">
          <div className="pool-orbits">
            {poolItems.map((item) => <div className={`pool-orbit ${item.angle}`} key={item.label}><span>{item.label}</span></div>)}
            <div className="pool-core"><span>shared</span><strong>pool</strong><small>coherent by design</small></div>
          </div>
          <div className="pool-legend"><span><i className="legend-dot legend-dot-lime" /> individual claim</span><span><i className="legend-dot legend-dot-soft" /> multi-leg claim</span></div>
        </div>
      </section>

      <section className="status-section section-light">
        <div className="status-grid">
          <span className="eyebrow">Where it stands</span>
          <div className="status-copy"><h2>Promising, not pretending.</h2><p>Today, Flurbo is a working concept with restricted supported structures, local synthetic trading, and learning tests. Production deployment, Mera passkey authentication, and tradable conditional securities are still ahead.</p></div>
          <div className="status-stamp"><span className="stamp-dot" /> concept preview<br /><small>last updated · 2026</small></div>
        </div>
      </section>

      <section className="faq-section section-ivory" id="faq" ref={faqReveal}>
        <div className="faq-grid reveal-item">
          <div className="faq-intro"><p className="eyebrow">Questions, answered</p><h2>Keep it clear.</h2><p>Prediction markets can sound more technical than they feel. Here’s the short version.</p></div>
          <div className="faq-list">
            {[
              ["What is Flurbo, in one sentence?", "A shared liquidity pool that prices related individual and multi-leg yes-or-no claims together, so their relationships stay coherent."],
              ["Is Flurbo live?", "No. This is a design preview. Current work uses restricted structures, local synthetic trading, and learning tests rather than live markets."],
              ["What does ‘cost and payout’ mean here?", "Conceptually, the cost is what you pay to take a position; the payout is what the claim could return if it resolves in your favor. A future Flurbo experience would make both visible before you act."],
              ["Can I create an account?", "Not yet. Sign in and create-account routes are honest preview states only: no credentials are collected and no account is created."],
            ].map(([question, answer], index) => {
              const open = activeFaq === index;
              return <div className={`faq-item ${open ? "faq-item-open" : ""}`} key={question}>
                <button id={`faq-trigger-${index}`} type="button" className="faq-trigger" aria-expanded={open}
                  aria-controls={`faq-answer-${index}`} onClick={() => setActiveFaq(open ? null : index)}><span>{question}</span><ChevronDown size={18} /></button>
                <motion.div id={`faq-answer-${index}`} className="faq-answer" role="region"
                  aria-labelledby={`faq-trigger-${index}`} aria-hidden={!open}
                  initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.24, ease: "easeOut" }}><p>{answer}</p></motion.div>
              </div>;
            })}
          </div>
        </div>
      </section>

      <section className="final-cta section-lime">
        <div className="final-cta-shape" aria-hidden="true" />
        <div className="final-cta-inner"><p className="eyebrow">A calmer way to look ahead</p><h2>Make room for<br /><em>the connection.</em></h2><p>Explore the idea now. Accounts will come when the foundations are ready.</p><div className="final-actions"><Link href="/signup" className="button button-dark">Create an account <ArrowUpRight size={17} /></Link><Link href="/login" className="text-link text-link-dark">Sign in <ArrowUpRight size={15} /></Link></div></div>
      </section>

      <footer className="site-footer section-light"><div><span className="footer-brand">flurbo<span className="logo-dot" /></span><p>Prediction, with more context.</p></div><div className="footer-meta"><span>© 2026 Flurbo preview</span><span>Illustrative design · no live market</span></div></footer>
    </main>
  );
}

export default Home;
