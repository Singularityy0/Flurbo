import { useEffect, useState } from 'react';
import { appFetch } from '../platform-fetch';
import { parseCreEvidence, type CreEvidence } from '../../shared/cre-evidence.mjs';

// The price-feed workflow was simulated on a teammate setup. This shows that saved result when the published pool matches it.
export default function CreStatus() {
  const [evidence, setEvidence] = useState<CreEvidence | null | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    void appFetch('/api/pilot/cre-evidence', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 404) { setEvidence(null); return; }
        if (!response.ok) return;
        const parsed = parseCreEvidence(await response.json());
        if (!controller.signal.aborted) setEvidence(parsed);
      })
      .catch(() => { if (!controller.signal.aborted) setEvidence(null); });
    return () => controller.abort();
  }, []);
  if (evidence === undefined) return null;
  return <section className="panel access-card" aria-label="Chainlink CRE">
    <div className="panel-head"><h2>Chainlink CRE</h2></div>
    {!evidence ? <p>No CRE check is attached to the pool that is published right now. The crypto-weekend simulation is already recorded: it read Chainlink price feeds and matched that pool’s on-chain result. CRE observes. The bonded resolver still settles.</p>
      : <>
        <p>{evidence.onchain?.matches ? 'The simulated CRE workflow matches this pool’s on-chain result.' : 'A CRE observation is saved for this pool.'} It reads Chainlink price feeds and does not settle the pool.</p>
        <p>Yes mask {evidence.yesMask}. Observation block {evidence.block.number}. {evidence.observations.map(row => `${row.label} ${row.yes ? 'Yes' : 'No'}`).join(' · ')}</p>
      </>}
  </section>;
}
