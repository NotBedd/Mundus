// v0.8.61 — Android system bar ↔ app theme sync
// ---------------------------------------------------------------------
// The tablet report asked for the status bar background to follow the app's
// theme (black / white) instead of the fixed system gray. MainActivity's
// MundusNative.setSystemBarAppearance(isDark) paints the status + navigation
// bars and flips the icon contrast; this module keeps it in sync by watching
// the `dark` class on <html> (App.tsx toggles it, so every theme switch is
// covered without touching App.tsx).
import { isAndroidNativeShell } from './platform';

let installed = false;

export function initNativeSystemBarSync(): void {
  if (installed || typeof window === 'undefined') return;
  if (!isAndroidNativeShell()) return;
  const native = (window as unknown as Record<string, any>).MundusNative;
  if (!native || typeof native.setSystemBarAppearance !== 'function') return;
  installed = true;

  const sync = () => {
    try {
      const isDark = document.documentElement.classList.contains('dark');
      native.setSystemBarAppearance(isDark);
    } catch {
      // Cosmetic sync — never break the app over it.
    }
  };

  // Initial paint (launch may already be light-themed).
  sync();

  // Any later class change on <html> (theme toggle, settings import…).
  try {
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  } catch {
    // MutationObserver unavailable (ancient WebView) — the launch sync still ran.
  }
}
