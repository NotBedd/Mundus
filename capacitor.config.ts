import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mundus.app',
  appName: 'Mundus',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
