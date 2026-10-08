import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseConfig } from '../src/node/runner.ts';

const config = JSON.parse(readFileSync(new URL('../examples/kimi-agent.json', import.meta.url), 'utf8'));

test('the Kimi agent example is a valid paper-mode configuration', () => {
  const parsed = parseConfig(config);
  assert.equal(parsed.mode, 'paper');
  assert.equal(parsed.research.provider.kind, 'openai-compatible');
});

test('Kimi is reached through the OpenAI-compatible provider with a key taken from the environment', () => {
  const provider = config.research.provider;
  assert.equal(provider.baseUrl, 'https://api.moonshot.ai/v1');
  assert.equal(provider.apiKeyEnv, 'MOONSHOT_API_KEY');
  assert.equal(config.research.retriever.kind, 'http');
  assert.deepEqual(config.research.retriever.allowHosts, ['rpc.monad.xyz', 'docs.chain.link']);
});

test('the example holds no secret and needs the market and model filled in before it can run', () => {
  const text = JSON.stringify(config);
  assert.doesNotMatch(text, /sk-[A-Za-z0-9]{10,}|0x[0-9a-fA-F]{64}/);
  assert.match(text, /REPLACE_WITH_MODEL_ID/);
  assert.deepEqual(config.markets, config.policy.markets);
  assert.equal(config.signer.kind, 'local-key');
  assert.equal(config.policy.allowSell, false);
});
