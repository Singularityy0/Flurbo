import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256, stringToBytes, toBytes } from 'viem';
import { openNote, sealNote } from '../src/auth/passkey-vault.ts';

const walletSalt = Buffer.from(toBytes(sha256(stringToBytes('mera.prf.salt.v1')))).toString('base64url');
const client = {
  async createCredential() { throw new Error('unused'); },
  async getCredential(request: { prfSalt: Uint8Array }) {
    return { credentialId: new Uint8Array([1]), prfOutput: toBytes(sha256(request.prfSalt)) };
  },
};

test('a sealed note uses a fresh salt and opens only with that salt', async () => {
  const note = 'desk code 42';
  const vault = await sealNote({ rpId: 'localhost', credentialId: 'AQ', note, client });
  assert.equal(vault.version, 1);
  assert.notEqual(vault.prfSalt, walletSalt);
  assert.equal(JSON.stringify(vault).includes(note), false);
  assert.equal(await openNote({ rpId: 'localhost', vault, client }), note);
  await assert.rejects(openNote({ rpId: 'localhost', vault: { ...vault, prfSalt: walletSalt }, client }));
  await assert.rejects(sealNote({ rpId: 'localhost', credentialId: 'AQ', note: '', client }), /1 and 500/);
});
