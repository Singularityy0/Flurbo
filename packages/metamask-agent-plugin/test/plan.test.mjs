import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { decodeFunctionData } from 'viem';
import { planRedeem, planTrade, validateClaim, getQuote, getHoldings, poolAbi, erc20Abi } from '../dist/index.js';
import { submitTransaction } from '../dist/shared.js';

const pool = '0x' + '1a'.repeat(20), ausd = '0x' + '2b'.repeat(20), owner = '0x' + '3c'.repeat(20);
const NOW = 1_800_000_000;

function fakeClient(overrides = {}) {
  const state = { chainId: 10143, eventCount: 4, funded: true, resolved: false, closesAt: BigInt(NOW + 86_400), collateral: ausd,
    quoteBuy: 1_000_001n, quoteSell: 1_000_001n, held: 5_000_000n, allowance: 0n, balance: 100_000_000n, revert: null, ...overrides };
  const simulated = [];
  return {
    simulated,
    getChainId: async () => state.chainId,
    readContract: async ({ address, functionName }) => {
      const table = { eventCount: state.eventCount, funded: state.funded, resolved: state.resolved, closesAt: state.closesAt, collateral: state.collateral,
        quoteBuy: state.quoteBuy, quoteSell: state.quoteSell, holdings: state.held, allowance: state.allowance, balanceOf: state.balance };
      if (!(functionName in table)) throw new Error('unexpected read ' + functionName);
      if (['allowance', 'balanceOf'].includes(functionName) && address.toLowerCase() !== ausd) throw new Error('token read on the wrong address');
      return table[functionName];
    },
    simulateContract: async request => {
      if (state.revert) throw Object.assign(new Error('revert'), { shortMessage: state.revert });
      simulated.push(request);
      return { result: 0n };
    },
  };
}
const base = { pool, owner, scope: 4, mask: 2n, quantity: 1_000_000n, side: 'buy', slippageBps: 50, deadlineSeconds: 300, now: NOW };

test('validateClaim accepts real claims and rejects malformed ones', () => {
  validateClaim(4, 2n, 4); validateClaim(3, 6n, 4); validateClaim(7, 254n, 4); validateClaim(8, 1n, 4);
  assert.throws(() => validateClaim(0, 2n, 4), /Scope/);
  assert.throws(() => validateClaim(16, 2n, 4), /Scope/);
  assert.throws(() => validateClaim(15, 2n, 4), /1 to 3 questions/);
  assert.throws(() => validateClaim(1.5, 2n, 4), /Scope/);
  assert.throws(() => validateClaim(4, 0n, 4), /neither empty nor full/);
  assert.throws(() => validateClaim(4, 3n, 4), /neither empty nor full/);
  assert.throws(() => validateClaim(3, 15n, 4), /neither empty nor full/);
  assert.throws(() => validateClaim(7, 255n, 4), /neither empty nor full/);
  assert.throws(() => validateClaim(4, -1n, 4), /neither empty nor full/);
});

test('a buy needs an exact approval only when the allowance is short, and does not simulate before it', async () => {
  const client = fakeClient({ allowance: 0n });
  const plan = await planTrade(client, base);
  assert.equal(plan.quoteAtoms, 1_000_001n);
  assert.equal(plan.limitAtoms, 1_005_002n); // 1000001 * 10050 / 10000 rounded up
  assert.ok(plan.approval);
  assert.equal(plan.approval.to.toLowerCase(), ausd);
  const approve = decodeFunctionData({ abi: erc20Abi, data: plan.approval.data });
  assert.equal(approve.functionName, 'approve');
  assert.equal(approve.args[0].toLowerCase(), pool);
  assert.equal(approve.args[1], plan.limitAtoms); // exact, never unlimited
  assert.equal(client.simulated.length, 0);
  const buy = decodeFunctionData({ abi: poolAbi, data: plan.trade.data });
  assert.equal(buy.functionName, 'buy');
  assert.deepEqual(buy.args, [4, 2n, 1_000_000n, plan.limitAtoms, BigInt(NOW + 300)]);
  assert.equal(plan.deadline, BigInt(NOW + 300));
  assert.match(plan.approval.intent, /Approve exactly 1\.005002 test AUSD/);
});

test('with enough allowance a buy is simulated as the owner and needs no approval', async () => {
  const client = fakeClient({ allowance: 5_000_000n });
  const plan = await planTrade(client, base);
  assert.equal(plan.approval, null);
  assert.equal(client.simulated.length, 1);
  assert.equal(client.simulated[0].functionName, 'buy');
  assert.equal(client.simulated[0].account.toLowerCase(), owner);
});

