import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionAddress, checkWalletTransaction, walletSessionChanged } from './wallet-policy.ts';
const owner = '0x' + 'a'.repeat(40);
test('requires one testnet wallet and transaction permission', () => {
  const s = { peer: {metadata: {name: "MetaMask", url: "https://metamask.io"}}, expiry: 100, namespaces: { eip155: { accounts: [`eip155:10143:${owner}`], methods: ['eth_sendTransaction'], events: [] } } };
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

test('accepts MetaMask mobile metadata and rejects other WalletConnect wallets', () => {
  const session = {expiry: 100, namespaces: {eip155: {accounts: [`eip155:10143:${owner}`], methods:['eth_sendTransaction'], events:[]}}};
  assert.throws(() => sessionAddress(session, 1), /Only MetaMask/);
  assert.equal(sessionAddress({...session, peer:{metadata:{name:'MetaMask Wallet',url:'https://metamask.app.link'}}}, 1), owner);
  assert.equal(sessionAddress({...session, peer:{metadata:{name:'MetaMask: Web3 Wallet',url:'https://metamask.io/'}}}, 1), owner);
  assert.throws(() => sessionAddress({...session, peer:{metadata:{name:'Rabby',url:'https://rabby.io'}}}, 1), /Only MetaMask/);
  assert.throws(() => sessionAddress({...session, peer:{metadata:{name:'MetaMask',url:'https://metamask.io.evil.test'}}}, 1), /Only MetaMask/);
  assert.throws(() => sessionAddress({...session, namespaces:{eip155:{...session.namespaces.eip155,accounts:[`eip155:1:${owner}`]}}}, 1));
});

test('wallet events invalidate only a different account or network', () => {
  assert.equal(walletSessionChanged({name:'chainChanged',data:'0x279f'},owner),false);
  assert.equal(walletSessionChanged({name:'accountsChanged',data:[owner]},owner),false);
  assert.equal(walletSessionChanged({name:'message',data:{}},owner),false);
  assert.equal(walletSessionChanged({name:'chainChanged',data:'0x1'},owner),true);
  assert.equal(walletSessionChanged({name:'accountsChanged',data:['0x'+'b'.repeat(40)]},owner),true);
});
