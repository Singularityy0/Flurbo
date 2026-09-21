# Native passkey domain setup

This prepares Mera's native domain association. It does not install Mera, enable
sign-in, generate keys, verify domain ownership, or establish PRF compatibility.
Keep the preview usable without a domain; its sign-in action remains disabled.

## Choose the identity before creating passkeys

Use a stable HTTPS host you control, including a delegated subdomain on your
friend's domain. Agree with the owner that you can keep serving its association
files. Hosting can be chosen later; do not use a disposable preview host for real
passkeys. Changing the relying party ID does not migrate existing passkeys.

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
add the iOS `webcredentials:<rpId>` associated-domain entitlement. Leave it unset
until the host is chosen. Set the same value in the native build environment and
Metro environment; an EAS cloud build will need it configured there separately.
Regenerate/rebuild the native app after changing associated domains. Signing
fingerprints and the Apple prefix are not included in Expo's public config.

## Native validation still required

Select Android or iPhone first. Android needs a local SDK/JDK and device or a
configured EAS account/build. iOS local builds require a Mac with Xcode; EAS
internal iPhone distribution requires Apple provisioning and device registration.
See [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

After hosting and native signing are ready, integrate the
[Mera native client](https://github.com/category-labs/mera/blob/a3102f4fa7b89ce4e58e843a2d6da2201035ff25/docs/src/content/docs/recipes/use-mera-with-react-native.md),
then test creation, returning sign-in, PRF support, cancellation, recovery and
session expiry on the actual phone. A generated association file or successful
JavaScript export alone does not validate any of those flows.
