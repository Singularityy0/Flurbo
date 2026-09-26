import {ArrowUpRight,ArrowRight,Layers,Wallet,ScanLine} from 'lucide-react';
import {useState} from 'react';
import {Link} from 'wouter';
import {useAuth} from '../auth/context';
import './home.css';
import VisitorStatus from './VisitorStatus';

function ConnectionExample(){
  const [answer,setAnswer]=useState<'all'|'yes'|'no'>('all');
  const chance=answer==='yes'?22/30*100:answer==='no'?18/70*100:40;
  return <section className="home-example" aria-label="Illustrative What-if example">
    <div className="home-example-top"><span className="eyebrow">Try a different perspective</span><span className="home-pill">Illustrative</span></div>
    <h2>What if the upgrade<br/><em>goes live?</em></h2>
    <p>Explore how one answer changes the market’s view of another.</p>
    <div className="home-example-questions"><div><span>A / Exchange supports it</span><strong>40%</strong></div><div><span>B / Upgrade goes live</span><strong>30%</strong></div></div>
    <fieldset><legend>Assume the upgrade…</legend><div className="home-segments">{(['all','yes','no'] as const).map(a=><button type="button" key={a} aria-pressed={a===answer} onClick={()=>setAnswer(a)}>{a==='all'?'No assumption':a==='yes'?'Goes live':'Doesn’t go live'}</button>)}</div></fieldset>
    <div className="home-example-result" role="status" aria-live="polite"><span>Chance the exchange supports it</span><strong>{chance.toFixed(answer==='all'?0:1)}<small>%</small></strong><div className="home-example-track" aria-hidden="true"><span style={{width:chance+'%'}}/></div><small>{answer==='yes'?'22 ÷ 30':answer==='no'?'(40 − 22) ÷ (100 − 30)':'Without assuming an answer to B'}</small></div>
    <div className="home-joint"><div><span>Both happen</span><strong>22%</strong></div><div><span>If independent</span><strong>12%</strong></div><span className="home-pill">+10 pp</span></div>
    <p className="home-example-note">Made-up probabilities, not live quotes. A conditional relationship does not establish cause and effect.</p>
  </section>;
}

