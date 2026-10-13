# Flurbo for iOS and Android

The installed app is the website. It loads [flurbo.singu.online](https://flurbo.singu.online) in a native shell, so sign-in, markets, portfolio, funding and trading are the same pages as the site.

Passkeys stay on the website's relying party, `flurbo.singu.online`. Android turns on WebView passkeys for this app, which already shares credentials with the site through `/.well-known/assetlinks.json`. MetaMask is not a browser extension on a phone. Connect MetaMask opens the MetaMask app over WalletConnect and returns here, inside this shell and in the phone’s browser.

## Requirements

- Node 22 or newer.
- Android: Android Studio, with an emulator or a phone.
- iOS: a Mac with Xcode. The iOS project can be generated on Windows; it cannot be built there.

## Install on a phone

The app that goes on a phone is this shell. It opens `https://flurbo.singu.online`. Perpl orders and the phone MetaMask connection live in the website, so a build made before that website is deployed still shows the older site.

Android, from this computer:

```powershell
cd apps/native
npm ci
npx cap sync android
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:JAVA_OPTS = '-Djava.net.preferIPv4Stack=true'
cd android
.\gradlew.bat assembleDebug
```

The installable file is `apps/native/android/app/build/outputs/apk/debug/Flurbo.apk`.

On the phone, turn on Developer options and USB debugging, plug it in, and accept the computer. Then:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r apps\native\android\app\build\outputs\apk\debug\Flurbo.apk
```

If the phone is not plugged in, copy that APK onto the phone and open it. Android will ask you to allow installation from that source.

A debug install uses this computer’s debug certificate. Passkeys on the phone work after `config/mobile-passkeys.json` includes that certificate and the website is deployed. The release certificate is already listed there.

iOS needs a Mac. From `apps/native`, run `npx cap sync ios`, then `npx cap open ios`, and run the `App` target on a simulator or a phone from Xcode. Passkeys also need `FLURBO_IOS_TEAM_ID` set on the website host before that site is deployed.

## Run

```sh
cd apps/native
npm ci
npx cap sync
npx cap open android
```

On a Mac, `npx cap open ios` opens the Xcode project. Run it on a simulator or a phone from there.

`npx cap sync` copies the site address into the native projects. To point a build at a local website instead:

```sh
# The phone must be able to reach this address. Passkeys still require localhost or flurbo.singu.online.
FLURBO_NATIVE_SERVER_URL=http://10.0.2.2:18767 npx cap sync
```

PowerShell:

```powershell
$env:FLURBO_NATIVE_SERVER_URL = 'http://10.0.2.2:18767'
npx cap sync
```

`10.0.2.2` is the Android emulator's name for the computer running `npm run dev` in `apps/web`.

## Passkeys

Android passkeys work when the installed app is signed by a certificate listed in `config/mobile-passkeys.json`. The recorded fingerprint is the retired preview's release certificate. A debug build has a different certificate. Print it and add it beside the existing one, comma-separated, as `FLURBO_ANDROID_CERT_SHA256`, then deploy the website:

```sh
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
```

iOS passkeys need the Apple team id. Set `FLURBO_IOS_TEAM_ID` (ten letters or digits) on the website host and deploy. The site then serves `/.well-known/apple-app-site-association` for `dev.flurbo.preview`. The iOS project already asks for that association.

Mera needs a passkey provider that supports PRF. Google Password Manager does. A provider that does not will show the same error as on the website.

## MetaMask

Install the MetaMask app on the phone. Sign in with the passkey, then use Connect MetaMask. There is no MetaMask extension on a phone. The website opens the MetaMask app over WalletConnect, both inside this shell and in the phone’s own browser. On Android, the shell uses an Android intent so the WebView hands the connection to the MetaMask app and returns here. The website change has to be deployed before this works against the live site. Until then the rest of the site still loads.

Trading stays on Monad testnet. The app refuses a session that is not MetaMask on that chain.
