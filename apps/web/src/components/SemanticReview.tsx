import { formatUnits } from 'viem';
import { semanticAcknowledgment, type PilotReview } from '../pilot';

export function SemanticReview({review,phrase,onChange}:{review:PilotReview;phrase:string;onChange:(value:string)=>void}) {
  if(review.requested.action!=='buy')return null;
  const result=review.semanticAssessment;
  if(!result)return <p role="status">Outcome compatibility will be checked before confirmation.</p>;
  if(result.status!=='collision')return <p className="market-caption">{result.coverage==='complete'?'No conflict found in the configured outcome rules.':'These outcomes have not been verified as compatible.'}</p>;
  return <section className="ticket-review" aria-label="Outcome conflict">
    <h3>These outcomes cannot win together</h3>
    <p>Under the configured rules, this purchase pays 0 test AUSD when all events resolve Yes or No. The purchase cost is lost in those outcomes, plus network fees.</p>
    {review.quotedCostAtoms&&<p>At this quote: spend {formatUnits(BigInt(review.quotedCostAtoms),6)}, receive 0, lose {formatUnits(BigInt(review.quotedCostAtoms),6)} test AUSD before fees. The final purchase cost can change within your displayed spending limit.</p>}
    <p>VOID settlement is different. Its maximum payout for this quantity is {formatUnits(BigInt(result.maximumVoidPayoutAtoms),6)} test AUSD under the existing contract rules. This is not a prediction of a VOID result.</p>
    <p>Automated purchases are blocked. To proceed manually, type the following acknowledgment.</p>
    <label>{semanticAcknowledgment}<input autoComplete="off" value={phrase} onChange={e=>onChange(e.target.value)}/></label>
  </section>;
}
