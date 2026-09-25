import {test,expect} from 'bun:test';
import {decodeAbiParameters} from 'viem';
import {prepareShowcase} from '../src/showcase';
import {resolverConfigAbi} from '../src/pilot-config';
const selection={creator:'0x0000000000000000000000000000000000000004',reviewers:[1,2,3].map(i=>({name:`Test reviewer ${i}`,address:`0x${String(i).padStart(40,'0')}`}))};
test('Showcase commits four real metrics, four-hour trading and explicit settlement deadlines',()=>{
  const now=1800000000,p=prepareShowcase(selection,now),[c]=decodeAbiParameters(resolverConfigAbi,p.resolverConfig);
  expect(p.publication.mode).toBe('ethereum-activity');expect(p.publication.draft.title).toBe('Showcase v0');
  expect(Number(c.closesAt)).toBe(now+14400);expect(c.observationEnds).toEqual(Array(4).fill(BigInt(now+14400+1920)));
  expect(c.assertionPeriod).toBe(3600);expect(c.challengePeriod).toBe(3600);expect(c.votingPeriod).toBe(3600);
  expect(p.publication.draft.events.map(e=>e.id)).toEqual(['ethereum-fullness','ethereum-transactions','ethereum-fees','ethereum-blobs']);
  expect(prepareShowcase(selection,now+60,now+14400).configHash).toBe(p.configHash);
  expect(()=>prepareShowcase(selection,now+14400-3600,now+14400)).toThrow();
});
