import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringToHex } from 'viem';
import { AuthController } from '../src/auth/controller.ts';
import { authPolicy } from '../src/auth/policy.ts';
import { MONAD_TESTNET_RPC } from '../src/auth/mobile-wallet.ts';
import { passkeyAccountRequest } from '../src/auth/passkey-trade.ts';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

function client(output: (read: number) => number) {
  let reads = 0;
  return {
    async createCredential() { throw new Error('unused'); },
    async getCredential() { reads += 1; return { credentialId: new Uint8Array([1]), prfOutput: new Uint8Array(32).fill(output(reads)) }; },
  };
}

const policy = authPolicy('http://localhost:18767', true, true, true);
const tx = (from: string, patch: Record<string, unknown> = {}) => [{
  from, to: '0x' + '22'.repeat(20), data: '0x1234', gas: '0x5208', gasPrice: '0x3b9aca00', nonce: '0x1', chainId: '0x279f', value: '0x0', ...patch,
}];

test('login keeps no signer, and a trading session signs only until it is locked', async () => {
  const controller = new AuthController({ policy, storage: memory(), client: client(() => 9) });
  try {
    assert.equal(await controller.authenticate('login'), true);
    assert.equal(controller.getSnapshot().signingExpiresAt, null);
    await assert.rejects(controller.signDigest('0x' + '11'.repeat(32)), /account access only/);
    assert.equal(await controller.unlockSigning(), true);
    assert.ok(controller.getSnapshot().signingExpiresAt! > Date.now());
    const signature = await controller.signDigest('0x' + '11'.repeat(32));
    assert.equal(signature.compact.length, 64);
    controller.lockSigning();
    assert.equal(controller.getSnapshot().signingExpiresAt, null);
    await assert.rejects(controller.signDigest('0x' + '11'.repeat(32)), /account access only/);
  } finally { await controller.signOut(); }
});

test('a different passkey address does not open a trading session', async () => {
  const controller = new AuthController({ policy, storage: memory(), client: client(read => read === 1 ? 9 : 4) });
  try {
    assert.equal(await controller.authenticate('login'), true);
    assert.equal(await controller.unlockSigning(), false);
    assert.equal(controller.getSnapshot().signingExpiresAt, null);
    await assert.rejects(controller.signDigest('0x' + '11'.repeat(32)), /account access only/);
  } finally { await controller.signOut(); }
});

test('a passkey transaction is broadcast to the public Monad RPC and nowhere else', async () => {
  const controller = new AuthController({ policy, storage: memory(), client: client(() => 9) });
  const calls: string[] = [];
  const broadcast: typeof fetch = async (input, init) => {
    calls.push(`${String(input)} ${String(init?.body ?? '')}`);
    return new Response(JSON.stringify({ result: '0x' + 'ab'.repeat(32) }), { status: 200 });
  };
  try {
    assert.equal(await controller.authenticate('login'), true);
    const from = controller.getSnapshot().address!;
    await assert.rejects(passkeyAccountRequest(controller, 'eth_sendTransaction', tx(from), broadcast), /account access only/);
    await assert.rejects(passkeyAccountRequest(controller, 'personal_sign', [stringToHex('link'), from], broadcast), /account access only/);
    assert.equal(calls.length, 0);
    assert.equal(await controller.unlockSigning(), true);
    await assert.rejects(passkeyAccountRequest(controller, 'eth_sendTransaction', tx(from, { value: '0x1' }), broadcast), /does not send MON/);
    await assert.rejects(passkeyAccountRequest(controller, 'eth_sendTransaction', tx(from, { chainId: '0x1' }), broadcast), /Monad testnet/);
    assert.equal(calls.length, 0);
    const hash = await passkeyAccountRequest(controller, 'eth_sendTransaction', tx(from), broadcast);
    assert.equal(hash, '0x' + 'ab'.repeat(32));
    assert.equal(calls.length, 1);
    assert.match(calls[0], new RegExp('^' + MONAD_TESTNET_RPC.replace(/[.]/g, '\\.') + ' '));
    assert.match(calls[0], /eth_sendRawTransaction/);
    assert.doesNotMatch(calls[0], /\/api\/rpc/);
    const signature = await passkeyAccountRequest(controller, 'personal_sign', [stringToHex('Link this passkey'), from], broadcast);
    assert.match(String(signature), /^0x[0-9a-f]{130}$/i);
    assert.equal(calls.length, 1);
  } finally { await controller.signOut(); }
});
