import { Link } from 'wouter';
import './docs.css';

const sections = [
  ['overview', 'Overview'], ['getting-started', 'Getting started'],
  ['accounts', 'Accounts and wallets'], ['trading', 'Trading and shares'],
  ['combinations', 'Combined predictions'], ['what-if', 'What-if and prices'],
  ['settlement', 'Settlement and payouts'], ['portfolio', 'Portfolio and payouts'],
  ['preview', 'Preview limitations'],
] as const;

export default function Docs() {
  return <main id="main" tabIndex={-1} className="docs-page">
    <header className="docs-hero">
      <p className="docs-eyebrow">FLURBO / DOCUMENTATION</p>
      <h1>Understand the <em>market.</em></h1>
      <p>A guide to accounts, predictions and payouts on Flurbo.</p>
      <span className="docs-badge">Monad testnet · Test assets only</span>
    </header>
    <div className="docs-layout">
      <aside className="docs-sidebar">
        <nav aria-label="Documentation contents">
          <p className="docs-eyebrow">ON THIS PAGE</p>
          {sections.map(([id, label], i) => <a key={id} href={`#${id}`}><span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{label}</a>)}
        </nav>
        <Link href="/markets" className="docs-explore">Explore markets ↗</Link>
      </aside>
      <article className="docs-article">
        <section id="overview" aria-labelledby="overview-title">
          <p className="docs-eyebrow">01 / THE PRODUCT</p>
          <h2 id="overview-title">One shared market. Related predictions.</h2>
          <p>Flurbo brings individual and combined predictions into one shared market, letting you see how the market prices relationships between events.</p>
          <p>Each question has defined outcomes and resolution rules. Related questions can share a pool. You can take a position on one answer or, where supported, combine answers into a single prediction. Separate pools have separate positions and schedules. The Markets page brings their questions together; you do not need to choose a collection.</p>
          <div className="docs-note"><strong>This is a testnet preview.</strong><p>Trading uses test AUSD on Monad testnet. Test MON pays network fees. Practice questions have scripted outcomes; real-event questions use specified external observations. Read the selected market’s rules before trading.</p></div>
        </section>
        <section id="getting-started" aria-labelledby="getting-started-title">
          <p className="docs-eyebrow">02 / YOUR FIRST PREDICTION</p>
          <h2 id="getting-started-title">Getting started</h2>
          <ol className="docs-steps">
            <li><strong>Create your account.</strong> Use a Mera passkey to sign in to Flurbo.</li>
            <li><strong>Request access.</strong> Open your account page and copy your public Mera address into the application form when applications open. The team approves accounts manually. Return to the same account and select Check access after approval.</li>
            <li><strong>Connect MetaMask.</strong> Choose the wallet you want to trade with and complete the account-linking signature when prompted.</li>
            <li><strong>Get test funds.</strong> Open <Link href="/fund">Get test funds</Link> for the available funding options. You need test MON for gas and test AUSD for purchases. Faucet availability and claim limits apply.</li>
            <li><strong>Choose a market.</strong> Check the question, close time and resolution rules. Select your answer and number of shares.</li>
            <li><strong>Review and confirm.</strong> Check the quoted cost and confirm the requested action in MetaMask. A token approval may be required before the purchase.</li>
          </ol>
          <p>The landing page and docs are public. Markets, funding and portfolio require a signed-in, approved Mera account. Creating a passkey does not submit an application. If no application link is available, applications are not open yet.</p>
        </section>
        <section id="accounts" aria-labelledby="accounts-title">
          <p className="docs-eyebrow">03 / IDENTITY AND OWNERSHIP</p>
          <h2 id="accounts-title">One account, your trading wallets</h2>
          <p>Your Mera address identifies your Flurbo account. Your passkey signs you in; MetaMask holds your trading funds and confirms trades. Mera is not used to place trades in the current app.</p>
          <p>You can link multiple MetaMask addresses to your account by proving control of each wallet. Flurbo can then show their shares together in your portfolio. Linking a wallet does not transfer its assets or give another wallet permission to spend them. To sell or collect a payout, use the wallet that owns the relevant shares.</p>
          <p>Access on another device depends on having the same passkey available through your credential provider. A fingerprint or face scan unlocks the credential on your device; it is not your account identifier. Creating a different passkey account can produce a different Flurbo account.</p>
          <p>Never share your wallet seed phrase, private key or passkey recovery credentials.</p>
        </section>
        <section id="trading" aria-labelledby="trading-title">
          <p className="docs-eyebrow">04 / FROM QUOTE TO POSITION</p>
          <h2 id="trading-title">Trading and shares</h2>
          <p>A winning share pays 1 test AUSD at settlement. A losing share pays 0. The amount you pay to buy the share is separate from its eventual payout.</p>
          <div className="docs-example"><span className="docs-eyebrow">ILLUSTRATIVE EXAMPLE</span><p>If 10 shares cost 5.12 test AUSD in total and the prediction wins, their payout is 10 test AUSD. The difference is 4.88 test AUSD before network fees. If the prediction loses, the payout is 0.</p></div>
          <p>The displayed one-share price is a quote for that quantity. A larger purchase can have a different average price because trading changes the pool’s state. Review the total cost, price tolerance and any per-trade limit shown in the ticket. A quote is temporary and does not guarantee execution.</p>
          <p><strong>Approval is not a purchase.</strong> An AUSD approval lets the contract spend the approved amount. The purchase requires its own transaction. Wait for the app’s transaction status before retrying; a pending transaction may still complete after you leave the page.</p>
          <p>You can sell eligible shares while trading is open, subject to a fresh quote and the applicable limits. The sale price can differ from your purchase price. Selling requires the wallet that holds those shares.</p>
        </section>
        <section id="combinations" aria-labelledby="combinations-title">
          <p className="docs-eyebrow">05 / MORE THAN ONE ANSWER</p>
          <h2 id="combinations-title">Combined predictions</h2>
          <p>A combined prediction is one position with a rule covering multiple answers. It is different from purchasing a separate position in each event. The current interface supports combinations of up to three events where the selected pool and ticket allow them. Combinations cannot span different pools.</p>
          <div className="docs-comparison">
            <div><h3>All selected answers (AND)</h3><p>The claim wins only when every selected answer is correct. “A Yes AND B Yes” requires both A and B to resolve Yes.</p></div>
            <div><h3>Any selected answer (OR)</h3><p>Where offered, the claim wins when at least one selected answer is correct. It pays once per share, even if several answers are correct.</p></div>
          </div>
          <p>Individual and combined claims use the same pool. An AND claim may cost less than either individual claim because it requires more conditions to be met. That does not make it a better-value prediction or guarantee a profit.</p>
          <p>Only supported claim shapes can be quoted. Flurbo does not promise a tradable market for every possible combination. Unresolved outcomes follow the VOID rule described below.</p>
        </section>
        <section id="what-if" aria-labelledby="what-if-title">
          <p className="docs-eyebrow">06 / READING RELATIONSHIPS</p>
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
        <section id="settlement" aria-labelledby="settlement-title">
          <p className="docs-eyebrow">07 / FROM OUTCOME TO PAYOUT</p>
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
          <p className="docs-eyebrow">08 / KEEPING TRACK</p>
          <h2 id="portfolio-title">Portfolio and payouts</h2>
          <p>Your <Link href="/portfolio">portfolio</Link> brings together the shares associated with your linked trading wallets under your Flurbo account. Individual and combined positions appear in one holdings table. The Activity tab shows confirmed purchases, sales and collected payouts for those wallets.</p>
          <p>Results and payout collection live in Portfolio. Select an eligible holding, connect its owning MetaMask wallet and confirm the collection. Holdings stay combined under your Mera account; each wallet receives its own payout.</p>
          <p>Activity is indexed in the background. An approval is not a completed purchase. If a transaction is pending, check its confirmation before submitting again. If shares are missing, check that the owning wallet is linked, then refresh.</p>
          <p>The realized PnL chart tracks sale proceeds and collected payouts minus the average purchase cost of those shares, calculated separately for each wallet and position. It excludes open positions, uncollected payouts and test MON gas. A chart appears only when indexed history is complete and reconciles with holdings. Until then, it is unavailable rather than an estimated profit figure.</p>
        </section>
        <section id="preview" aria-labelledby="preview-title">
          <p className="docs-eyebrow">09 / CURRENT SCOPE</p>
          <h2 id="preview-title">Preview limitations</h2>
          <p>Flurbo is available for supervised testnet use. Wallet transactions and positions are public on chain. Account-level organization does not conceal on-chain activity.</p>
          <p>The current preview does not provide an audit assurance or independent adjudication. Automated resolution steps should not be understood as AI judgment. Features and availability differ by market; the published rules and live transaction state govern the selected market.</p>
          <p>Invitations control access to the hosted app. They do not make on-chain contracts permissioned or hide trades. The operator can approve or remove app access; existing on-chain balances and contract rights are not changed by that decision.</p>
          <p>Each market displays its actual schedule. Questions that share an existing pool share its trading close, and payouts wait for all underlying outcomes. Different pools can have different schedules. A new question and deadline must be published before it can appear as a tradable market.</p>
          <p>This guide describes the public product experience. For the exact question, evidence requirements, deadlines and payout conditions, read the rules linked from the individual market.</p>
          <Link href="/markets" className="docs-explore">Explore markets ↗</Link>
        </section>
      </article>
    </div>
    <footer className="docs-footer"><span>One pool. More possibilities.</span><Link href="/">About Flurbo ↗</Link></footer>
  </main>;
}
