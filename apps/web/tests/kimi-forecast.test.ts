import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kimiForecast } from '../server/kimi-forecaster.mjs';

const mockManifest = {
  publication: {
    draft: {
      events: [
        { id: 'fed-cut', title: 'Federal Reserve cuts policy rate by at least 25 bps at next meeting', question: 'Fed rate cut' },
        { id: 'cpi-drop', title: 'Core CPI year-over-year inflation prints below 2.8 percent', question: 'Core CPI below 2.8%' },
        { id: 'monad-launch', title: 'Monad mainnet launches with public block production before Q4', question: 'Monad mainnet launch' }
      ]
    },
    rules: {
      events: [
        { id: 'fed-cut', source: 'https://federalreserve.gov' },
        { id: 'cpi-drop', source: 'https://bls.gov' },
        { id: 'monad-launch', source: 'https://monad.xyz' }
      ]
    }
  }
};

test('kimiForecast returns valid structured forecast respecting Frechet bounds', async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ pA: 45, pBgivenYes: 60, pBgivenNo: 25, rationale: 'Conditional hypothesis.' }) } }] }) });
  const res = await kimiForecast({ manifest: mockManifest, a: 0, b: 1, apiKey: 'test-only', fetcher });
  assert.equal(res.schema, 'flurbo.kimi-forecast.v1');
  assert.equal(res.source, 'moonshot-api');
  assert.equal(res.a, 0);
  assert.equal(res.b, 1);
  assert.ok(res.forecast.pA >= 0.1 && res.forecast.pA <= 99.9);
  assert.ok(res.forecast.pBgivenYes >= 0.1 && res.forecast.pBgivenYes <= 99.9);
  assert.ok(res.forecast.pBgivenNo >= 0.1 && res.forecast.pBgivenNo <= 99.9);
  assert.ok(typeof res.rationale === 'string' && res.rationale.length > 10);
  assert.equal(res.frechetBounds.valid, true);
  assert.ok(res.frechetBounds.actualJoint >= res.frechetBounds.minJoint - 1e-5);
  assert.ok(res.frechetBounds.actualJoint <= res.frechetBounds.maxJoint + 1e-5);
});

test('kimiForecast does not label a local heuristic as Kimi', async () => {
  await assert.rejects(() => kimiForecast({ manifest: mockManifest, a: 0, b: 1, apiKey: '' }), /not configured/);
  await assert.rejects(() => kimiForecast({ manifest: mockManifest, a: 0, b: 1, apiKey: 'test-only', fetcher: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
  await assert.rejects(() => kimiForecast({ manifest: mockManifest, a: 0, b: 1, apiKey: 'test-only', fetcher: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Suspended due to insufficient balance' } }) }) }), /insufficient API balance/);
});

test('kimiForecast validates input bounds and rejects invalid pairs', async () => {
  await assert.rejects(() => kimiForecast({ manifest: mockManifest, a: 0, b: 0 }));
  await assert.rejects(() => kimiForecast({ manifest: mockManifest, a: -1, b: 1 }));
  await assert.rejects(() => kimiForecast({ manifest: mockManifest, a: 0, b: 5 }));
});
