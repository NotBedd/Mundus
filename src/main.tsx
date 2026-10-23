import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './lib/storage.ts';
import {isAndroidNativeShell} from './lib/platform.ts';
import {initNativeSystemBarSync} from './lib/nativeSystemBars.ts';
import App from './App.tsx';
import './index.css';

// v0.8.5 tablet fix: tag the Android NATIVE shell so index.css can restrict
// the top safe-area chain to MainActivity's measured --mundus-safe-top only.
// The WebView's own env(safe-area-inset-top) (and Capacitor SystemBars' var)
// resolve to the statusBars|displayCutout union, which several OEM tablets
// inflate far beyond the real status bar — the double-height blank band.
// Desktop, iPad PWA and in-browser Android keep the default env() chain.
if (isAndroidNativeShell()) {
  document.documentElement.classList.add('mundus-native-android');
}

// v0.8.61: paint the system status bar in the app's theme colors (black in
// dark mode, white in light mode) instead of the fixed system gray, and keep
// it synced to every theme change (MutationObserver on the html class).
initNativeSystemBarSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA service worker (v0.7.96-iPad): app-shell offline caching for the
// hosted web build only. Deliberately skipped for Electron (custom app://
// protocol, files already on disk) and Capacitor native builds (Android/iOS
// bundles ship inside the app), so desktop/mobile installs behave unchanged.
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  window.location.protocol === 'https:' &&
  !(window as any).electronAPI?.isElectron &&
  !((window as any).Capacitor && (window as any).Capacitor.isNativePlatform?.())
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline caching unavailable (e.g. private-mode restrictions).
      // The app itself remains fully functional — non-fatal by design.
    });
  });
}
