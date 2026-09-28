import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight, FileText } from 'lucide-react';
import { useAuth } from '../auth/context';
import { LITEPAPER } from '../components/SiteFooter';
import './docs.css';

const sections = [
  ['overview', 'Overview'], ['getting-started', 'Getting started'], ['application-data','Application data'],
  ['accounts', 'Accounts and wallets'], ['trading', 'Trading and shares'],
  ['combinations', 'Combined predictions'], ['what-if', 'What-if and prices'], ['thesis', 'Build your thesis'],
  ['settlement', 'Settlement and payouts'], ['portfolio', 'Portfolio and payouts'],
  ['agents', 'Agents and SDKs'], ['help', 'Common questions'], ['preview', 'Preview limitations'],
] as const;

export default function Docs() {
  const { state } = useAuth();
  const [active, setActive] = useState<string>(sections[0][0]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-110px 0px -60% 0px' });
    sections.forEach(([id]) => { const node = document.getElementById(id); if (node) observer.observe(node); });
    return () => observer.disconnect();
  }, []);
  const explore = state.address
    ? <Link href="/markets" className="btn btn-primary docs-explore">Explore markets <ArrowUpRight size={16} strokeWidth={1.75} /></Link>
    : <Link href="/signup" className="btn btn-primary docs-explore">Get early access <ArrowUpRight size={16} strokeWidth={1.75} /></Link>;
  return <main id="main" tabIndex={-1} className="docs-page page">
    <header className="docs-hero">
      <h1>Understand the <span className="serif-accent">market.</span></h1>
      <p className="lead">A guide to accounts, predictions and payouts on Flurbo.</p>
      <a className="docs-litepaper" href={LITEPAPER.href} type="application/pdf"><FileText size={18} strokeWidth={1.75} /><span>{LITEPAPER.label}</span><small>{LITEPAPER.detail}</small></a>
    </header>
    <nav className="docs-quickstart" aria-label="Choose a guide"><a href="#getting-started"><strong>Make your first prediction</strong><small>Account, invitation, test funds and MetaMask.</small></a><a href="#combinations"><strong>Combine your ideas</strong><small>Understand when AND, OR and other choices pay.</small></a><a href="#agents"><strong>Build an agent</strong><small>Developer setup in TypeScript, Python, Rust or C++.</small></a></nav>
    <div className="docs-layout">
      <aside className="docs-sidebar">
        <nav aria-label="Documentation contents">
          <p className="docs-contents-title">On this page</p>
          {sections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined}>{label}</a>)}
        </nav>
        {explore}
      </aside>
      <article className="docs-article">
        <section id="overview" aria-labelledby="overview-title">
          <h2 id="overview-title">One shared market. Related predictions.</h2>
          <p>Flurbo brings individual and combined predictions into one shared market, letting you see how the market prices relationships between events.</p>
          <p>Each question has defined outcomes and resolution rules. Related questions can share a pool. You can take a position on one answer or, where supported, combine answers into a single prediction. Separate pools have separate positions and schedules. The Markets page brings their questions together; you do not need to choose a collection.</p>
          <div className="docs-note"><strong>This is a testnet preview.</strong><p>Trading uses test AUSD on Monad testnet. Test MON pays network fees. Practice questions have scripted outcomes; real-event questions use specified external observations. Read the selected market’s rules before trading.</p></div>
        </section>
        <section id="getting-started" aria-labelledby="getting-started-title">
          <h2 id="getting-started-title">Getting started</h2>
          <ol className="docs-steps">
            <li><strong>Create your account.</strong> Use a Mera passkey to sign in to Flurbo.</li>
            <li><strong>Request access.</strong> Open Your account when applications are available. The native form captures your signed-in Mera account automatically. Enter your email and verify the code sent to it. The team reviews applications manually. Email verification is not approval or a new sign-in method.</li>
            <li><strong>Link MetaMask once.</strong> Choose the wallet you want to trade with and sign the account-linking message. Its shares, trades and collected payouts stay in your Mera account's portfolio across devices, even when MetaMask is disconnected. Funds remain in the trading wallet.</li>
            <li><strong>Return or switch wallets.</strong> Flurbo restores an already linked wallet when MetaMask still authorizes this site. Manage wallets from Your account, or switch on a trade. A new wallet needs its own linking signature. Unlocking MetaMask or reconnecting after permission is revoked can still require your approval.</li>
            <li><strong>Get test funds.</strong> Open <Link href="/fund">Get test funds</Link> for the available funding options. You need test MON for gas and test AUSD for purchases. Faucet availability and claim limits apply.</li>
            <li><strong>Choose a market.</strong> Check the question, close time and resolution rules. Select your answer and number of shares.</li>
            <li><strong>Review and confirm.</strong> Check the quoted cost and confirm the requested action in MetaMask. A token approval may be required before the purchase.</li>
          </ol>
          <p>The landing page and docs are public. Markets, funding and portfolio require a signed-in, approved Mera account. Creating a passkey does not submit an application. Your account page shows whether applications are available, pending or approved.</p>
        </section>
        <section id="application-data" aria-labelledby="application-data-title"><h2 id="application-data-title">Your application data</h2><p>When you request access, Flurbo stores your contact email, Mera account address, verification state and application decision in a separate application database. Your email is used for verification and access updates, not marketing. Supabase provides application storage and Resend delivers these emails.</p><p>You can withdraw an unapproved application from Your account to remove its contact email. Approval records and account identifiers remain to enforce access decisions; withdrawing does not erase blockchain activity or change your passkey. Contact the Flurbo team through the channel where you received your invitation for other deletion requests. Email verification never recovers a lost passkey or grants control of a trading wallet.</p></section>
        <section id="accounts" aria-labelledby="accounts-title">
          <h2 id="accounts-title">One account, your trading wallets</h2>
          <p>Your Mera address identifies your Flurbo account. Your passkey signs you in; MetaMask holds your trading funds and confirms trades. Mera is not used to place trades in the current app.</p>
          <p>You can link multiple MetaMask addresses to your account by proving control of each wallet. Flurbo can then show their shares together in your portfolio. Linking a wallet does not transfer its assets or give another wallet permission to spend them. To sell or collect a payout, use the wallet that owns the relevant shares.</p>
          <p>Access on another device depends on having the same passkey available through your credential provider. A fingerprint or face scan unlocks the credential on your device; it is not your account identifier. Creating a different passkey account can produce a different Flurbo account.</p>
          <p>Never share your wallet seed phrase, private key or passkey recovery credentials.</p>
        </section>
        <section id="trading" aria-labelledby="trading-title">
          <h2 id="trading-title">Trading and shares</h2>
          <p>A winning share pays 1 test AUSD at settlement. A losing share pays 0. The amount you pay to buy the share is separate from its eventual payout.</p>
          <div className="docs-example"><span className="docs-example-label">Illustrative example</span><p>If 10 shares cost 5.12 test AUSD in total and the prediction wins, their payout is 10 test AUSD. The difference is 4.88 test AUSD before network fees. If the prediction loses, the payout is 0.</p></div>
          <p>The displayed one-share price is a quote for that quantity. A larger purchase can have a different average price because trading changes the pool’s state. Review the total cost, price tolerance and any per-trade limit shown in the ticket. A quote is temporary and does not guarantee execution.</p>
          <p><strong>Approval is not a purchase.</strong> An AUSD approval lets the contract spend the approved amount. The purchase requires its own transaction. Wait for the app’s transaction status before retrying; a pending transaction may still complete after you leave the page.</p>
          <p>You can sell eligible shares while trading is open, subject to a fresh quote and the applicable limits. The sale price can differ from your purchase price. Selling requires the wallet that holds those shares.</p>
        </section>
        <section id="combinations" aria-labelledby="combinations-title">
          <h2 id="combinations-title">Combined predictions</h2>
          <p>A combined prediction is one position with a rule covering multiple answers. It is different from purchasing a separate position in each event. The current interface supports combinations of up to three events where the selected pool and ticket allow them. Combinations cannot span different pools.</p>
          <div className="docs-comparison">
            <div><h3>All selected answers (AND)</h3><p>The claim wins only when every selected answer is correct. “A Yes AND B Yes” requires both A and B to resolve Yes.</p></div>
            <div><h3>Any selected answer (OR)</h3><p>The claim wins when at least one selected answer is correct, including when all are correct. It pays once per share, even if several answers are correct.</p></div>
            <div><h3>Exactly one</h3><p>The claim wins when exactly one of your selected answers is correct. For three answers, all three matching is a loss. This is not an odd-parity rule.</p></div>
            <div><h3>At least two</h3><p>The claim wins when two or more of your selected answers are correct. With two questions, this has the same winning outcomes as All.</p></div>
          </div>
          <p>Individual and combined claims use the same pool. An AND claim may cost less than either individual claim because it requires more conditions to be met. That does not make it a better-value prediction or guarantee a profit.</p>
          <p>The ticket shows the selected answers, winning outcomes and an optional comparison with independence. This comparison evaluates your exact rule against a baseline that multiplies the individual event probabilities. It is a model-implied probability, not a purchase quote, causal relationship or recommendation. The trade quote includes size impact and is checked separately. A supported rule can still be unavailable if the pool’s graph or trade limits prevent quoting it.</p>
          <p>Only supported claim shapes can be quoted. Flurbo does not promise a tradable market for every possible combination. Unresolved outcomes follow the VOID rule described below.</p>
        </section>
        <section id="what-if" aria-labelledby="what-if-title">
          <h2 id="what-if-title">What-if and prices</h2>
          <p>The What-if panel is a read-only view of the pool’s current pricing model. It compares the market-implied chance of one answer with the chance under an assumption about another answer. It does not place a trade or create a conditional position.</p>
          <dl className="docs-definitions">
            <div><dt>Marginal</dt><dd>The model’s chance of one event, without fixing another answer.</dd></div>
            <div><dt>Joint</dt><dd>The model’s chance of two specified answers happening together.</dd></div>
            <div><dt>Conditional</dt><dd>The model’s chance of one answer assuming another. For example, P(A given B) = P(A and B) / P(B), when P(B) is nonzero.</dd></div>
            <div><dt>Independence comparison</dt><dd>The joint value is compared with P(A) × P(B), a baseline that assumes independence. The difference is shown in percentage points.</dd></div>
          </dl>
          <p>Price sensitivity simulates a specified trade and shows how the displayed values would change under that scenario. It is not a measure of reliability or a forecast of what traders will do.</p>
          <p>These values reflect the pool’s state, not independently verified probabilities. Mathematical consistency does not establish accuracy, and conditional relationships do not establish causation. Price history charts show sampled quotes; gaps indicate missing observations rather than a complete trading record.</p>
        </section>
        <section id="thesis" aria-labelledby="thesis-title">
          <h2 id="thesis-title">Build your thesis</h2>
          <p>Open a market and choose Explore your view to compare two questions from its shared pool. Enter the chance of A being Yes, the chance of B being Yes if A is Yes, and the chance of B being Yes if A is No. All three estimates are needed for a complete forecast.</p>
          <p>The explorer compares individual, AND, OR and exactly-one claims at equal share counts. It shows your probabilities alongside the pool's estimates, current buy quotes, and the payout in each scenario. Your expected net uses your own estimates, excludes gas and assumes binary outcomes. It is not a recommendation or guaranteed profit. VOID payouts are shown separately.</p>
          <p>An AND claim is not a conditional contract: if either selected answer fails, it pays zero rather than refunding your purchase. Pool relationships do not establish causation. Estimates and optional reasoning notes stay in the page's memory and are lost when you leave.</p>
          <p>Review this prediction carries only the selected claim into the existing trade ticket. A fresh quote, linked MetaMask wallet and wallet confirmation are still required. Closed markets remain available for exploration, but cannot be traded.</p>
        </section>
        <section id="settlement" aria-labelledby="settlement-title">
          <h2 id="settlement-title">Settlement and payouts</h2>
          <p>Trading closes at the time specified by the market. Resolution follows the observation window and the pool’s published deadlines. A closed market is not necessarily settled.</p>
          <ol className="docs-steps">
            <li><strong>An answer is proposed.</strong> After the observation window, an asserter can post Yes, No or VOID with a test AUSD bond and an evidence reference.</li>
            <li><strong>The answer can be challenged.</strong> A challenge within the deadline sends the disputed outcome to the configured reviewer panel. Current testnet panels use operator-controlled wallets and a two-vote quorum.</li>
            <li><strong>The outcome is finalized.</strong> An uncontested answer can finalize after its challenge window. A missing assertion or a dispute that times out without the required votes follows the resolver’s VOID path.</li>
            <li><strong>Results reach the pool.</strong> Once all underlying events in the same pool are finalized, their outcomes are delivered to the pool. Individual and combined payouts follow from those answers.</li>
            <li><strong>You collect the payout.</strong> Eligible shares can be redeemed using their owning MetaMask wallet. Settlement does not automatically send winnings to every holder. Redemption requires a transaction and test MON for gas.</li>
          </ol>
          <h3>What happens with VOID?</h3>
          <p>VOID is an unresolved outcome, not No and not a refund of the purchase price. The payout averages the claim’s winning value over possible Yes and No answers for the unresolved events. An individual VOID share pays 0.5 test AUSD. An AND claim with one confirmed Yes and one VOID pays 0.5; with two VOID events it pays 0.25; with a confirmed losing condition it pays 0.</p>
          <div className="docs-note"><strong>Resolution has trust and timing limits.</strong><p>A wrong uncontested assertion can finalize. Background automation assists eligible steps, but does not guarantee correct evidence or timely execution. Disputes, source availability and network failures can delay settlement. Use the market’s current status and rules, rather than treating an estimated result time as a guarantee.</p></div>
        </section>
        <section id="portfolio" aria-labelledby="portfolio-title">
          <h2 id="portfolio-title">Portfolio and payouts</h2>
          <p>Your <Link href="/portfolio">portfolio</Link> brings together the shares associated with your linked trading wallets under your Flurbo account. Individual and combined positions appear in one holdings table. The Activity tab shows confirmed purchases, sales and collected payouts for those wallets. Collected lists the amount received and the transaction even after the redeemed shares leave your holdings. Payouts collected is money received, not profit.</p>
          <p>Results and payout collection live in Portfolio. Select an eligible holding, connect its owning MetaMask wallet and confirm the collection. Holdings stay combined under your Mera account; each wallet receives its own payout.</p>
          <p>Activity is indexed in the background. An approval is not a completed purchase. If a transaction is pending, check its confirmation before submitting again. If shares are missing, check that the owning wallet is linked, then refresh.</p>
          <p>Associated agent wallet positions appear alongside your manual trades. Verified agent trades carry a Via agent-name label. Agent payouts are collected through the agent's owning wallet and runtime.</p>
          <p>The Performance tab’s realized PnL chart tracks sale proceeds and collected payouts minus the average purchase cost of those shares, calculated separately for each wallet and position. It excludes open positions, uncollected payouts and test MON gas. A chart appears only when indexed history is complete and reconciles with holdings. Until then, it is unavailable rather than an estimated profit figure.</p>
        </section>
        <section id="agents" aria-labelledby="agents-title">
          <h2 id="agents-title">Build and run your own agent</h2>
          <p>Agents are for users comfortable running software on their own computer or server. Flurbo provides SDKs in TypeScript, Python, Rust and C++. Registering an agent does not start or host it.</p>
          <ol className="docs-steps">
            <li><strong>Register.</strong> Open <Link href="/agents">Agents</Link>, give your agent a name and choose open related markets. Market permissions apply to their shared pool; configure your strategy to select individual questions or combinations.</li>
            <li><strong>Associate a dedicated wallet.</strong> In Setup, enter its public address and sign the ownership message locally. Keep its private key on your machine. Do not use your personal, manual-trading or operator wallets.</li>
            <li><strong>Create an API credential.</strong> Copy the token when it is shown and store it in the runtime environment. It allows API access, not wallet signing. Never include the token or private key in a shared script or model prompt.</li>
            <li><strong>Run in paper mode.</strong> Choose your language in Setup, install its dependencies and configure your model provider, strategy and spending limits. Paper decisions simulate trades without moving funds. Check connection status and Activity before continuing.</li>
            <li><strong>Enable live testnet trading deliberately.</strong> Fund the dedicated wallet with a small amount of test AUSD and MON. Live mode must be enabled both in the runtime configuration and in Flurbo Settings. Purchases still depend on valid quotes and the runtime's checks.</li>
          </ol>
          <p>The Overview shows the latest heartbeat and verified trades. Activity shows reported decisions. Setup holds wallet association, credentials and language instructions. Settings holds limits, pause and archive controls.</p>
          <details><summary>Developer SDK reference and custom strategies</summary><p>You can write your own script or strategy with the SDK. Follow the language's reference for configuration, execution and recovery. Custom software must preserve those checks.</p><ul>{[['sdk','TypeScript'],['sdk-python','Python'],['sdk-rust','Rust'],['sdk-cpp','C++']].map(([path,label])=><li key={path}><a href={`https://github.com/Singularityy0/Flurbo/tree/main/packages/${path}`} target="_blank" rel="noreferrer">{label} SDK and examples <ArrowUpRight size={14} strokeWidth={1.75} /></a></li>)}</ul></details>
          <details><summary>Stopping an agent and recovering a transaction</summary><p>Closing the browser does not stop the runtime. Stop it on the machine where it runs. A pause on Flurbo is a software instruction; a previously sent transaction may still confirm. Preserve the runtime's journal and restart with the same configuration to recover pending transactions without sending duplicates.</p><p>A revoked credential stops a compliant runtime from starting new work. It does not revoke the wallet's on-chain permissions or private key. A stale heartbeat is a last-known report, not proof that the runtime has stopped.</p></details>
          <p>The optional assisted feature is different: you enter forecasts yourself and either record paper decisions or confirm proposed trades in MetaMask. It does not run an autonomous agent.</p>
        </section>
        <section id="help" aria-labelledby="help-title">
          <h2 id="help-title">Common questions</h2>
          <details><summary>I created an account. Why can't I enter the markets?</summary><p>Account creation and invitation approval are separate. Your account page shows approval status. The request-access method is still being prepared when no application link is configured; the placeholder does not submit anything.</p></details>
          <details><summary>I approved a payment. Where are my shares?</summary><p>Token approval grants spending permission. A separate purchase transaction buys the shares. Follow the ticket's next step and wait for confirmation. If a transaction is already pending, check it instead of submitting again.</p></details>
          <details><summary>Trading closed. Can I collect a payout?</summary><p>A closed market may still be settling. Once results are delivered, Portfolio shows eligible payouts and the collect action. Collection sends funds to the wallet that owns the shares. Agent wallets collect through their runtime.</p></details>
          <details><summary>Why is profit / loss still loading?</summary><p>Collected payouts and current holdings can appear before complete purchase history. The profit / loss chart waits for verified cost basis. Background history checks are bounded; Retry activity continues them if needed. A payout total is not a profit total.</p></details>
        </section>
        <section id="preview" aria-labelledby="preview-title">
          <h2 id="preview-title">Preview limitations</h2>
          <p>Flurbo is available for supervised testnet use. Wallet transactions and positions are public on chain. Account-level organization does not conceal on-chain activity.</p>
          <p>The current preview does not provide an audit assurance or independent adjudication. Automated resolution steps should not be understood as AI judgment. Features and availability differ by market; the published rules and live transaction state govern the selected market.</p>
          <p>Invitations control access to the hosted app. They do not make on-chain contracts permissioned or hide trades. The operator can approve or remove app access; existing on-chain balances and contract rights are not changed by that decision.</p>
          <p>Each market displays its actual schedule. Questions that share an existing pool share its trading close, and payouts wait for all underlying outcomes. Different pools can have different schedules. A new question and deadline must be published before it can appear as a tradable market.</p>
          <p>This guide describes the public product experience. For the exact question, evidence requirements, deadlines and payout conditions, read the rules linked from the individual market.</p>
          {explore}
        </section>
      </article>
    </div>
  </main>;
}
