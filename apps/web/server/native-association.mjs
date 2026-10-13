// These public fingerprints identify installed Android builds. They are not keys.
// The native app (apps/native) uses this same package id. Changing it breaks passkey login.
import association from '../../../config/mobile-passkeys.json' with { type: 'json' };
export function androidAssetLinks(env = process.env) {
  const raw = env.FLURBO_ANDROID_CERT_SHA256 ?? association.certificateSha256.join(',');
  if (!raw) return null;
  const fingerprints = [...new Set(raw.split(',').map(value => value.trim().toUpperCase()))];
  if (fingerprints.length > 8 || fingerprints.some(value => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))) {
    throw new Error('Invalid Android SHA-256 certificate fingerprint');
  }
  // Android passkey RP validation requires handle_all_urls as well as the
  // credential-sharing relation. Checking get_login_creds alone is insufficient.
  return [{ relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'], target: {
    namespace: 'android_app', package_name: association.androidPackage, sha256_cert_fingerprints: fingerprints,
  } }];
}

// iOS passkeys need the Apple team id in the site association. Absent until that id is known.
export function iosAppSiteAssociation(env = process.env) {
  const team = String(env.FLURBO_IOS_TEAM_ID || '').trim();
  if (!/^[A-Z0-9]{10}$/.test(team)) return null;
  const appId = `${team}.${association.androidPackage}`;
  return { webcredentials: { apps: [appId] }, applinks: { apps: [], details: [{ appID: appId, paths: ['*'] }] } };
}
