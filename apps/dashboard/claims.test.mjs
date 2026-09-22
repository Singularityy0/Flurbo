import test from 'node:test';
import assert from 'node:assert/strict';
import { compileClaim, parseUnits, formatUnits, snapshotFresh } from './claims.mjs';

test('canonical masks preserve actual event ordering and mixed YES/NO payouts', () => {
  assert.equal(compileClaim([{ index: 7, yes: true }], 'all').mask, 2);
  assert.equal(compileClaim([{ index: 7, yes: false }], 'all').mask, 1);
  const legs = [{ index: 7, yes: false }, { index: 0, yes: true }];
  const claim = compileClaim(legs, 'all');
  assert.equal(claim.scope, 129); assert.equal(claim.mask, 2);
  assert.equal(compileClaim(legs, 'any').mask, 11);
  assert.equal(compileClaim([{ index: 2, yes: true }, ...legs], 'all').mask, 8);
});

test('every nonconstant truth table up to three legs maps to its exact payoff mask', () => {
  for (let count = 1; count <= 3; count++) {
    const legs = Array.from({ length: count }, (_, index) => ({ index, yes: true }));
    for (let mask = 1; mask < (1 << (1 << count)) - 1; mask++) assert.equal(compileClaim(legs, 'custom', mask).mask, mask);
  }
  for (const mask of [0, 15, 16, -1]) assert.throws(() => compileClaim([{ index: 0, yes: true }, { index: 1, yes: true }], 'custom', mask));
  assert.throws(() => compileClaim([], 'all'));
  assert.throws(() => compileClaim(Array.from({ length: 4 }, (_, index) => ({ index, yes: true })), 'all'));
});

test('amounts above JS safe integer remain exact and invalid quantities never reach RPC', () => {
  assert.equal(parseUnits('9007199254740993.000001'), '9007199254740993000001');
  assert.equal(formatUnits('9007199254740993000001'), '9,007,199,254,740,993.000001');
  assert.equal(formatUnits('-1'), '-0.000001'); assert.equal(formatUnits('0'), '0');
  assert.equal(formatUnits('450000000000000000', 18), '0.45');
  for (const value of ['0', '-1', '1e3', '1.0000001', '1,000', '', '.5', 'NaN', '01', (2n ** 128n).toString()]) assert.throws(() => parseUnits(value));
});

test('freshness expires locally even without another API response', () => {
  const s = { stale: false, timestamp: 1000 };
  assert.equal(snapshotFresh(s, 1030), true); assert.equal(snapshotFresh(s, 1031), false);
  assert.equal(snapshotFresh(s, 999), false); assert.equal(snapshotFresh({ ...s, stale: true }, 1001), false);
});
