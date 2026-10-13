import type { CapacitorConfig } from '@capacitor/cli';

// The app is the website. Override only for a local dev server on the same machine.
const url = process.env.FLURBO_NATIVE_SERVER_URL || 'https://flurbo.singu.online';

const config: CapacitorConfig = {
  appId: 'dev.flurbo.preview',
  appName: 'Flurbo',
  webDir: 'www',
  appendUserAgent: 'FlurboNative',
  server: {
    url,
    androidScheme: 'https',
    cleartext: url.startsWith('http://'),
    allowNavigation: ['flurbo.singu.online'],
  },
  android: { backgroundColor: '#f5f4ec' },
  ios: { backgroundColor: '#f5f4ec', contentInset: 'never' },
  plugins: {
    SplashScreen: { launchAutoHide: true, backgroundColor: '#f5f4ec', showSpinner: false },
    SystemBars: { style: 'LIGHT', insetsHandling: 'css' },
  },
};

export default config;
