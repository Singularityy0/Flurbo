import { ArrowDownRight, ArrowUpRight, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
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
  const [selected, setSelected] = useState<string[]>(events.map((event) => event.key));
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
        <div role="status" aria-live="polite" aria-atomic="true">
          <span className="result-kicker">{allSelected ? "Together, that reads as" : selected.length ? "Your selected event" : "No events selected"}</span>
          <motion.p key={combinedCopy} initial={reducedMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2 }}>“{combinedCopy}.”</motion.p>
        </div>
        <div className="result-footer">
          <span>{allSelected ? "2 events selected · one combined prediction" : `${selected.length} of 2 selected · select both to combine`}</span>
          <ArrowUpRight size={19} aria-hidden="true" />
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

  const poolItems = [
    { label: "one event", radius: 165, angle: -75, tone: "individual", dx: 14, dy: 0, anchor: "start" },
    { label: "another event", radius: 200, angle: -35, tone: "individual", dx: -12, dy: -18, anchor: "end" },
    { label: "the combination", radius: 240, angle: 205, tone: "combined", dx: 10, dy: 28, anchor: "start" },
  ] as const;

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
            <p className="micro-note"><span className="micro-dot" /> Preview only. Live markets are not available yet.</p>
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
            <p>“Will it rain?” and “Will the match sell out?” feel like separate questions, until you realize your answer to one changes how you read the other.</p>
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
              <ArrowUpRight className="step-mark" size={30} aria-hidden="true" />
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
        <div className="pool-visual reveal-item reveal-item-late" role="img" aria-label="Illustrative shared pool diagram: two individual claims and their combination share one pool.">
          <div className="pool-orbits">
            <svg className="pool-orbit-diagram" viewBox="0 0 500 500" aria-hidden="true">
              {poolItems.map((item) => {
                // A marker and its ring share the same center and radius at every viewport size.
                const radians = item.angle * Math.PI / 180;
                const x = 250 + item.radius * Math.cos(radians);
                const y = 250 + item.radius * Math.sin(radians);
                return <g className={`pool-orbit pool-orbit-${item.tone}`} key={item.label}>
                  <circle className="orbit-ring" cx={250} cy={250} r={item.radius} />
                  <circle className="orbit-halo" cx={x} cy={y} r={9} />
                  <circle className="orbit-marker" cx={x} cy={y} r={4} />
                  <text x={x + item.dx} y={y + item.dy} textAnchor={item.anchor}>{item.label}</text>
                </g>;
              })}
            </svg>
            <div className="pool-core"><span>shared</span><strong>pool</strong><small>coherent by design</small></div>
          </div>
          <div className="pool-legend"><span><i className="legend-dot legend-dot-lime" /> individual claim</span><span><i className="legend-dot legend-dot-soft" /> multi-leg claim</span></div>
        </div>
      </section>

      <section className="status-section section-light">
        <div className="status-grid">
          <span className="eyebrow">Where it stands</span>
          <div className="status-copy"><h2>Built for Monad.</h2><p>Flurbo brings individual and combined predictions into one shared pool on Monad. The consumer demo uses scripted practice events and test AUSD. What-if explores pricing without placing a trade. Native mobile acceptance and tradable conditional positions remain unfinished.</p></div>
          <div className="status-stamp"><span className="stamp-dot" /> testnet beta<br /><small>last updated · 2026</small></div>
        </div>
      </section>

      <section className="faq-section section-ivory" id="faq" ref={faqReveal}>
        <div className="faq-grid reveal-item">
          <div className="faq-intro"><p className="eyebrow">Questions, answered</p><h2>Keep it clear.</h2><p>Prediction markets can sound more technical than they feel. Here’s the short version.</p></div>
          <div className="faq-list">
            {[
              ["What is Flurbo, in one sentence?", "A shared liquidity pool that prices related individual and multi-leg yes-or-no claims together, so their relationships stay coherent."],
              ["Is Flurbo live?", "Flurbo is available for practice on Monad testnet. Sign in to explore the markets, trade with test AUSD and view your holdings. Practice outcomes are scripted, and trading stops at the published closing time."],
              ["What does ‘cost and payout’ mean here?", "Cost is the test AUSD you pay for your shares. A winning share pays 1 test AUSD and a losing share pays 0. Unresolved outcomes follow the published VOID rules and can pay a fraction. Payout is the total returned, not profit: subtract your purchase cost and network fees. What-if probabilities are not purchase quotes."],
              ["Can I create an account?", "Create your Flurbo account with a Mera passkey. After signing in, trade with your Mera wallet or connect MetaMask. You can send available AUSD from Mera to a MetaMask address on the same Monad network. Localhost passkeys belong to the development site."],
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
        <div className="final-cta-inner"><p className="eyebrow">A calmer way to look ahead</p><h2>Make room for<br /><em>the connection.</em></h2><p>Start with a Mera passkey. Trade with Mera or connect your wallet.</p><div className="final-actions"><Link href="/signup" className="button button-dark">Create an account <ArrowUpRight size={17} /></Link><Link href="/login" className="text-link text-link-dark">Sign in <ArrowUpRight size={15} /></Link></div></div>
      </section>

      <footer className="site-footer section-light"><div><span className="footer-brand">flurbo<span className="logo-dot" /></span><p>Prediction, with more context.</p></div><div className="footer-meta"><span>© 2026 Flurbo</span><span>Monad testnet · synthetic events</span></div></footer>
    </main>
  );
}

export default Home;
