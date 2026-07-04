import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.songul.note',
  appName: 'SonGul',
  webDir: 'dist',
  server: {
    // https scheme keeps IndexedDB/PWA behavior; mixed content stays allowed so
    // the tablet can reach a plain-http feedback gateway on the LAN during testing
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
