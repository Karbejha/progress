import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Initializes and enforces the mobile status bar appearance:
 * - Color: Royal Dark Green (#05261e) matching the Header identity
 * - Style: Style.Dark (Light/White icons and clock text on dark background)
 * - Browser/PWA: Dynamic <meta name="theme-color"> enforcement
 */
export async function initStatusBar(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Browser & PWA dynamic meta tag check
  try {
    let themeMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', '#05261e');
  } catch (e) {
    // Ignore DOM exception if any
  }

  // 2. Native Capacitor Status Bar enforcement
  if (Capacitor.isNativePlatform()) {
    try {
      // Style.Dark specifies light (white) text/icons for dark backgrounds
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#05261e' });
    } catch (err) {
      console.warn('Capacitor StatusBar configuration warning:', err);
    }
  }
}
