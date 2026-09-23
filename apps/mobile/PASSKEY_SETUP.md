# Native passkey domain setup

This prepares Mera's native domain association. It does not install Mera, enable
sign-in, generate keys, verify domain ownership, or establish PRF compatibility.
Keep the preview usable without a domain; its sign-in action remains disabled.

## Choose the identity before creating passkeys

The selected host is **`flurbo.singu.online`**, under the user's `singu.online`
domain. The root domain remains available for other projects. Both EAS build
profiles set this relying party ID. This records the identity only: DNS, HTTPS
hosting, Android certificate association and Mera sign-in are not yet verified.
Changing the relying party ID does not migrate existing passkeys.

After selecting a hosting provider, attach `flurbo.singu.online` as its custom
domain and add the exact DNS record that provider supplies (`flurbo` is the DNS
record name). Do not guess the CNAME target or IP address. Keep the association
file on this same HTTPS host, even if the site's deployment URL changes.

For local Metro and association generation in Git Bash:

```bash
export FLURBO_PASSKEY_RP_ID=flurbo.singu.online
```

Confirm `android.package` and `ios.bundleIdentifier` in `app.json` before signing
a build. Their current `dev.flurbo.preview` values are development placeholders.
The generator reads those values directly, avoiding a second copy of the app IDs.

## Generate the files locally

From `apps/mobile`, set these process environment variables to real values:

| Variable | Used by | Value |
| --- | --- | --- |
| `FLURBO_PASSKEY_RP_ID` | Both platforms and Expo configuration | Lowercase DNS host only, without `https://`, path or port |
| `FLURBO_ANDROID_CERT_SHA256` | Android generator | Comma-separated, colon-delimited SHA-256 fingerprints of the certificates signing the installed builds |
| `FLURBO_IOS_APP_ID_PREFIX` | iOS generator | Apple's ten-character application identifier prefix; normally the Team ID, but confirm against the signed app's `application-identifier` entitlement |

These are public identifiers, not private keys. Syntax checks cannot prove that
you own the host, that the signing identity is correct, or that the host is a
registrable domain. Get the actual signing fingerprint from the selected build;
do not substitute an upload-key fingerprint for a different installed-app signer.

Run only the generator for the platform you have configured:

```powershell
npm run passkeys:association -- android
# Or, for an iOS build:
npm run passkeys:association -- ios
```

Output is written under the ignored `dist-passkeys/<rpId>/<platform>/.well-known/`
directory. Review the JSON before publishing. Android outputs `assetlinks.json`;
iOS outputs `apple-app-site-association` without a file extension. Separate host
and platform directories keep earlier output from being mistaken for a new host's
files. Regeneration replaces that host/platform's output file.

Publish the file at `https://<rpId>/.well-known/<filename>`, publicly readable with
HTTP 200 and `Content-Type: application/json`, without redirects or login gates.
Preserve any existing associations on the host when merging these entries. This
command does not upload anything or modify the domain owner's existing files.
Android includes the credential-sharing and URL-handling relations documented by
[Android Credential Manager](https://developer.android.com/identity/credential-manager/prerequisites).
It does not add an Android deep-link intent filter to the app.

Expo consumes the same `FLURBO_PASSKEY_RP_ID` to expose `extra.passkeyRpId` and
add the iOS `webcredentials:<rpId>` associated-domain entitlement. The EAS profiles
now provide the selected host; set that same value in the local Metro environment.
Regenerate/rebuild the native app after changing associated domains. Signing
fingerprints and the Apple prefix are not included in Expo's public config.

## Native validation still required

Android is the selected first test platform, using an EAS cloud build. Account
login, project linking, EAS signing setup and preview installation are verified
by the user. That earlier preview did not verify passkey authentication; rebuild
when the selected host and certificate association are ready. Android local
builds would need an SDK/JDK. iOS local builds require a Mac with Xcode; EAS
internal iPhone distribution requires Apple provisioning and device registration.
See [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

After hosting and native signing are ready, integrate the
[Mera native client](https://github.com/category-labs/mera/blob/a3102f4fa7b89ce4e58e843a2d6da2201035ff25/docs/src/content/docs/recipes/use-mera-with-react-native.md),
then test creation, returning sign-in, PRF support, cancellation, recovery and
session expiry on the actual phone. A generated association file or successful
JavaScript export alone does not validate any of those flows.
