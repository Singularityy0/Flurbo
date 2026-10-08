import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { appFetch } from '../platform-fetch';
import { blockUrl, parseCreEvidence, type CreEvidence as Evidence } from '../../shared/cre-evidence.mjs';
import type { PilotNamespace } from '../pilot';

const decimal = (atoms: string, decimals: number) => {
  const n = BigInt(atoms), scale = 10n ** BigInt(decimals), frac = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${n / scale}${frac ? '.' + frac.slice(0, 4) : ''}`;
};

// Shows what the Chainlink CRE price-feed workflow observed for this pool. It is a second reading of the same rules,
// not the settlement: the pool's bonded resolver decides, and the result is shown next to it.
export default function CreEvidence({ namespace, event, question }: { namespace: PilotNamespace; event: number; question: (index: number) => string }) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setEvidence(null);
    void appFetch(`/api/${namespace}/cre-evidence`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const parsed = parseCreEvidence(await response.json());
        if (parsed && !controller.signal.aborted) setEvidence(parsed);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [namespace]);
  if (!evidence) return null;
  const status = evidence.onchain === null ? 'Pending: the pool has not resolved yet' : evidence.onchain.matches ? 'Matches the on-chain result' : 'Differs from the on-chain result';
  return <details className="detail-panel disclosure" aria-label="Chainlink CRE check">
    <summary>Chainlink CRE check · {status}</summary>
    <p className="market-caption">A Chainlink CRE workflow read the Chainlink price feeds on Monad mainnet at the first block at or after the committed observation time and applied this pool’s committed thresholds. It does not settle the pool; the bonded resolver does.</p>
    <dl className="facts">
      {evidence.observations.map(row => <div key={row.eventIndex}>
        <dt>{row.label}{row.eventIndex === event ? ' (this question)' : ''}</dt>
        <dd><strong>{row.yes ? 'Yes' : 'No'}</strong>: {decimal(row.answer, row.decimals)} against at least {row.threshold}</dd>
      </div>)}
      <dt>Observation block</dt>
      <dd><a className="text-link" href={blockUrl(evidence.block.number)} target="_blank" rel="noreferrer">{evidence.block.number} <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.75} /></a>, {new Date(evidence.block.timestamp * 1000).toISOString().replace('.000Z', 'Z')}</dd>
      <dt>Workflow result</dt>
      <dd>{evidence.observations.some(row => row.yes) ? 'Yes on ' + evidence.observations.filter(row => row.yes).map(row => row.label).join(', ') : 'No on every question'}</dd>
      {evidence.onchain && <><dt>Pool result</dt><dd>{evidence.onchain.matches ? 'Same answers' : 'Different answers'}</dd></>}
    </dl>
    <p className="market-caption">Questions: {evidence.observations.map(row => `${row.label}: ${question(row.eventIndex)}`).join(' · ')}</p>
    <p className="market-caption">{evidence.notice}</p>
  </details>;
}