export default function Home(){
  const {state}=useAuth();
  const destination=state.address?'/access':'/signup';
  return <main id="main" tabIndex={-1} className="home-current">
    <section className="home-hero">
      <div className="home-hero-copy"><span className="home-pill"><i/>Invite-based preview · Monad</span>
        <h1>A view worth<br/><em>combining.</em></h1>
        <p>A prediction market for individual views and connected ideas. Explore how related events are priced together.</p>
        <div className="home-actions"><Link href={destination} className="button button-dark">{state.address?'Your access':'Get early access'}<ArrowUpRight size={18}/></Link><a className="text-link" href="#the-idea">See the connection <ArrowRight size={16}/></a></div>
        <span className="home-hero-note">Monad testnet preview · Test assets only</span>
        <VisitorStatus/>
      </div><ConnectionExample/>
    </section>
    <section className="home-feature-strip" aria-label="Flurbo features"><span><Layers size={18}/> Individual & combined predictions</span><span><ScanLine size={18}/> Read-only What-if exploration</span><span><Wallet size={18}/> One account, all your shares</span></section>
    <section className="home-idea" id="the-idea"><div><span className="eyebrow">One shared market</span><h2>Look beyond<br/><em>one question.</em></h2></div><div><p>Flurbo brings individual and combined predictions into one shared market, letting you see how the market prices relationships between events.</p><p className="home-muted">Buy a single answer, combine outcomes with “all” or “any,” or explore a What-if without placing a trade. Connected pricing adds context. It does not guarantee accuracy.</p><Link href="/docs" className="text-link">Read the guide <ArrowUpRight size={16}/></Link></div></section>
    <section className="home-capabilities"><article><span className="home-feature-number">01 / Predict</span><h3>Your view.<br/>Your combination.</h3><p>Choose Yes or No. Combine up to three supported events from the same pool into one position, with a price and payout rule you can inspect before buying.</p><div className="home-mini-claim"><span>Upgrade goes live <b>Yes</b></span><i>AND</i><span>Exchange supports it <b>Yes</b></span><small>Illustration · pays only when both answers are Yes</small></div></article><article><span className="home-feature-number">02 / Explore</span><h3>Ask a better<br/>“What if?”</h3><p>Compare the chance of two answers together with an independence baseline. Explore conditional probabilities and how a simulated trade changes them.</p><a className="text-link" href="#main">Try the example above <ArrowUpRight size={16}/></a></article><article><span className="home-feature-number">03 / Follow</span><h3>From prediction<br/>to outcome.</h3><p>Each market has its own page, price observations, source rules and settlement timeline. Your portfolio brings shares from your linked trading wallets together.</p><Link href="/portfolio" className="text-link">Your portfolio <ArrowUpRight size={16}/></Link></article></section>
    <section className="home-start" id="how-it-works"><div className="home-section-heading"><div><span className="eyebrow">A simple place to start</span><h2>From invitation to <em>prediction.</em></h2></div><Link href={destination} className="button button-dark">{state.address?'Your access':'Create an account'}<ArrowUpRight size={16}/></Link></div><ol><li><span>01</span><h3>Create your account</h3><p>Create a Mera passkey account and request access when applications open. Approval belongs to your account.</p></li><li><span>02</span><h3>Connect & fund MetaMask</h3><p>Once approved, connect MetaMask and get test AUSD and test MON. Your trading wallet signs every transaction.</p></li><li><span>03</span><h3>Pick your prediction</h3><p>Choose an answer, review the cost and confirm in MetaMask. Follow your shares in Portfolio.</p></li></ol></section>
    <section className="home-faq" id="faq"><div><span className="eyebrow">Before you begin</span><h2>A few things,<br/><em>made clear.</em></h2></div><div>{[
      ['How do I get access?','Create a Mera passkey account. When applications are open, use Request access on your account page and include your public Mera address. Approval is manual; signing up does not automatically grant access.'],
      ['Which assets does this preview use?','Test AUSD and test MON on Monad testnet only. Questions can concern real events or clearly labelled scripted practice scenarios. Check the source and rules on each market.'],
      ['What does a winning share pay?','A winning share pays 1 test AUSD; a losing share pays 0. VOID outcomes follow the published fractional-payout rule, not a refund of your purchase. Payout is not profit: subtract your cost and network fees.'],
      ['Who decides the result?','Each market commits its source rules and deadlines before trading. Answers are proposed with a bond and can be challenged. Current testnet disputes use reviewer wallets controlled by the Flurbo operator. Finalization and delivery must complete before you can collect payouts.'],
      ['Is What-if a prediction I can buy?','What-if is read-only. It shows probabilities implied by the pricing model, including conditional probabilities. Buying a combined AND position is different from trading a conditional. A purchase quote also includes the impact of trade size.'],
      ['What can other people see?','Transactions and wallet positions are visible on-chain.'],
      ['Can I use more than one MetaMask wallet?','Yes. Link each trading wallet to your Mera account with a signature. Your portfolio shows their shares together. Funds and positions stay in the MetaMask wallet that owns them; use that wallet to sell or collect payouts.']
    ].map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
    <section className="home-final"><span className="eyebrow">Separate ideas. Connected possibilities.</span><h2>Put your view<br/><em>to the test.</em></h2><Link href={destination} className="button button-dark">{state.address?'Your access':'Get early access'}<ArrowUpRight size={18}/></Link><p>Monad testnet · Test assets only</p></section>
    <footer className="home-footer"><span className="logo">flurbo<span className="logo-dot"/></span><span>One pool. More possibilities.</span><a href="#faq">Questions? Start here ↗</a></footer>
  </main>;
}
