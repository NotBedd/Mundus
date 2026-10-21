import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './lib/storage.ts';
import App from './App.tsx';
import './index.css';

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
