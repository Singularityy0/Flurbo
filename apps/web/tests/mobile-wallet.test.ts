import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inFlurboApp, phoneUsesMetaMaskApp } from '../src/auth/native-app.ts';
import { metamaskOpenUrl, metamaskSessionAddress, walletTransaction } from '../src/auth/mobile-wallet.ts';

const session = {
  topic: 'abc',
  expiry: Math.floor(Date.now() / 1000) + 3600,
  peer: { metadata: { name: 'MetaMask', url: 'https://metamask.io' } },
  namespaces: { eip155: { accounts: ['eip155:10143:0x' + 'ab'.repeat(20)], methods: ['eth_sendTransaction', 'personal_sign'], events: ['accountsChanged'] } },
};

test('the shell and a phone browser open the MetaMask app; a desktop browser does not', () => {
  assert.equal(inFlurboApp(), false);
  assert.equal(phoneUsesMetaMaskApp('Mozilla/5.0'), false);
  assert.equal(phoneUsesMetaMaskApp('Mozilla/5.0 (Linux; Android 14) FlurboNative'), true);
  assert.equal(phoneUsesMetaMaskApp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(inFlurboApp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), false);
});

test('a MetaMask Monad session yields its one account, and other wallets do not', () => {
  assert.equal(metamaskSessionAddress(session), '0x' + 'ab'.repeat(20));
  assert.equal(metamaskSessionAddress({ ...session, peer: { metadata: { name: 'MetaMask Wallet', url: 'https://metamask.io/' } } }), '0x' + 'ab'.repeat(20));
  assert.throws(() => metamaskSessionAddress({ ...session, peer: { metadata: { name: 'Other', url: 'https://example.com' } } }), /Only MetaMask/);
  assert.throws(() => metamaskSessionAddress({ ...session, namespaces: { eip155: { ...session.namespaces.eip155, accounts: ['eip155:1:0x' + 'ab'.repeat(20)] } } }), /Monad testnet/);
});

test('a trade must be a zero-value Monad transaction from the connected account', () => {
  const owner = '0x' + 'ab'.repeat(20);
  const tx = { from: owner, to: '0x' + 'cd'.repeat(20), chainId: '0x279f', value: '0x0', data: '0x1234' };
  assert.equal(walletTransaction(tx, owner), tx);
  assert.throws(() => walletTransaction({ ...tx, chainId: '0x1' }, owner), /testnet account/);
  assert.throws(() => walletTransaction({ ...tx, value: '0x1' }, owner), /testnet account/);
});

test('MetaMask opens on its own link, with the pairing URI when connecting', () => {
  assert.equal(metamaskOpenUrl(), 'https://metamask.app.link/');
  assert.equal(metamaskOpenUrl('wc:abc'), 'https://metamask.app.link/wc?uri=wc%3Aabc');
  assert.equal(metamaskOpenUrl('wc:abc', 'Mozilla/5.0 (Linux; Android 14) FlurboNative'), 'https://metamask.app.link/wc?uri=wc%3Aabc');
});
