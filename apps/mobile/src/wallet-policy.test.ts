import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionAddress, checkWalletTransaction } from './wallet-policy.ts';
const owner = '0x' + 'a'.repeat(40);
test('requires one testnet wallet and transaction permission', () => {
  const s = { expiry: 100, namespaces: { eip155: { accounts: [`eip155:10143:${owner}`], methods: ['eth_sendTransaction'], events: [] } } };
  assert.equal(sessionAddress(s, 1), owner);
  assert.throws(() => sessionAddress(s, 100_001));
  s.namespaces.eip155.accounts = [`eip155:1:${owner}`];
  assert.throws(() => sessionAddress(s, 1));
});
test('rejects mainnet, different sender and native transfers', () => {
  const tx = { from: owner, to: owner, chainId: '0x279f', value: '0x0', data: '0x12345678' };
  assert.equal(checkWalletTransaction(tx, owner), tx);
  for (const change of [{ chainId: '0x1' }, { value: '0x1' }, { from: '0x' + 'b'.repeat(40) }]) assert.throws(() => checkWalletTransaction({ ...tx, ...change }, owner));
});
