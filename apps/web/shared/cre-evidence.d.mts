export const CRE_EVIDENCE_SCHEMA: 'flurbo.cre-price-evidence.v1';
export type CreBlock = { number: string; hash: string; timestamp: number };
export type CreObservation = { eventIndex: number; label: string; feed: string; roundId: string; answer: string; decimals: number; updatedAt: string; threshold: string; yes: boolean };
export type CreEvidence = {
  schema: typeof CRE_EVIDENCE_SCHEMA; pool: string; rulesHash: string; block: CreBlock; previousBlock: CreBlock;
  observations: CreObservation[]; yesMask: number; observationsHash: string; unsignedReport: string;
  onchain: { resolvedState: number; voidMask: number; matches: boolean } | null; notice: string;
};
export function parseCreEvidence(raw: unknown): CreEvidence | null;
export const MONAD_MAINNET_EXPLORER: string;
export function blockUrl(number: string): string;
