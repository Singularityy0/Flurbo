import type {PilotState,PilotNamespace} from './pilot';
export const marketHref=(namespace:PilotNamespace,event:number,yes=true)=>`/markets/${namespace}/${event}${yes?'':'?answer=no'}`;
export function settlementView(state:PilotState,event:number){
  const c=state.cases[event],p=state.manifest.publication,time=state.snapshot.timestamp;
  const end=p.draft.events[event].observationEndsAt;
  const lastEnd=Math.max(...p.draft.events.map(e=>e.observationEndsAt));
  const outcomes=['Pending','No','Yes','Void'];
  const title=state.delivered?'Settled':c.phase===3?'Result confirmed':c.phase===2?'Result disputed':c.phase===1?`Proposed ${outcomes[c.proposal]}`:time<p.draft.closesAt?'Open for predictions':time<end?'Waiting for the event':'Resolving';
  return {title,result:outcomes[c.result],closes:p.draft.closesAt,observes:end,
    expectedFrom:lastEnd+p.challengePeriod,
    deadline:c.phase===1?Number(c.challengeUntil):c.phase===2?Number(c.voteUntil):Number(c.assertionDeadline),
    fallbackAfter:lastEnd+p.assertionPeriod+p.challengePeriod+p.votingPeriod,
    description:state.delivered?'The collection is settled. Winning and void-adjusted shares can be collected.':c.phase===3?'This result is confirmed. Payouts become available when the whole collection settles.':c.phase===2?'A challenge is being resolved. You do not need to approve the result.':c.phase===1?'The proposed answer is open to challenges before it becomes final.':time<end?'Your shares stay in your wallet while the event runs.':'The result is pending. Your shares stay in your wallet; you do not need to place another trade.'};
}
