import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'sy.gov.ports.daily',
  appName: 'منظومة الموانئ',
  webDir: 'out',
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      backgroundColor: '#0c3e35',
      style: 'DARK',
      overlaysWebView: false,
    },
    SplashScreen: {
      launchShowDuration: 2200,
      launchAutoHide: true,
      backgroundColor: '#0c3e35',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#d4af37',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
