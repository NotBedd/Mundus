// ============================================================
// Font Preferences cross-device sync (v0.7.83)
// ------------------------------------------------------------
// Default paragraph / heading / quote fonts sync across devices
// with LAST-WRITE-WINS semantics: whichever device edited its
// font preference most recently wins, everywhere.
//
// Storage:
//   localStorage:
//     mundus_default_p_font      (existing since early versions)
//     mundus_default_h_font      (existing)
//     mundus_default_quote_font  (existing)
//     mundus_font_prefs_updated  (NEW: ISO timestamp of the most
//                                 recent font-preference edit on
//                                 this device)
//   Firestore (via lib/firebase.ts):
//     /users/{userId}/settings/fontPrefs
//       { paragraphFont, headingFont, quoteFont, updatedAt }
//
// The merge rule compares the ISO `updatedAt` strings (ISO-8601
// strings compare correctly lexicographically):
//   * cloud missing/empty            -> push-local
//   * local never stamped OR cloud
//     newer                          -> apply-cloud
//   * local newer                    -> push-local
//   * equal timestamps               -> none (already in sync)
// ============================================================

export interface FontPrefs {
  paragraphFont: string;
  headingFont: string;
  quoteFont: string;
  /** ISO timestamp of the most recent edit; '' when never edited. */
  updatedAt: string;
}

export const FONT_PREFS_LOCAL_KEYS = {
  paragraph: 'mundus_default_p_font',
  heading: 'mundus_default_h_font',
  quote: 'mundus_default_quote_font',
  updated: 'mundus_font_prefs_updated'
} as const;

const FALLBACK_FONT = 'serif';

/** Read the local font preferences (defaults match the pre-sync behavior). */
export function collectLocalFontPrefs(): FontPrefs {
  let updated = '';
  try {
    updated = localStorage.getItem(FONT_PREFS_LOCAL_KEYS.updated) || '';
  } catch (e) {}
  return {
    paragraphFont: localStorage.getItem(FONT_PREFS_LOCAL_KEYS.paragraph) || FALLBACK_FONT,
    headingFont: localStorage.getItem(FONT_PREFS_LOCAL_KEYS.heading) || FALLBACK_FONT,
    quoteFont: localStorage.getItem(FONT_PREFS_LOCAL_KEYS.quote) || FALLBACK_FONT,
    updatedAt: updated
  };
}

/**
 * Stamp the local "font prefs edited at" timestamp with the current time.
 * Must be called AFTER the changed font value was written to localStorage
 * so the cloud push that follows uploads the new values together with the
 * new timestamp.
 */
export function stampLocalFontPrefs(): string {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(FONT_PREFS_LOCAL_KEYS.updated, now);
  } catch (e) {}
  return now;
}

/** Write a resolved preference set into localStorage (all four keys). */
export function applyFontPrefsToLocalStorage(prefs: FontPrefs): void {
  try {
    localStorage.setItem(FONT_PREFS_LOCAL_KEYS.paragraph, prefs.paragraphFont);
    localStorage.setItem(FONT_PREFS_LOCAL_KEYS.heading, prefs.headingFont);
    localStorage.setItem(FONT_PREFS_LOCAL_KEYS.quote, prefs.quoteFont);
    localStorage.setItem(FONT_PREFS_LOCAL_KEYS.updated, prefs.updatedAt);
  } catch (e) {}
}

export type FontPrefsMergeAction = 'apply-cloud' | 'push-local' | 'none';

/**
 * Resolve the local vs cloud conflict (last-write-wins).
 * `cloud` is a partial doc: only string fields the cloud doc actually
 * carries (fetchUserFontPrefs filters server junk already).
 */
export function mergeFontPrefs(
  local: FontPrefs,
  cloud: Partial<FontPrefs> | null
): { action: FontPrefsMergeAction; prefs: FontPrefs } {
  const cloudHasAnyFont = !!(cloud && (cloud.paragraphFont || cloud.headingFont || cloud.quoteFont));
  if (!cloud || !cloudHasAnyFont) {
    // Nothing usable in the cloud: publish the local state, stamping it
    // if this device never edited its fonts (fresh install case).
    return {
      action: 'push-local',
      prefs: { ...local, updatedAt: local.updatedAt || new Date().toISOString() }
    };
  }
  const cloudUpdated = cloud.updatedAt || '';
  if (!local.updatedAt || cloudUpdated > local.updatedAt) {
    return {
      action: 'apply-cloud',
      prefs: {
        paragraphFont: cloud.paragraphFont || FALLBACK_FONT,
        headingFont: cloud.headingFont || FALLBACK_FONT,
        quoteFont: cloud.quoteFont || FALLBACK_FONT,
        updatedAt: cloudUpdated || new Date().toISOString()
      }
    };
  }
  if (cloudUpdated < local.updatedAt) {
    return { action: 'push-local', prefs: local };
  }
  return { action: 'none', prefs: local };
}
