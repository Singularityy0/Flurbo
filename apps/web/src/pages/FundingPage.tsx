import {Link} from 'wouter';
import Funding from './Funding';
import './markets.css';
import './funding.css';

export default function FundingPage() {
  return <main id="main" className="markets-page funding-page" tabIndex={-1}>
    <Link href="/markets" className="text-link">← Back to markets</Link>
    <header className="market-heading"><span className="eyebrow">Practice on Monad testnet</span><h1>A little fuel<br/>for your <em>predictions.</em></h1><p>Get free test tokens in MetaMask. No real money needed.</p></header>
    <Funding expanded/>
  </main>;
}
