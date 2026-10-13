import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { androidAssetLinks } from '../server/native-association.mjs';
test('Android credential association only accepts explicit public certificate fingerprints', () => {
  assert.equal(androidAssetLinks({ FLURBO_ANDROID_CERT_SHA256: '' }), null);
  assert.deepEqual(androidAssetLinks({})[0].target.sha256_cert_fingerprints, [
    'AA:B4:D2:57:75:0A:67:99:36:DA:F1:77:EE:A4:95:03:26:A1:A6:81:3E:3F:BC:38:16:79:A7:BC:E9:95:FD:B4',
    '84:8A:EF:0C:61:A3:87:10:37:B0:F8:6F:F8:FC:1A:23:97:A5:B4:DF:AC:A2:F4:65:B3:05:9A:B6:F9:2E:DA:9A',
  ]);
  for (const value of ['placeholder', 'AA:BB', 'https://somewhere', 'aa'.repeat(32)]) assert.throws(() => androidAssetLinks({ FLURBO_ANDROID_CERT_SHA256: value }));
  const fingerprint = Array(32).fill('AB').join(':');
  const result = androidAssetLinks({ FLURBO_ANDROID_CERT_SHA256: fingerprint.toLowerCase() + ',' + fingerprint });
  const app = JSON.parse(readFileSync(new URL('../../mobile/app.json', import.meta.url), 'utf8'));
  assert.equal(result[0].target.package_name, app.expo.android.package);
  assert.deepEqual(result[0].target.sha256_cert_fingerprints, [fingerprint]);
  assert.deepEqual(result[0].relation, ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds']);
});
