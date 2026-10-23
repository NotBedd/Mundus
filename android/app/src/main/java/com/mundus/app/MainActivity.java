package com.mundus.app;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowInsets;
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

    // v0.8.62: last appearance the web side asked for. Capacitor 8's built-in
    // SystemBars plugin repaints the decor view with the theme's
    // windowBackground on configuration changes (rotation, split-screen, uiMode
    // flips) — on tablets that decorated strip IS the visible "status bar
    // background" (the plugin pads the decor view by the status-bar inset on
    // devices without the WebView-140 passthrough), which is exactly the
    // "fixed gray bar" report. We re-assert OUR colors after every such change.
    private static boolean sLastDark = true;
    private static boolean sBarAppearanceKnown = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // v0.8.63 (MAXIMUM PRIORITY phone fix): Capacitor 8's SystemBars plugin
        // installs its own DECOR-VIEW insets listener during super.onCreate()
        // (bridge/plugin load). That listener starts in "no passthrough" mode:
        // it PADS the decor view by the status-bar height AND ZEROES the
        // insets handed to the WebView, until it has detected the page's
        // viewport-fit=cover meta (checked async on the first page commit).
        // Our safe-area publisher measures max(0, statusInset -
        // webViewTopOnScreen) — which correctly reports 0 while that padding
        // is active. When the plugin later flips to passthrough it removes the
        // padding and re-dispatches, and the padding removal / WebView
        // reposition race can land a 0 publish while the WebView is ALREADY
        // full-screen: no padding anywhere, app UI drawn behind the status bar
        // (v0.8.62 phone report; v0.8.62's extra setSystemBarsAppearance
        // calls on create/config/resume made the re-dispatch - and the race -
        // far more likely). The v0.8.6 geometry math is only as good as the
        // decor padding being stable — so we take the listener over:
        //   - the TOP is NEVER padded natively and the insets are NEVER
        //     zeroed — the app owns the top inset end-to-end via
        //     --mundus-safe-top (publish full inset when edge-to-edge, 0 when
        //     the window sits below an opaque bar),
        //   - left/right/bottom keep the plugin's per-WebView-version
        //     behavior exactly (modern WebViews consume env() in the page;
        //     old ones keep the native left/right/bottom padding),
        //   - the keyboard lift (decor bottom padding while the IME is up)
        //     is preserved on every device class.
        // Registered AFTER super.onCreate() so it replaces the plugin's
        // listener as the last one set on the decor view.
        takeOverDecorInsetsListener();
        // The Capacitor bridge is built inside super.onCreate(), so the
        // WebView is available here. Guard anyway for exotic failure modes.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().addJavascriptInterface(new MundusFileBridge(this), "MundusNative");
            applySafeAreaInsets();
        }
        // v0.8.62: paint the system bars to match the app theme right away
        // (default dark, refined by the JS sync as soon as the page is up), so
        // the launch frame never shows the theme's windowBackground gray.
        applySystemBarAppearance(sLastDark);
    }

    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Capacitor's SystemBars plugin re-runs its own style pass here and
        // repaints the decor view background. Re-assert the app's choice.
        if (sBarAppearanceKnown) {
            applySystemBarAppearance(sLastDark);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (sBarAppearanceKnown) {
            applySystemBarAppearance(sLastDark);
        }
        // Safety net: if the WebView instance was ever recreated the injected
        // interface would be gone; surface a visible error instead of silence.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript(
                "if(!window.MundusNative){window.MundusNative={saveBackupFile:function(){return JSON.stringify({ok:false,error:'bridge-restarting'});}};}",
                null);
        }
    }

    /**
     * v0.8.62: paints EVERY layer that can render as the "status bar
     * background" to match the app's in-app theme:
     *   - the status/navigation bar colors themselves (opaque-bar devices),
     *   - the icon contrast appearance (both devices),
     *   - the DECOR VIEW background — this is the one Capacitor 8's
     *     SystemBars plugin paints with the theme windowBackground (gray), and
     *     on Android-14-class tablets that padded strip is what the user sees
     *     around/behind the clock (the "fixed gray" from the report).
     * Called from the JS bridge (setSystemBarAppearance) and after
     * configuration changes so the choice always wins.
     */
    private void applySystemBarAppearance(final boolean isDark) {
        sLastDark = isDark;
        sBarAppearanceKnown = true;
        try {
            android.view.Window window = getWindow();
            int barColor = isDark ? android.graphics.Color.BLACK : android.graphics.Color.WHITE;
            window.setStatusBarColor(barColor);
            window.setNavigationBarColor(barColor);
            window.getDecorView().setBackgroundColor(barColor);
            android.view.View decor = window.getDecorView();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.view.WindowInsetsController controller = decor.getWindowInsetsController();
                if (controller != null) {
                    int appearance = isDark
                        ? 0
                        : android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    controller.setSystemBarsAppearance(
                        appearance,
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
                }
            } else {
                int vis = decor.getSystemUiVisibility();
                if (isDark) {
                    vis &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                } else {
                    vis |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                }
                decor.setSystemUiVisibility(vis);
            }
        } catch (Exception ignored) {
            // Cosmetic — never crash over it.
        }
    }

    /**
     * v0.8.63: replaces Capacitor 8's SystemBars decor listener (see the
     * onCreate note). Deterministic on every device class:
     *   edge-to-edge phone (Android 15+/16)  -> WebView top = 0, insets pass
     *                                           through -> full inset published
     *   opaque-bar tablet (window below bar) -> dispatched top inset is 0 (or
     *                                           subtracted via webViewTop)
     *                                           -> 0 published, exactly the
     *                                           approved v0.8.62 behavior
     *   keyboard visible                     -> decor bottom padded by the IME
     *                                           inset (Capacitor behavior kept)
     */
    private void takeOverDecorInsetsListener() {
        try {
            // Effectively-final snapshot for the lambda below.
            int wv = webViewMajorVersion();
            final int webViewMajor = wv;
            android.view.View decor = getWindow().getDecorView();
            decor.setOnApplyWindowInsetsListener((v, insets) -> {
                try {
                    androidx.core.view.WindowInsetsCompat compat =
                        androidx.core.view.WindowInsetsCompat.toWindowInsetsCompat(insets);
                    boolean keyboardVisible = compat.isVisible(
                        androidx.core.view.WindowInsetsCompat.Type.ime());
                    androidx.core.graphics.Insets imeInsets = compat.getInsets(
                        androidx.core.view.WindowInsetsCompat.Type.ime());
                    if (webViewMajor >= 140) {
                        // Modern WebView: the page consumes env(safe-area-inset-*)
                        // itself (viewport-fit=cover), so the decor stays
                        // untouched except for the keyboard lift.
                        v.setPadding(0, 0, 0, keyboardVisible ? imeInsets.bottom : 0);
                    } else {
                        // Older WebView: env() stays empty, so left/right/bottom
                        // occlusion must still be padded natively (the plugin's
                        // non-passthrough behavior). The TOP stays unpadded —
                        // the app pads it via --mundus-safe-top, which is only
                        // correct because the true insets below are NOT zeroed.
                        androidx.core.graphics.Insets systemBars = compat.getInsets(
                            androidx.core.view.WindowInsetsCompat.Type.systemBars()
                                | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
                        v.setPadding(systemBars.left, 0, systemBars.right,
                            keyboardVisible ? imeInsets.bottom : systemBars.bottom);
                    }
                } catch (Exception ignored) {
                    // Padding cosmetics must never break inset dispatch.
                }
                return insets; // TRUE insets reach the WebView — never zeroed.
            });
        } catch (Exception ignored) {
            // Decor unavailable (exotic) — the previous behavior remains.
        }
    }

    /**
     * Major version of the system WebView, mirroring the SystemBars plugin's
     * passthrough threshold (140). androidx.webkit is a library-scoped
     * dependency (not on this module's compile classpath), so the platform
     * WebView.getCurrentWebViewPackage() (API 26+) is used instead; anything
     * older or unresolvable counts as "old" and keeps the conservative
     * native padding path.
     */
    private static int sWebViewMajorVersion = -1;

    private int webViewMajorVersion() {
        if (sWebViewMajorVersion >= 0) return sWebViewMajorVersion;
        int major = 0;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.content.pm.PackageInfo info =
                    android.webkit.WebView.getCurrentWebViewPackage();
                if (info != null && info.versionName != null) {
                    major = Integer.parseInt(info.versionName.split("\\.")[0]);
                }
            }
        } catch (Exception ignored) {
            major = 0;
        }
        sWebViewMajorVersion = major;
        return major;
    }

    /**
     * v0.8.1: keep app content below the Android status bar.
     *
     * The app draws edge-to-edge (viewport-fit=cover, and Android 15+ forces
     * edge-to-edge anyway), which the WebView on Android does not translate
     * into the CSS env(safe-area-inset-top) variable — content rendered
     * behind the status bar. The status bar area itself is still great for
     * the bottom edge (home indicator), so ONLY the top inset is bridged:
     * this listener measures the real top inset and publishes it to the page
     * as the CSS custom property '--mundus-safe-top'. index.css pads the app
     * shell with it, so iPad PWA behavior is unchanged and Android now gets
     * the same protection.
     *
     * v0.8.2 FIX: v0.8.1 published the inset in RAW DEVICE PIXELS, but CSS
     * px inside the WebView are DENSITY-INDEPENDENT px. On a 3.5x-density
     * phone the status bar (~132 device px) was published as "132px" CSS =
     * 462 device px of padding — the huge blank band that compressed every
     * mode UI. The inset is now divided by the display density before it is
     * published, so the padding equals exactly one status bar.
     *
     * v0.8.5 FIX (tablet): the measured type was the UNION of statusBars()
     * and displayCutout(). Several OEM tablets (Honor/Huawei pads in
     * particular) report displayCutout().top far beyond the status bar in
     * portrait. Measuring statusBars() alone cannot be inflated by cutout
     * bounds; the web side additionally restricts the native padding chain
     * to this variable only (html.mundus-native-android).
     *
     * v0.8.6 FIX (tablet, MAXIMUM PRIORITY): publishing the raw status-bar
     * inset is only correct when the WebView actually draws BEHIND the
     * status bar. That is true on Android 15+ (edge-to-edge enforced), but
     * NOT on many tablets / older OEM builds, where the system draws an
     * opaque status bar AND positions the window below it — the inset is
     * still DISPATCHED to the app even though the WebView's content area
     * already starts under it. Publishing it raw made the page pad an
     * already-clear strip: measured on a 2944x1840 pad, an 83 px system bar
     * followed by ~100 px of pure app-background black before the first UI
     * element (the "big black bar" user screenshot).
     *
     * The published value is therefore grounded in real screen geometry:
     *
     *     padding = max(0, statusBarInset - webViewTopOnScreen)
     *
     * which is correct in EVERY arrangement:
     *   window below the status bar   -> WebView top = inset -> padding 0
     *   true edge-to-edge (Android 15) -> WebView top = 0   -> full inset
     *   partial translucency           -> exactly the uncovered remainder
     * Recomputed on every insets dispatch AND every WebView layout change
     * (rotation, split-screen, system bars show/hide), with a dedupe guard
     * so unchanged values generate no JavaScript traffic.
     */
    private void applySafeAreaInsets() {
        final android.webkit.WebView webView = bridge.getWebView();
        final float density = getResources().getDisplayMetrics().density;
        // Last measured raw status-bar top inset in DEVICE px (before the
        // position correction). Integer.MIN_VALUE = "listener has not run yet".
        final int[] lastInsetDevice = {Integer.MIN_VALUE};
        // Last value actually published to the page (CSS px), for dedupe.
        final int[] lastPublishedCss = {Integer.MIN_VALUE};

        webView.setOnApplyWindowInsetsListener((v, insets) -> {
            lastInsetDevice[0] = measureStatusBarTopDevice(webView, insets);
            publishNeededSafeTop(webView, lastInsetDevice[0], density, lastPublishedCss, false);
            return insets; // never consume — Capacitor's own dispatch continues
        });

        // v0.8.6: any layout change (rotation, split-screen, system bar
        // show/hide, Capacitor margin application on other builds) can move
        // the WebView on screen — recompute so the published padding always
        // reflects the CURRENT gap, not the one measured at dispatch time.
        webView.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, oright, obottom) ->
            publishNeededSafeTop(webView,
                lastInsetDevice[0] != Integer.MIN_VALUE ? lastInsetDevice[0] : 0,
                density, lastPublishedCss, false));

        // Early fallback: publish the resource-based status bar height right
        // away (the insets listener refines it as soon as the system dispatches).
        final int fallbackDevice = fallbackStatusBarHeightDevice();
        publishNeededSafeTop(webView, fallbackDevice, density, lastPublishedCss, true);
        // Re-publish shortly after the first page commit — the very first
        // evaluateJavascript can race the document's creation, so these two
        // retries are FORCED (they bypass the dedupe guard) and reuse the
        // last measured inset; the position correction inside
        // publishNeededSafeTop always uses the WebView's CURRENT screen top.
        webView.postDelayed(() -> publishNeededSafeTop(webView,
            lastInsetDevice[0] != Integer.MIN_VALUE ? lastInsetDevice[0] : fallbackDevice,
            density, lastPublishedCss, true), 600);
        webView.postDelayed(() -> publishNeededSafeTop(webView,
            lastInsetDevice[0] != Integer.MIN_VALUE ? lastInsetDevice[0] : fallbackDevice,
            density, lastPublishedCss, true), 1800);
    }

    /** Raw top inset of the status bar in DEVICE px, from the resource estimate. */
    private int fallbackStatusBarHeightDevice() {
        try {
            int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (resId > 0) return getResources().getDimensionPixelSize(resId);
        } catch (Exception ignored) {
            // Resource unavailable — fall back to 0.
        }
        return 0;
    }

    /**
     * Raw top status-bar occlusion in DEVICE px. v0.8.61 HARDENING: several
     * devices do NOT report their status bar through
     * WindowInsets.Type.statusBars() on the dispatched insets — common OEM
     * quirks include reporting the occlusion ONLY as a displayCutout inset
     * (cutout living inside the status bar) or a parent view consuming the
     * statusBars type before the WebView sees it. v0.8.5's statusBars()-only
     * measurement made those devices publish 0 → the app drew behind the
     * status bar (user phone screenshot). The measurement now:
     *   1. trusts statusBars() when it reports a positive value (fixes the
     *      OEM tablets whose displayCutout is inflated far beyond the bar),
     *   2. otherwise falls back to the cutout top, bounded by 2× the resource
     *      status-bar height so cutout inflation cannot resurface, and
     *   3. additionally re-reads the ROOT window insets when the dispatched
     *      ones carry neither value (root insets are never consumed).
     * The geometry subtraction in publishNeededSafeTop still converts any of
     * these into the padding the page actually needs.
     */
    private int measureStatusBarTopDevice(final android.webkit.WebView webView, WindowInsets insets) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                int statusBar = insets.getInsets(WindowInsets.Type.statusBars()).top;
                int cutout = 0;
                android.view.DisplayCutout cut = insets.getDisplayCutout();
                if (cut != null) cutout = cut.getSafeInsetTop();
                if (statusBar == 0) {
                    // Dispatched insets carry no status bar — re-read from the
                    // window ROOT insets (immune to parent consumption).
                    try {
                        WindowInsets root = webView != null ? webView.getRootWindowInsets() : null;
                        if (root != null) {
                            statusBar = root.getInsets(WindowInsets.Type.statusBars()).top;
                            if (cutout == 0) {
                                android.view.DisplayCutout rootCut = root.getDisplayCutout();
                                if (rootCut != null) cutout = rootCut.getSafeInsetTop();
                            }
                        }
                    } catch (Exception ignored) {
                        // Root insets unavailable — dispatched values stand.
                    }
                }
                if (statusBar > 0) return statusBar;
                if (cutout > 0) {
                    int resBar = fallbackStatusBarHeightDevice();
                    if (resBar > 0) cutout = Math.min(cutout, 2 * resBar);
                    return cutout;
                }
                return 0;
            }
            return insets.getSystemWindowInsetTop();
        } catch (Exception ignored) {
            return 0;
        }
    }

    /**
     * v0.8.6 CORE: converts the raw status-bar inset into the padding the
     * page actually needs, subtracting whatever the window layout has
     * already handled. See the v0.8.6 note on {@link #applySafeAreaInsets}.
     */
    private void publishNeededSafeTop(final android.webkit.WebView webView, final int statusBarTopDevice,
                                      final float density, final int[] lastPublishedCss, final boolean force) {
        if (webView == null) return;
        int needed = Math.max(0, statusBarTopDevice);
        try {
            int[] loc = new int[2];
            webView.getLocationOnScreen(loc);
            needed = Math.max(0, statusBarTopDevice - loc[1]);
        } catch (Exception ignored) {
            // Geometry unavailable (view not attached yet) — the raw inset is
            // the best estimate; the layout listener and delayed retries
            // refine it as soon as the view is placed on screen.
        }
        final int css = deviceToCssPx(needed, density);
        if (!force && css == lastPublishedCss[0]) return;
        lastPublishedCss[0] = css;
        publishSafeTop(webView, css);
    }

    /** Converts a device-pixel inset into WebView CSS pixels (density-independent). */
    private static int deviceToCssPx(int devicePx, float density) {
        if (devicePx <= 0 || density <= 0f) return 0;
        return Math.max(0, Math.round(devicePx / density));
    }

    private void publishSafeTop(final android.webkit.WebView webView, final int topPx) {
        if (webView == null) return;
        webView.post(() -> {
            try {
                webView.evaluateJavascript(
                    "(function(){try{document.documentElement&&document.documentElement.style.setProperty('--mundus-safe-top','"
                        + topPx + "px');}catch(e){}})();",
                    null);
            } catch (Exception ignored) {
                // WebView not ready — the insets listener will retry.
            }
        });
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

                String savedAt = writePublic(bytes, safeName, "application/json");
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

        /**
         * v0.8.61: generic file delivery for the export pipeline (DOCX, PDF,
         * HTML, Markdown, .mundus, EPUB…). Saves into the public Downloads
         * directory with the caller's MIME type — the Android WebView silently
         * ignores anchor downloads of blob: URLs, so this bridge is what makes
         * every "Export" button actually deliver its file.
         *
         * @param fileName target file name, e.g. "Export_sample.docx"
         * @param mime     MIME type, e.g. "application/pdf" (never null/empty)
         * @param base64   file content, base64
         * @return JSON string: {"ok":true,"path":"..."} or {"ok":false,"error":"..."}
         */
        @JavascriptInterface
        public String saveFile(String fileName, String mime, String base64) {
            try {
                if (fileName == null || fileName.trim().isEmpty()) {
                    return jsonResult(false, "Missing file name");
                }
                String safeName = fileName.replaceAll("[^a-zA-Z0-9 ._()\\-]", "_");
                byte[] bytes = decodeBase64(base64);
                if (bytes == null || bytes.length == 0) {
                    return jsonResult(false, "Empty or invalid payload");
                }
                String mimeType = (mime == null || mime.trim().isEmpty())
                    ? "application/octet-stream" : mime.trim();
                String savedAt = writePublic(bytes, safeName, mimeType);
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

        /**
         * v0.8.61: opens a generated file in the system viewer (PDF reader,
         * Word, browser…). The bytes are written into the app cache and shared
         * through the FileProvider declared in AndroidManifest.xml, so no
         * storage permission is needed and the file stays private.
         *
         * @return JSON string: {"ok":true} or {"ok":false,"error":"..."}
         */
        @JavascriptInterface
        public String viewFile(String fileName, String mime, String base64) {
            FileOutputStream fos = null;
            try {
                if (fileName == null || fileName.trim().isEmpty()) {
                    return jsonResult(false, "Missing file name");
                }
                String safeName = fileName.replaceAll("[^a-zA-Z0-9 ._()\\-]", "_");
                byte[] bytes = decodeBase64(base64);
                if (bytes == null || bytes.length == 0) {
                    return jsonResult(false, "Empty or invalid payload");
                }
                File dir = new File(context.getCacheDir(), "exports");
                if (!dir.exists()) dir.mkdirs();
                File target = new File(dir, safeName);
                fos = new FileOutputStream(target);
                fos.write(bytes);
                fos.flush();
                String mimeType = (mime == null || mime.trim().isEmpty())
                    ? "application/octet-stream" : mime.trim();
                Uri uri = androidx.core.content.FileProvider.getUriForFile(
                    context, context.getPackageName() + ".fileprovider", target);
                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                intent.setDataAndType(uri, mimeType);
                intent.addFlags(
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                return jsonResult(true, null);
            } catch (android.content.ActivityNotFoundException e) {
                return jsonResult(false, "No installed app can open this file type");
            } catch (Exception e) {
                return jsonResult(false, e.getMessage() == null ? e.toString() : e.getMessage());
            } finally {
                if (fos != null) {
                    try { fos.close(); } catch (Exception ignored) {}
                }
            }
        }

        /**
         * v0.8.61: syncs the SYSTEM status bar (and navigation bar) with the
         * app's in-app theme — black bar + light icons in dark mode, white bar
         * + dark icons in light mode. Replaces the fixed system gray the
         * tablet report showed; the web side calls it on theme changes via
         * src/lib/nativeSystemBars.ts.
         * v0.8.62: the actual painting moved into
         * {@link MainActivity#applySystemBarAppearance} which ALSO paints the
         * decor view background (the strip Capacitor's SystemBars plugin fills
         * with the theme windowBackground gray on tablets) and re-asserts on
         * configuration changes. This bridge method delegates to it.
         */
        @JavascriptInterface
        public void setSystemBarAppearance(final boolean isDark) {
            android.app.Activity activity = context instanceof android.app.Activity
                ? (android.app.Activity) context : null;
            if (activity == null) return;
            activity.runOnUiThread(() -> {
                if (activity instanceof MainActivity) {
                    ((MainActivity) activity).applySystemBarAppearance(isDark);
                } else {
                    applySystemBarAppearanceStandalone(activity, isDark);
                }
            });
        }

        /** Fallback painting when the context is not our MainActivity. */
        private void applySystemBarAppearanceStandalone(android.app.Activity activity, boolean isDark) {
            try {
                android.view.Window window = activity.getWindow();
                int barColor = isDark ? android.graphics.Color.BLACK : android.graphics.Color.WHITE;
                window.setStatusBarColor(barColor);
                window.setNavigationBarColor(barColor);
                window.getDecorView().setBackgroundColor(barColor);
                android.view.View decor = window.getDecorView();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.view.WindowInsetsController controller = decor.getWindowInsetsController();
                    if (controller != null) {
                        int appearance = isDark
                            ? 0
                            : android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS;
                        controller.setSystemBarsAppearance(
                            appearance,
                            android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
                    }
                } else {
                    int vis = decor.getSystemUiVisibility();
                    if (isDark) {
                        vis &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    } else {
                        vis |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    }
                    decor.setSystemUiVisibility(vis);
                }
            } catch (Exception ignored) {
                // Cosmetic — never crash the bridge.
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
            return writePublic(bytes, fileName, "application/json");
        }

        /** Android 10+ (API 29): insert into MediaStore.Downloads — no storage
         * permission required. Below API 29: write directly into the public
         * Downloads directory (works without permission on most OEM builds;
         * if the system denies it we fall back to the app's own external
         * files directory, which is still visible in the Files app).
         * v0.8.61: MIME type is a parameter (generic exports, not just JSON). */
        private String writePublic(byte[] bytes, String fileName, String mimeType) {
            OutputStream os = null;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
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
