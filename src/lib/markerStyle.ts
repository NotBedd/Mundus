// v0.8.64 — Map marker visual style preference.
//
// 'pin'  — the classic Mundus teardrop pin with the selected icon glyph drawn
//          on its white disc (the original and default style).
// 'icon' — the newer style where the marker IS the selected icon itself: a
//          round colored badge (or the uploaded custom image) floating on the
//          map, with no pin shape around it.
//
// v0.8.64 (round 2): the preference now SYNCS across devices via Firebase
// (last-write-wins, the same design as the font prefs and the target-bar
// toggle): a local ISO stamp records when this device last edited it, and a
// per-user Firestore doc (/users/{id}/settings/mapMarkerPrefs, written by
// lib/firebase.ts) is resolved on startup. Default stays 'pin' so existing
// worlds keep looking exactly the same after the update.

export type MapMarkerStyle = 'pin' | 'icon';

const MARKER_STYLE_KEY = 'mundus_map_marker_style';

export function getMapMarkerStyle(): MapMarkerStyle {
  try {
    const saved = localStorage.getItem(MARKER_STYLE_KEY);
    return saved === 'icon' ? 'icon' : 'pin';
  } catch {
    return 'pin';
  }
}

export function setMapMarkerStyle(style: MapMarkerStyle): void {
  try {
    localStorage.setItem(MARKER_STYLE_KEY, style);
  } catch (e) {
    console.error('Failed to save map marker style setting:', e);
  }
}

// ── Cross-device sync (v0.8.64 round 2) ─────────────────────────────────────
// Mirrors the targetBarPrefs design in targetProgress.ts: local value + local
// "edited at" stamp, collected/stamped/applied through these helpers, merged
// last-write-wins by App.tsx on startup against the Firestore doc.

export interface MapMarkerStylePrefs {
  markerStyle: MapMarkerStyle;
  /** ISO timestamp of the most recent edit; '' when never edited. */
  updatedAt: string;
}

export const MAP_MARKER_PREFS_LOCAL_KEYS = { updated: 'mundus_map_marker_prefs_updated' } as const;

export function collectLocalMarkerStylePrefs(): MapMarkerStylePrefs {
  let style: MapMarkerStyle = 'pin';
  let updated = '';
  try {
    style = getMapMarkerStyle();
    updated = localStorage.getItem(MAP_MARKER_PREFS_LOCAL_KEYS.updated) || '';
  } catch (e) {}
  return { markerStyle: style, updatedAt: updated };
}

/** Stamp the local "edited at" time; call AFTER writing the new style. */
export function stampLocalMarkerStylePrefs(): string {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(MAP_MARKER_PREFS_LOCAL_KEYS.updated, now);
  } catch (e) {}
  return now;
}

export function applyMarkerStylePrefsToLocalStorage(prefs: MapMarkerStylePrefs): void {
  try {
    setMapMarkerStyle(prefs.markerStyle === 'icon' ? 'icon' : 'pin');
    localStorage.setItem(MAP_MARKER_PREFS_LOCAL_KEYS.updated, prefs.updatedAt);
  } catch (e) {}
}

export type MapMarkerStyleMergeAction = 'apply-cloud' | 'push-local' | 'none';

/**
 * Resolve local vs cloud (last-write-wins). NOTE: 'pin' is a valid cloud
 * value — validity is tested by string value, never truthiness.
 */
export function mergeMapMarkerStylePrefs(
  local: MapMarkerStylePrefs,
  cloud: Partial<MapMarkerStylePrefs> | null
): { action: MapMarkerStyleMergeAction; prefs: MapMarkerStylePrefs } {
  const cloudStyle = cloud?.markerStyle;
  const cloudValid = cloudStyle === 'pin' || cloudStyle === 'icon';
  if (!cloud || !cloudValid) {
    // Nothing usable in the cloud: publish the local state, stamping it if
    // this device never edited the toggle (fresh install case).
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
        markerStyle: cloudStyle as MapMarkerStyle,
        updatedAt: cloudUpdated || new Date().toISOString()
      }
    };
  }
  if (cloudUpdated < local.updatedAt) {
    return { action: 'push-local', prefs: local };
  }
  return { action: 'none', prefs: local };
}
