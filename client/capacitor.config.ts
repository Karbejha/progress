import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'sy.gov.ports.daily',
  appName: 'منظومة الموانئ',
  webDir: 'out',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#05261e',
      style: 'DARK',
      overlaysWebView: false,
    },
    SplashScreen: {
      launchShowDuration: 2200,
      launchAutoHide: true,
      backgroundColor: '#05261e',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#d4af37',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
