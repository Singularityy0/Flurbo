import test from 'node:test';
import assert from 'node:assert/strict';
import { kuruPriceAusd } from '../src/envio.ts';

test('a Kuru price is read in either of its two units and nothing else', () => {
  assert.equal(kuruPriceAusd('460000'), '0.460000');
  assert.equal(kuruPriceAusd('1000000'), '1.000000');
  assert.equal(kuruPriceAusd('480000000000000000'), '0.480000');
  assert.equal(kuruPriceAusd('1000000000000000000'), '1.000000');
  assert.equal(kuruPriceAusd('0'), null);
  assert.equal(kuruPriceAusd('2000000000000000000'), null);
  assert.equal(kuruPriceAusd('-5'), null);
  assert.equal(kuruPriceAusd('abc'), null);
});
