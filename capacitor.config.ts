import type { CapacitorConfig } from '@capacitor/cli';

// Local feasibility identity. Store enrollment and a release identifier are pending.
const config = {
  appId: 'app.zeroxdmme.development',
  appName: '0xDMme',
  webDir: 'dist/mobile',
  loggingBehavior: 'none',
  android: {
    path: 'mobile/android',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    path: 'mobile/ios',
    webContentsDebuggingEnabled: false,
  },
  server: {
    hostname: 'localhost',
    iosScheme: 'capacitor',
    androidScheme: 'https',
  },
  // The production API needs explicit streaming/cancellation and private cookie
  // ownership. Do not globally patch fetch or expose a cookie API to bypass it.
  plugins: {
    Keyboard: { resize: 'none' },
    CapacitorHttp: { enabled: false },
    CapacitorCookies: { enabled: false },
  },
} satisfies CapacitorConfig;

export default config;