test('slippage rounds against the trader: cost up on buys, proceeds down on sells', async () => {
  const buy = await planTrade(fakeClient({ allowance: 9n ** 20n }), { ...base, slippageBps: 0 });
  assert.equal(buy.limitAtoms, 1_000_001n);
  const sell = await planTrade(fakeClient(), { ...base, side: 'sell', slippageBps: 50 });
  assert.equal(sell.limitAtoms, 995_000n); // 1000001 * 9950 / 10000 rounded down
  assert.equal(sell.approval, null);
  const decoded = decodeFunctionData({ abi: poolAbi, data: sell.trade.data });
  assert.equal(decoded.functionName, 'sell');
  assert.equal(decoded.args[3], 995_000n);
});

test('limits: slippage, deadline, quantity, balance, holdings, closed pools and the wrong chain', async () => {
  const client = fakeClient({ allowance: 9n ** 20n });
  await assert.rejects(planTrade(client, { ...base, slippageBps: 101 }), /Slippage/);
  await assert.rejects(planTrade(client, { ...base, slippageBps: -1 }), /Slippage/);
  await assert.rejects(planTrade(client, { ...base, slippageBps: 0.5 }), /Slippage/);
  await assert.rejects(planTrade(client, { ...base, deadlineSeconds: 59 }), /Deadline/);
  await assert.rejects(planTrade(client, { ...base, deadlineSeconds: 601 }), /Deadline/);
  await assert.rejects(planTrade(client, { ...base, quantity: 0n }), /Quantity/);
  await assert.rejects(planTrade(client, { ...base, quantity: 10_000_001n }), /Quantity/);
  await planTrade(client, { ...base, quantity: 10_000_000n });
  await assert.rejects(planTrade(client, { ...base, side: 'hold' }), /buy or sell/);
  await assert.rejects(planTrade(client, { ...base, pool: '0x1234' }), /pool address/);
  await assert.rejects(planTrade(client, { ...base, owner: 'nobody' }), /owner address/);
  await assert.rejects(planTrade(client, { ...base, mask: 3n }), /neither empty nor full/);
  await assert.rejects(planTrade(fakeClient({ balance: 1_000_000n, allowance: 9n ** 20n }), base), /holds 1 test AUSD/);
  await assert.rejects(planTrade(fakeClient({ held: 999_999n }), { ...base, side: 'sell' }), /fewer shares/);
  await assert.rejects(planTrade(fakeClient({ closesAt: BigInt(NOW) }), base), /closed/);
  await assert.rejects(planTrade(fakeClient({ resolved: true }), base), /closed/);
  await assert.rejects(planTrade(fakeClient({ funded: false }), base), /closed/);
  await assert.rejects(planTrade(fakeClient({ chainId: 1 }), base), /not Monad testnet/);
  await assert.rejects(planTrade(fakeClient({ allowance: 9n ** 20n, revert: 'Closed()' }), base), /would reject this purchase: Closed/);
});

test('redeem refuses an unresolved pool and plans a simulated call after resolution', async () => {
  await assert.rejects(planRedeem(fakeClient(), { pool, owner, scope: 4, mask: 2n, quantity: 1_000_000n }), /not resolved/);
  const client = fakeClient({ resolved: true });
  const tx = await planRedeem(client, { pool, owner, scope: 4, mask: 2n, quantity: 1_000_000n });
  assert.equal(tx.to.toLowerCase(), pool);
  assert.deepEqual(decodeFunctionData({ abi: poolAbi, data: tx.data }), { functionName: 'redeem', args: [4, 2n, 1_000_000n] });
  assert.equal(client.simulated[0].functionName, 'redeem');
  await assert.rejects(planRedeem(fakeClient({ resolved: true, held: 0n }), { pool, owner, scope: 4, mask: 2n, quantity: 1n }), /fewer shares/);
  await assert.rejects(planRedeem(fakeClient({ resolved: true, revert: 'NotResolved()' }), { pool, owner, scope: 4, mask: 2n, quantity: 1n }), /would reject this redemption/);
});

test('reads return atoms and display units', async () => {
  const client = fakeClient();
  assert.deepEqual(await getQuote(client, { pool, scope: 4, mask: 2n, quantity: 1_000_000n, side: 'buy' }), { atoms: 1_000_001n, ausd: '1.000001' });
  assert.deepEqual(await getHoldings(client, { pool, account: owner, scope: 4, mask: 2n }), { atoms: 5_000_000n, shares: '5' });
  await assert.rejects(getQuote(client, { pool, scope: 4, mask: 2n, quantity: 10_000_001n, side: 'sell' }), /Quantity/);
});

