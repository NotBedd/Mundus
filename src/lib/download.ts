// v0.8.61 — one shared delivery path for every generated file
// (DOCX / PDF / HTML / MD / .MUNDUS / JSON backups).
//
// WHY THIS EXISTS: inside the Android Capacitor WebView, anchor downloads of
// blob: URLs are SILENTLY IGNORED — every "Export as DOCX/PDF/…" button
// generated its file correctly and then threw it away, which the user saw as
// "export does nothing" on phones and tablets. On Android the bytes are now
// handed to the native layer (MundusNative.saveFile → public Downloads folder
// via MediaStore) and can be opened through MundusNative.viewFile (FileProvider
// + ACTION_VIEW). Desktop/browser/PWA/Electron keep the classic anchor
// download, byte-for-byte identical behavior to before.
import { isAndroidNativeShell } from './platform';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : '');
      };
      reader.onerror = () => reject(new Error('blob-read-failed'));
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

/** True when the native (Android) save bridge is available in this runtime. */
export function canUseNativeSave(): boolean {
  if (typeof window === 'undefined') return false;
  const native = (window as unknown as Record<string, any>).MundusNative;
  return !!(isAndroidNativeShell() && native && typeof native.saveFile === 'function');
}

export interface DownloadResult {
  ok: boolean;
  /** How the file was delivered (or why it failed). */
  method: 'native' | 'download' | 'failed';
  error?: string;
}

/**
 * Delivers a generated Blob to the user.
 *  - Android native app: written into the public Downloads folder via the
 *    MundusNative bridge (returns the saved path on success).
 *  - Everywhere else: classic anchor download (unchanged behavior).
 */
export async function downloadBlob(blob: Blob, fileName: string, mime?: string): Promise<DownloadResult> {
  const safeName = (fileName || 'download').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'download';
  const resolvedMime = mime || blob.type || 'application/octet-stream';

  if (canUseNativeSave()) {
    try {
      const native = (window as unknown as Record<string, any>).MundusNative;
      const b64 = await blobToBase64(blob);
      // Synchronous-by-design bridge (same pattern as saveBackupFile).
      const raw = native.saveFile(safeName, resolvedMime, b64);
      const parsed = JSON.parse(String(raw || '{}'));
      if (parsed && parsed.ok === true) {
        return { ok: true, method: 'native', error: typeof parsed.path === 'string' ? parsed.path : undefined };
      }
      // v0.8.62: the anchor fallback was a LIE inside the native shell —
      // the WebView silently ignores anchor downloads of blob: URLs, so
      // reporting ok:true after the native write refused only hid real
      // failures (storage-full, OEM MediaStore quirks) behind a success
      // toast with no file. Report the honest error so the toast shows it;
      // on the web the anchor path below still applies.
      console.error('[download] native save refused:', parsed?.error);
      return { ok: false, method: 'failed', error: parsed?.error || 'native-save-failed' };
    } catch (e) {
      console.error('[download] native save failed:', e);
      return { ok: false, method: 'failed', error: String(e) };
    }
  }

  const anchor = anchorDownload(blob, safeName);
  return anchor ? { ok: true, method: 'download' } : { ok: false, method: 'failed' };
}

function anchorDownload(blob: Blob, safeName: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error('[download] anchor download failed:', e);
    return false;
  }
}

/**
 * Opens a generated file in the platform viewer. On Android the blob is saved
 * into the app cache and opened through a FileProvider ACTION_VIEW intent
 * (PDF viewer, browser, Word…). On the web it opens a blob: URL in a new tab
 * (unchanged behavior).
 */
export async function openGeneratedFile(blob: Blob, fileName: string, mime: string): Promise<DownloadResult> {
  const safeName = (fileName || 'document').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  const resolvedMime = mime || blob.type || 'application/octet-stream';

  if (canUseNativeSave()) {
    const native = (window as unknown as Record<string, any>).MundusNative;
    if (native && typeof native.viewFile === 'function') {
      try {
        const b64 = await blobToBase64(blob);
        const raw = native.viewFile(safeName, resolvedMime, b64);
        const parsed = JSON.parse(String(raw || '{}'));
        if (parsed && parsed.ok === true) return { ok: true, method: 'native' };
        return { ok: false, method: 'failed', error: parsed?.error || 'view-failed' };
      } catch (e) {
        console.error('[download] native view failed:', e);
        return { ok: false, method: 'failed', error: String(e) };
      }
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: true, method: 'download' };
  } catch (e) {
    return { ok: false, method: 'failed', error: String(e) };
  }
}
