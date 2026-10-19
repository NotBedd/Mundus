package com.mundus.app;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * v0.7.94: tiny native bridge for the Android app.
 *
 * The Capacitor WebView cannot download blob: URLs (the standard
 * anchor-download fallback is silently ignored) and has no
 * showSaveFilePicker, so without this bridge the "Create backup" button in
 * Settings did nothing at all on Android. The web side hands the backup JSON
 * over as base64 and this class writes it into the public Downloads folder
 * (MediaStore on Android 10+, plain file below that), where every file
 * manager can reach it.
 *
 * Exposed to JS as window.MundusNative.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The Capacitor bridge is built inside super.onCreate(), so the
        // WebView is available here. Guard anyway for exotic failure modes.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().addJavascriptInterface(new MundusFileBridge(this), "MundusNative");
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Safety net: if the WebView instance was ever recreated the injected
        // interface would be gone; surface a visible error instead of silence.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript(
                "if(!window.MundusNative){window.MundusNative={saveBackupFile:function(){return JSON.stringify({ok:false,error:'bridge-restarting'});}};}",
                null);
        }
    }

    public static class MundusFileBridge {

        private final Context context;

        MundusFileBridge(Context context) {
            this.context = context;
        }

        /**
         * Saves a base64-encoded file into the public Downloads directory.
         *
         * @param fileName target file name, e.g. "Mundus_Backup_2026-10-19T....json"
         * @param base64   file content, base64 (optionally wrapped as a data: URL)
         * @return JSON string: {"ok":true,"path":"..."} or {"ok":false,"error":"..."}
         */
        @JavascriptInterface
        public String saveBackupFile(String fileName, String base64) {
            try {
                if (fileName == null || fileName.trim().isEmpty()) {
                    return jsonResult(false, "Missing file name");
                }
                String safeName = fileName.replaceAll("[^a-zA-Z0-9 ._()\\-]", "_");
                byte[] bytes = decodeBase64(base64);
                if (bytes == null || bytes.length == 0) {
                    return jsonResult(false, "Empty or invalid backup payload");
                }

                String savedAt = writePublic(bytes, safeName);
                if (savedAt != null) {
                    JSONObject out = new JSONObject();
                    out.put("ok", true);
                    out.put("path", savedAt);
                    return out.toString();
                }
                return jsonResult(false, "Could not write to the Downloads folder");
            } catch (Exception e) {
                return jsonResult(false, e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }

        /** Decodes plain base64 or a data: URL ("data:application/json;base64,..."). */
        private byte[] decodeBase64(String input) {
            if (input == null) return null;
            String payload = input;
            int comma = input.indexOf(',');
            if (input.startsWith("data:") && comma > 0) {
                payload = input.substring(comma + 1);
            }
            try {
                return Base64.decode(payload, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return null;
            }
        }

        /**
         * Android 10+ (API 29): insert into MediaStore.Downloads — no storage
         * permission required. Below API 29: write directly into the public
         * Downloads directory (works without permission on most OEM builds;
         * if the system denies it we fall back to the app's own external
         * files directory, which is still visible in the Files app).
         */
        private String writePublic(byte[] bytes, String fileName) {
            OutputStream os = null;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = context.getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) return null;
                    os = context.getContentResolver().openOutputStream(uri);
                    os.write(bytes);
                    os.flush();
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    context.getContentResolver().update(uri, values, null, null);
                    return Environment.DIRECTORY_DOWNLOADS + File.separator + fileName;
                }

                // Legacy path (API 24-28).
                File downloadsDir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                if (downloadsDir != null && !downloadsDir.exists()) downloadsDir.mkdirs();
                File target = new File(downloadsDir, fileName);
                boolean wrote = false;
                try {
                    os = new FileOutputStream(target);
                    os.write(bytes);
                    os.flush();
                    wrote = true;
                } catch (Exception denied) {
                    wrote = false;
                }
                if (!wrote) {
                    // App-visible fallback (no permission needed).
                    File appDir = context.getExternalFilesDir(null);
                    if (appDir == null) appDir = context.getFilesDir();
                    File appTarget = new File(appDir, fileName);
                    os = new FileOutputStream(appTarget);
                    os.write(bytes);
                    os.flush();
                    return appTarget.getAbsolutePath();
                }
                return target.getAbsolutePath();
            } catch (Exception e) {
                return null;
            } finally {
                if (os != null) {
                    try { os.close(); } catch (Exception ignored) {}
                }
            }
        }

        private String jsonResult(boolean ok, String error) {
            try {
                JSONObject out = new JSONObject();
                out.put("ok", ok);
                if (error != null) out.put("error", error);
                return out.toString();
            } catch (Exception e) {
                return ok ? "{\"ok\":true}" : "{\"ok\":false}";
            }
        }
    }
}
