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
        // v0.8.64 (tablet hotfix 2): rotation / fold / uiMode flips change the
        // window height. The keyboard-closed baseline used by the OEM-resize
        // detection must be re-learned for the new geometry, otherwise a large
        // orientation delta would be misread as an OEM IME window resize.
        sNoImeRootHeight = 0;
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
     * v0.8.64 (tablet hotfix 4): the IME inset is CONSUMED for children — the
     * decor padding is the single keyboard lift on every device class (see
     * the return-site comment for the double-lift root cause).
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
                    // v0.8.64 (tablet hotfix): cross-check the reported IME inset
                    // against the REAL hidden region measured from the window's
                    // visible display frame (frame.bottom = keyboard top when the
                    // IME is up). The user's 2944x1840 OEM pad reports/lifts ~2x
                    // the real keyboard height (same OEM inset inflation as the
                    // v0.8.5 status-bar report) which crushed the WebView and
                    // painted a huge black decor strip above the keyboard. The
                    // frame is only trusted when it clearly excludes a hidden
                    // region; otherwise today's behavior is kept untouched.
                    //
                    // v0.8.64 (tablet hotfix 2 — the black bar STILL showed on
                    // the user's pad after hotfix 1): hotfix 1 only guards the
                    // INFLATED-REPORT case. Two more OEM behaviors defeat it:
                    //   (a) the pad's OWN window resize for the IME (its
                    //       framework shrinks the window to the keyboard top,
                    //       classic adjustResize) while our decor padding ALSO
                    //       applies — a double lift. Inside the already-resized
                    //       window the visible frame excludes nothing, so the
                    //       cross-check below AND the old trim both bail out
                    //       and the double lift becomes permanent.
                    //   (b) a LATE window resize landing after the one-shot
                    //       post-layout trim already ran — nothing re-checks.
                    // Grounded fix: remember the window height with the
                    // keyboard CLOSED. While the IME is up, a window that
                    // shrank by more than a nav-bar-sized threshold means the
                    // framework ALREADY did the lift — our padding must be 0.
                    // Otherwise the frame cross-check stays authoritative.
                    int imeBottom = imeInsets.bottom;
                    if (keyboardVisible) {
                        try {
                            int rootHeight = v.getRootView().getHeight();
                            boolean oemResizedWindow = sNoImeRootHeight > 0 && rootHeight > 0
                                && rootHeight <= sNoImeRootHeight - Math.max(24, sNoImeRootHeight / 25);
                            if (oemResizedWindow) {
                                // OEM framework lifted the content itself —
                                // any decor padding here would double it.
                                imeBottom = 0;
                                // v0.8.64 (tablet hotfix 3): anomaly telemetry
                                // (first hit per process — also identifies
                                // devices where the OEM resizes the window).
                                if (!sGroundedLogged) {
                                    sGroundedLogged = true;
                                    MundusImeDebug.record(v.getContext(), "oem-resize-grounded",
                                        "win=" + rootHeight + " base=" + sNoImeRootHeight);
                                }
                            } else {
                                android.graphics.Rect frame = new android.graphics.Rect();
                                v.getWindowVisibleDisplayFrame(frame);
                                int hidden = rootHeight - frame.bottom;
                                if (frame.bottom > 0 && hidden > 0
                                    && frame.bottom <= rootHeight - rootHeight / 20
                                    && hidden < imeBottom) {
                                    imeBottom = hidden;
                                }
                            }
                        } catch (Exception ignored) {
                            // Keep the reported inset on any measuring hiccup.
                        }
                        // v0.8.64 (tablet hotfix 3): OEM unit-error guard.
                        // Honor/MagicOS-class pads (density 2.0) report the IME
                        // inset scaled by the display density for edge-to-edge
                        // windows: the user's 2944x1840 pad reports ~1316 for a
                        // ~658px keyboard (2.0x), pushing the WebView above the
                        // keyboard and painting the huge black decor strip.
                        // Under edge-to-edge (targetSdk 35+) the window never
                        // resizes and the visible display frame excludes
                        // nothing, so the grounding and the frame cross-check
                        // above both bail and the bogus value is applied
                        // verbatim — which is exactly why hotfixes 1 and 2
                        // changed nothing on that pad (screenshots pixel-
                        // identical). No docked software keyboard ever covers
                        // more than ~55% of any window on any form factor, so
                        // a larger report is provably bogus: undo the unit
                        // error by dividing by the density (1316/2.0 = 658,
                        // exactly the real keyboard) and cap at half the
                        // window as a last resort. Correct devices report
                        // < 50% and are never touched (phones/desktop keep
                        // today's behavior bit-for-bit).
                        try {
                            int windowH = v.getRootView().getHeight();
                            if (windowH > 0 && imeBottom * 100L > windowH * 58L) {
                                float density = getResources().getDisplayMetrics().density;
                                int corrected = Math.round(imeBottom / Math.max(1f, density));
                                int half = windowH / 2;
                                if (corrected <= 0 || corrected >= imeBottom
                                    || corrected * 100L > windowH * 50L) {
                                    imeBottom = half;
                                } else {
                                    imeBottom = corrected;
                                }
                                android.util.Log.w("MundusIME",
                                    "IME inset density-inflated (rep=" + imeInsets.bottom
                                        + " win=" + windowH + ") -> applied " + imeBottom);
                                MundusImeDebug.record(v.getContext(), "inflation-corrected",
                                    "win=" + windowH + " base=" + sNoImeRootHeight
                                        + " rep=" + imeInsets.bottom
                                        + " applied=" + imeBottom + " d=" + density);
                            }
                        } catch (Exception ignored) {
                            // The guard only refines a cosmetic padding value.
                        }
                        // v0.8.64 (tablet hotfix 4): one-shot per-process proof
                        // line in Download/mundus_ime_debug.txt — identifies this
                        // build on the device and records the REAL numbers
                        // (window height, keyboard-closed baseline, reported vs
                        // applied inset) without needing adb.
                        if (!sHotfix4Logged) {
                            sHotfix4Logged = true;
                            MundusImeDebug.record(v.getContext(), "hotfix4-lift",
                                "win=" + v.getRootView().getHeight()
                                    + " base=" + sNoImeRootHeight
                                    + " reported=" + imeInsets.bottom
                                    + " applied=" + imeBottom);
                        }
                    } else {
                        // Keyboard closed: (re)learn the full-height baseline
                        // so the next IME-open dispatch can detect an OEM
                        // window resize, and stop any pending convergence
                        // steps from the previous IME session.
                        try {
                            int rootHeightNow = v.getRootView().getHeight();
                            if (rootHeightNow > 0) sNoImeRootHeight = rootHeightNow;
                        } catch (Exception ignored) {
                            // Baseline is a best-effort hint only.
                        }
                        stopKeyboardLiftPoll(v);
                    }
                    if (webViewMajor >= 140) {
                        // Modern WebView: the page consumes env(safe-area-inset-*)
                        // itself (viewport-fit=cover), so the decor stays
                        // untouched except for the keyboard lift.
                        v.setPadding(0, 0, 0, keyboardVisible ? imeBottom : 0);
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
                            keyboardVisible ? imeBottom : systemBars.bottom);
                    }
                    // v0.8.64 (tablet hotfix 2): keep converging the lift to
                    // the REAL keyboard for a short window after every
                    // dispatch. The single-shot post-layout trim of hotfix 1
                    // could run mid-animation or before a late OEM window
                    // resize and then never re-run; a short poll survives
                    // both and corrects over- AND under-lifts.
                    if (keyboardVisible) {
                        armKeyboardLiftPoll(v);
                    }
                } catch (Exception ignored) {
                    // Padding cosmetics must never break inset dispatch.
                }
                // v0.8.64 (tablet hotfix 4 — ROOT CAUSE FIX): the decor padding
                // above is THE keyboard lift. The IME inset must NOT also reach
                // the WebView: modern Chromium WebViews translate ime() insets
                // they receive into their OWN in-page viewport shrink (WebView's
                // default keyboard behavior — active on the user's pad). With
                // true insets passed through, the pad applied the lift TWICE:
                // page = screen - 2x keyboard, with a background gap exactly one
                // keyboard tall between the squeezed page and the keyboard
                // (black in Writing Mode, white in light pages) — exactly the
                // five user screenshots, and exactly why hotfixes 1-3 (which
                // only reshaped the PADDING value and kept passing true insets)
                // changed nothing on that device. Old WebViews ignore ime()
                // insets entirely (the working phone), so consuming them here
                // is a no-op there: the decor padding remains the one and only
                // lift on every device class. The WebView's own listener still
                // receives statusBars/cutout (safe-top publishing unaffected),
                // and the grounding/poll logic above reads ROOT insets, which
                // are never consumed — keyboard detection stays truthful.
                try {
                    androidx.core.view.WindowInsetsCompat dispatchCompat =
                        androidx.core.view.WindowInsetsCompat.toWindowInsetsCompat(insets);
                    android.view.WindowInsets forChildren =
                        new androidx.core.view.WindowInsetsCompat.Builder(dispatchCompat)
                            .setInsets(androidx.core.view.WindowInsetsCompat.Type.ime(),
                                androidx.core.graphics.Insets.of(0, 0, 0, 0))
                            .build()
                            .toWindowInsets();
                    if (forChildren != null) {
                        return forChildren;
                    }
                } catch (Exception ignored) {
                    // Never break inset dispatch over the consumption step.
                }
                return insets; // Fallback: previous pass-through behavior.
            });
        } catch (Exception ignored) {
            // Decor unavailable (exotic) — the previous behavior remains.
        }
    }

    /**
     * v0.8.64 (tablet hotfix 2): window height last measured with the IME
     * CLOSED. 0 = baseline unknown (fresh process, configuration change, or
     * an IME that was already up at launch) — OEM-resize detection is then
     * skipped and hotfix 1's frame cross-check stays the only authority.
     */
    private int sNoImeRootHeight = 0;

    /** v0.8.64 (tablet hotfix 3): one-shot flag for oem-resize-grounded telemetry. */
    private static boolean sGroundedLogged = false;

    /** v0.8.64 (tablet hotfix 4): one-shot flag for the hotfix4 proof line. */
    private static boolean sHotfix4Logged = false;

    /** One convergence step pending at a time; each dispatch re-arms the budget. */
    private boolean sLiftPollScheduled = false;
    private int sLiftPollTicksLeft = 0;
    private static final long LIFT_POLL_INTERVAL_MS = 120;
    private static final int LIFT_POLL_MAX_TICKS = 10;
    private final Runnable sLiftPollStep = this::stepKeyboardLiftPoll;

    /**
     * v0.8.64 (tablet hotfix 2): replaces hotfix 1's single-shot post-layout
     * trim. Every IME-visible dispatch (re)arms a short poll that keeps
     * re-measuring the real keyboard geometry while insets animations and any
     * late OEM window resize settle, then nudges the decor bottom padding to
     * the measured target — in BOTH directions (hotfix 1 could only trim):
     *   - the window shrank while the IME is up (the OEM does its own
     *     adjustResize) -> our padding must be 0 or it is a double lift;
     *   - the visible frame excludes a plausible keyboard region
     *     (>= 1/6 of the window, < full window) -> the WebView must end
     *     exactly at frame.bottom (fixes over- and under-lift alike);
     *   - nothing trustworthy -> keep the padding the instant path chose.
     * Well-behaved phones converge on the first tick with target == the
     * already-applied inset, i.e. a no-op — phone behavior is unchanged.
     */
    private void armKeyboardLiftPoll(final android.view.View decor) {
        sLiftPollTicksLeft = LIFT_POLL_MAX_TICKS;
        if (sLiftPollScheduled) return;
        sLiftPollScheduled = true;
        decor.postDelayed(sLiftPollStep, LIFT_POLL_INTERVAL_MS);
    }

    /** Cancels pending convergence steps (keyboard closed again). */
    private void stopKeyboardLiftPoll(final android.view.View decor) {
        sLiftPollTicksLeft = 0;
        if (sLiftPollScheduled) {
            sLiftPollScheduled = false;
            decor.removeCallbacks(sLiftPollStep);
        }
    }

    private void stepKeyboardLiftPoll() {
        sLiftPollScheduled = false;
        try {
            android.view.View decor = getWindow().getDecorView();
            android.view.WindowInsets rootInsets = decor.getRootWindowInsets();
            if (rootInsets == null) return;
            androidx.core.view.WindowInsetsCompat compat =
                androidx.core.view.WindowInsetsCompat.toWindowInsetsCompat(rootInsets);
            // Keyboard may have closed between arming and this step.
            if (!compat.isVisible(androidx.core.view.WindowInsetsCompat.Type.ime())) return;

            int windowH = decor.getRootView().getHeight();
            int current = decor.getPaddingBottom();
            // No trustworthy source -> keep the instant path's choice.
            int target = current;
            if (sNoImeRootHeight > 0 && windowH > 0
                && windowH <= sNoImeRootHeight - Math.max(24, sNoImeRootHeight / 25)) {
                // The OEM framework resized the window for the IME itself;
                // any remaining decor padding is a double lift.
                target = 0;
            } else {
                // Real keyboard top from the visible display frame (the
                // classic, battle-tested keyboard-height source). When the
                // IME is up, frame.bottom IS the top edge of the keyboard.
                android.graphics.Rect frame = new android.graphics.Rect();
                decor.getWindowVisibleDisplayFrame(frame);
                int hidden = windowH - frame.bottom;
                // Trust the frame only when it excludes a keyboard-sized
                // region: >= 1/6 of the window (no real docked keyboard is
                // smaller) and clearly short of the full window.
                if (frame.bottom > 0 && hidden >= windowH / 6
                    && frame.bottom <= windowH - windowH / 20) {
                    target = hidden;
                }
            }
            int tolerance = Math.max(24, windowH / 100);
            if (Math.abs(current - target) > tolerance) {
                decor.setPadding(decor.getPaddingLeft(), decor.getPaddingTop(),
                    decor.getPaddingRight(), target);
                // v0.8.64 (tablet hotfix 3): log only substantial corrections
                // (>= 10% of the window) — correct devices converge with
                // target == current on the first tick and stay silent.
                if (Math.abs(current - target) > windowH / 10) {
                    MundusImeDebug.record(decor.getContext(), "poll-corrected",
                        "win=" + windowH + " base=" + sNoImeRootHeight
                            + " from=" + current + " to=" + target);
                }
            }
            if (sLiftPollTicksLeft > 0) {
                sLiftPollTicksLeft--;
                sLiftPollScheduled = true;
                decor.postDelayed(sLiftPollStep, LIFT_POLL_INTERVAL_MS);
            }
        } catch (Exception ignored) {
            // Cosmetic recovery — never crash over it.
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

    /**
     * v0.8.64 (tablet hotfix 3): tiny on-device telemetry for the OEM
     * IME-inset bug. Every time an anomaly path runs (inflation correction,
     * resize grounding, substantial poll correction) one line is recorded
     * into Download/mundus_ime_debug.txt via MediaStore (Android 10+ — no
     * storage permission needed; silently no-op below API 29 or on any
     * failure). The file lets the user report the real numbers back without
     * adb and doubles as proof that a build actually contains this hotfix.
     * Correct devices never trigger the anomaly paths, so nothing appears in
     * their Downloads. Kept small: the in-memory ring holds the last 48
     * lines and the file is rewritten in place.
     */
    private static final class MundusImeDebug {

        private static final String FILE_NAME = "mundus_ime_debug.txt";
        private static final java.util.ArrayDeque<String> LINES = new java.util.ArrayDeque<>();
        private static Uri sFileUri = null;

        static void record(Context ctx, String event, String detail) {
            try {
                if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
                CharSequence ts = android.text.format.DateFormat.format(
                    "MM-dd HH:mm:ss", System.currentTimeMillis());
                if (LINES.size() >= 48) LINES.pollFirst();
                LINES.addLast(ts + " " + event + " " + detail
                    + " [sdk=" + Build.VERSION.SDK_INT + " " + Build.MODEL + "]");
                rewrite(ctx);
            } catch (Exception ignored) {
                // Telemetry must never crash the app.
            }
        }

        private static void rewrite(Context ctx) throws Exception {
            android.content.ContentResolver cr = ctx.getContentResolver();
            if (sFileUri == null) {
                // Reuse the file from a previous process run if present.
                try (android.database.Cursor c = cr.query(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        new String[]{MediaStore.MediaColumns._ID},
                        MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                        new String[]{FILE_NAME}, null)) {
                    if (c != null && c.moveToFirst()) {
                        sFileUri = android.content.ContentUris.withAppendedId(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI, c.getLong(0));
                    }
                }
            }
            if (sFileUri == null) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, FILE_NAME);
                values.put(MediaStore.Downloads.MIME_TYPE, "text/plain");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                sFileUri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (sFileUri == null) return;
            }
            StringBuilder sb = new StringBuilder();
            for (String line : LINES) sb.append(line).append('\n');
            boolean wrote = false;
            try (OutputStream os = cr.openOutputStream(sFileUri)) {
                if (os != null) {
                    os.write(sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    os.flush();
                    wrote = true;
                }
            }
            if (!wrote) {
                // Dead row (the user deleted the file, cloud reset, ...) —
                // drop it and insert a fresh one on the next record.
                try { cr.delete(sFileUri, null, null); } catch (Exception ignored) {}
                sFileUri = null;
                return;
            }
            ContentValues unpend = new ContentValues();
            unpend.put(MediaStore.Downloads.IS_PENDING, 0);
            try { cr.update(sFileUri, unpend, null, null); } catch (Exception ignored) {}
        }
    }
}
