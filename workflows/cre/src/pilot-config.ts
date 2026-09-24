import { encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { eventDraftSchema, prepareEventDraft } from './event-draft';
import { releaseTargetForEvent } from './github-release';

export const PILOT_CASH = '0xa9012a055bd4e0edff8ce09f960291c09d5322dc';
export const VOID_POLICY = 'Valid event outcomes stay fixed. Each void event receives equal YES and NO weight, independently of other void events. Each claim pays its average truth-table payout across compatible states, rounded down to test AUSD atoms on each redemption. This is not a refund of purchase cost. Missing evidence, unresolved ambiguity and reviewer nonresponse produce VOID under the fixed deadlines. No creator override or reviewer replacement is permitted.';
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v => !/^0x0{40}$/.test(v)).transform(v => v.toLowerCase() as Address);
const duration = (max: number) => z.number().int().min(3600).max(max);
export const pilotInputSchema = z.object({
  schema: z.literal('flurbo.pilot-publication.v1'),
  creator: address,
  draft: eventDraftSchema,
  reviewers: z.array(z.object({ name: z.string().trim().min(1).max(100), address }).strict()).min(3).max(5),
  independentReviewersConfirmed: z.literal(true),
  rulesReviewed: z.literal(true),
  bondAtoms: z.string().regex(/^[1-9][0-9]{0,7}$/),
  assertionPeriod: duration(30 * 86400),
  challengePeriod: duration(7 * 86400),
  votingPeriod: duration(7 * 86400),
}).strict();

export function disputePolicy(input: { reviewers: {name: string; address: string}[]; bondAtoms: string; assertionPeriod: number; challengePeriod: number; votingPeriod: number }) {
  return `Named testnet reviewer panel: ${input.reviewers.map(r => `${r.name} (${r.address.toLowerCase()})`).join(', ')}. Quorum ${Math.floor(input.reviewers.length / 2) + 1} of ${input.reviewers.length} matching votes. One test AUSD has 1000000 atoms. Assertion and dispute bond: ${input.bondAtoms} atoms each. Assertion window: ${input.assertionPeriod} seconds after observation end. Challenge window: ${input.challengePeriod} seconds after assertion. Vote window: ${input.votingPeriod} seconds after dispute. Reviewers cannot assert or dispute from their registered addresses. One vote per reviewer per event. Unchallenged assertions return their bond. A panel decision matching a party pays both bonds to that party. Third outcomes and voting timeouts return each party's own bond. Missing assertions and voting timeouts finalize VOID. Anyone may finalize elapsed deadlines and deliver all final results. Test bonds provide no economic security; panel members are explicitly trusted.`;
}

export const resolverConfigAbi = parseAbiParameters('(address collateral, bytes32 draftHash, uint64 closesAt, bytes32[] eventHashes, uint64[] observationEnds, address[] reviewers, uint128 bond, uint32 assertionPeriod, uint32 challengePeriod, uint32 votingPeriod) config');

export function preparePilot(input: unknown, now: number) {
  const value = pilotInputSchema.parse(input);
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('Invalid preparation time');
  if (![3, 5].includes(value.reviewers.length) || new Set(value.reviewers.map(r => r.address)).size !== value.reviewers.length
    || new Set(value.reviewers.map(r => r.name.toLowerCase())).size !== value.reviewers.length) throw new Error('Use three or five distinct named reviewers');
  if (value.draft.closesAt <= now + 3600 || value.draft.closesAt > now + 30 * 86400) throw new Error('Close must be between one hour and thirty days from preparation');
  if (value.draft.events.some(e => e.observationEndsAt > now + 90 * 86400)) throw new Error('Observation window exceeds pilot limit');
  if (value.draft.disputeModel !== 'reviewer-panel' || value.draft.exceptionPolicy !== VOID_POLICY || value.draft.disputePolicy !== disputePolicy(value)) throw new Error('Draft must contain the exact reviewed pilot policies');
  const records = new Set<string>();
  for (const event of value.draft.events) {
    releaseTargetForEvent(value.draft, event.id);
    if (records.has(event.source.recordId)) throw new Error('Do not duplicate the same release as separate events');
    records.add(event.source.recordId);
  }
  const { draftHash } = prepareEventDraft(value.draft, now);
  const eventHashes = value.draft.events.map((event, bit) => keccak256(encodeAbiParameters(
    parseAbiParameters('string domain, bytes32 draftHash, uint8 bit, string eventId'),
    ['flurbo.pilot.event.v1', draftHash, bit, event.id],
  )));
  const config = {
    collateral: PILOT_CASH as Address, draftHash, closesAt: BigInt(value.draft.closesAt), eventHashes,
    observationEnds: value.draft.events.map(e => BigInt(e.observationEndsAt)), reviewers: value.reviewers.map(r => r.address),
    bond: BigInt(value.bondAtoms), assertionPeriod: value.assertionPeriod, challengePeriod: value.challengePeriod, votingPeriod: value.votingPeriod,
  };
  const resolverConfig = encodeAbiParameters(resolverConfigAbi, [config]);
  return { schema: 'flurbo.pilot-prepared.v1', status: 'prepared_not_deployed', preparedAt: now,
    creator: value.creator, publication: value, draftHash, eventHashes, resolverConfig,
    configHash: keccak256(resolverConfig), liquidityAtoms: '10000000',
    notice: 'Preparation does not publish a market, verify reviewer independence or establish evidence delivery. Deployment and public acceptance remain separate.' };
}

export function pilotRulesHash(config: Parameters<typeof encodeAbiParameters<typeof resolverConfigAbi>>[1][0], resolver: Address, creator: Address): Hex {
  return keccak256(encodeAbiParameters([
    ...parseAbiParameters('string domain, uint256 chainId, address resolver, address creator'), ...resolverConfigAbi,
  ], ['flurbo.pilot.uniform-void.v1', 10143n, resolver, creator, config]));
}
