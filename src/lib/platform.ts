/**
 * v0.7.94: lightweight runtime platform detection.
 *
 * The Android build runs the exact same web bundle inside the Capacitor
 * WebView, but several desktop features make no sense there:
 *   - Whistle STT  → every Android keyboard already has voice dictation.
 *   - Harper WASM  → every Android keyboard already has autocorrect.
 *   - Folder pickers / native save dialogs → the WebView has no
 *     showSaveFilePicker and cannot download blob: URLs (backups are handed
 *     to the native layer via the MundusNative JS interface instead).
 *
 * Detection strategy (most reliable first):
 *   1. Capacitor's `isNativePlatform()` + `getPlatform()` — the WebView
 *      always injects `window.Capacitor` before any app JS runs.
 *   2. Android in the user agent — covers the WebView even if the global
 *      were somehow unavailable, and a desktop browser never matches.
 */

let cached: boolean | null = null;

export const isAndroidApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (cached !== null) return cached;
  try {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
      const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
      cached = platform === 'android' || /android/i.test(navigator.userAgent || '');
      return cached;
    }
  } catch {
    // Fall through to the user agent check.
  }
  cached = /android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  return cached;
};