test('transactions are handed to the Agent Wallet executor with a readable intent and never signed here', async () => {
  const seen = [];
  const executor = async (request, options) => { seen.push({ request, options }); return { kind: 'transaction', hash: '0x' + 'ab'.repeat(32), status: 'CONFIRMED' }; };
  const signal = new AbortController().signal;
  const sent = await submitTransaction(executor, { to: pool, data: '0x1234', intent: 'Buy 1 Flurbo share' }, signal);
  assert.deepEqual(seen[0].request, { kind: 'transaction', chainId: 10143, transaction: { to: pool, data: '0x1234' }, intent: { action: 'custom', summary: 'Buy 1 Flurbo share' } });
  assert.equal(seen[0].options.signal, signal);
  assert.equal(sent.explorerUrl, 'https://testnet.monadscan.com/tx/0x' + 'ab'.repeat(32));
  assert.equal(sent.status, 'CONFIRMED');
  const pending = await submitTransaction(async () => ({ kind: 'transaction', status: 'AWAITING_MFA', pendingJob: { pollingId: 'job-1' } }), { to: pool, data: '0x', intent: 'x' });
  assert.deepEqual(pending, { hash: null, status: 'AWAITING_MFA', pollingId: 'job-1' });
  await assert.rejects(submitTransaction(async () => ({ kind: 'transaction', status: 'FAILED', failureDescription: 'Outflow limit exceeded' }), { to: pool, data: '0x', intent: 'x' }), /Outflow limit exceeded/);
  await assert.rejects(submitTransaction(async () => ({ kind: 'message' }), { to: pool, data: '0x', intent: 'x' }), /unexpected result/);
});

const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });

test('no source file touches a private key, mnemonic or raw signing', () => {
  const files = walk(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).filter(file => file.endsWith('.ts'));
  assert.ok(files.length >= 7, 'source files were found');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /privateKeyToAccount|mnemonic|PRIVATE_KEY|createWalletClient|signTransaction|signMessage|sendRawTransaction|keystore/i, file);
  }
});

test('the manifest, the built commands and the skill describe the same five commands', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const built = JSON.parse(readFileSync(new URL('../oclif.manifest.json', import.meta.url), 'utf8'));
  const ids = pkg.mm.commands.map(command => command.id).sort();
  assert.deepEqual(ids, ['flurbo:holdings', 'flurbo:markets', 'flurbo:quote', 'flurbo:redeem', 'flurbo:trade']);
  assert.deepEqual(Object.keys(built.commands).sort(), ids);
  for (const command of pkg.mm.commands) assert.deepEqual(command.targetChains, [10143]);
  const byId = Object.fromEntries(pkg.mm.commands.map(command => [command.id, command]));
  assert.deepEqual(byId['flurbo:trade'].capabilities, ['wallet-read', 'wallet-submit']);
  assert.deepEqual(byId['flurbo:redeem'].capabilities, ['wallet-read', 'wallet-submit']);
  assert.deepEqual(byId['flurbo:holdings'].capabilities, ['wallet-read']);
  for (const id of ['flurbo:quote', 'flurbo:markets']) assert.deepEqual(byId[id].capabilities, []);
  assert.deepEqual(pkg.mm.capabilities, []);
  const skill = readFileSync(new URL('../skills/flurbo-trading/SKILL.md', import.meta.url), 'utf8');
  const documented = [...skill.matchAll(/mm flurbo ([a-z]+)/g)].map(match => 'flurbo:' + match[1]);
  assert.ok(documented.length > 0);
  for (const id of documented) assert.ok(ids.includes(id), `${id} is documented but does not exist`);
  for (const id of ids) assert.ok(documented.includes(id), `${id} is not documented`);
  const root = readFileSync(new URL('../../../skills/flurbo-trading/SKILL.md', import.meta.url), 'utf8');
  assert.equal(root, skill);
});

test('the version range admits the current CLI, and the manifest passes the SDK schema', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const { default: semver } = await import('semver');
  for (const version of ['6.2.0', '6.9.1', '7.0.0']) assert.ok(semver.satisfies(version, pkg.mm.minCliVersion, { includePrerelease: true }), version);
  assert.ok(!semver.satisfies('6.1.9', pkg.mm.minCliVersion));
  const { PluginManifestSchema } = await import('@metamask/agent-wallet/plugin');
  const parsed = PluginManifestSchema.safeParse(pkg.mm);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
});

test('the bundled market list names real pools with claim scopes', () => {
  const snapshot = JSON.parse(readFileSync(new URL('../dist/markets-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(snapshot.schema, 'flurbo.markets-snapshot.v1');
  assert.ok(snapshot.markets.length >= 6);
  const weekend = snapshot.markets.find(market => market.label === 'Crypto weekend');
  assert.equal(weekend.pool, '0xf8beba5827bfaaf6ace08a40cd9db740233ca9fe');
  assert.deepEqual(weekend.questions.map(question => question.scope), [1, 2, 4, 8]);
  assert.match(weekend.questions[2].question, /ETH\/USD/);
  assert.doesNotMatch(JSON.stringify(snapshot), /secret|token|apikey|0x[0-9a-f]{64}/i);
});

