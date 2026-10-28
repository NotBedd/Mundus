// v0.7.84 — Writing target helpers: reading-time estimation for the target menu
// and dynamic progress-bar coloring, plus the setting that controls it.
// v0.7.85 — the setting now SYNCS across devices (last-write-wins, mirroring
// the v0.7.83 font-prefs design); OFF keeps the bar fully monochrome.
// v0.7.86 — the dynamic colors moved OUT of the target menu onto the editor's
// bottom-bar target pill (the live indicator); the menu preview is monochrome.

export type TargetMeasureType = 'words' | 'characters';

// Reading-speed convention matches the app's existing document metric
// (Math.ceil(words / 200) -> "~X min read" in App.tsx / TextEditor.tsx).
export const READING_WORDS_PER_MINUTE = 200;
// ~5 characters per word keeps character targets on the same clock as word targets.
export const READING_CHARS_PER_MINUTE = 1000;

/**
 * Estimated minutes a reader needs to get through the given target amount.
 * Returns 0 for invalid input (caller hides the line in that case).
 */
export function estimateTargetReadingMinutes(targetCount: number, targetType: TargetMeasureType): number {
  if (!Number.isFinite(targetCount) || targetCount <= 0) return 0;
  const perMinute = targetType === 'characters' ? READING_CHARS_PER_MINUTE : READING_WORDS_PER_MINUTE;
  return targetCount / perMinute;
}

/** Human-readable reading time, e.g. "under 1 min", "10 min", "1 hr 20 min". */
export function formatReadingTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  if (minutes < 1) return 'under 1 min';
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

// ── Dynamic target bar coloring ─────────────────────────────────────────────
// Blank at 0% -> red below 20% -> orange below 50% -> yellow below 80%
// -> green near/at the goal. Thresholds are exported so they are easy to tweak.
export const TARGET_BAR_ORANGE_AT = 20;
export const TARGET_BAR_YELLOW_AT = 50;
export const TARGET_BAR_GREEN_AT = 80;

/** Soft halo that marks GOAL ACHIEVED — visually distinct from the 80-99% green. */
export const TARGET_BAR_GOAL_GLOW = 'shadow-[0_0_8px_rgba(16,185,129,0.75)]';

/** v0.7.86: goal-achieved halo for the bottom-bar target pill. Applied to the
 * pill itself because the pill's fill layer is clipped by overflow-hidden. */
export const TARGET_BAR_GOAL_PILL_GLOW = 'shadow-[0_0_10px_rgba(16,185,129,0.5)]';

/**
 * Tailwind fill classes for the target progress bar, keyed by completion percent.
 * Callers must pass 100 ONLY when the goal is actually reached (pass
 * Math.min(pct, 99) otherwise) so the achieved glow is exact.
 */
export function getTargetBarFillClass(percent: number): string {
  const p = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  if (p <= 0) return 'bg-neutral-300 dark:bg-neutral-700'; // blank at 0%
  if (p < TARGET_BAR_ORANGE_AT) return 'bg-red-500';
  if (p < TARGET_BAR_YELLOW_AT) return 'bg-orange-500';
  if (p < TARGET_BAR_GREEN_AT) return 'bg-yellow-400';
  if (p < 100) return 'bg-green-500'; // near goal (80-99%)
  return `bg-emerald-500 ${TARGET_BAR_GOAL_GLOW}`; // goal achieved
}

// ── Setting persistence (local UI preference, mirrors the character-highlight toggle) ──
const DYNAMIC_TARGET_BAR_KEY = 'mundus_dynamic_target_bar_color_enabled';

/** Enabled by default in v0.7.84; when OFF the bar stays monochrome at every progress level. */
export function getDynamicTargetBarColorEnabled(): boolean {
  try {
    const saved = localStorage.getItem(DYNAMIC_TARGET_BAR_KEY);
    return saved !== null ? saved === 'true' : true;
  } catch {
    return true;
  }
}

export function setDynamicTargetBarColorEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DYNAMIC_TARGET_BAR_KEY, String(enabled));
  } catch (e) {
    console.error('Failed to save dynamic target bar color setting:', e);
  }
}

// Cross-device sync mirrors the v0.7.83 font-preferences design: a local ISO
// stamp records when this device last edited the toggle; a per-user Firestore
// doc (/users/{id}/settings/targetBarPrefs, written by lib/firebase.ts) is
// resolved last-write-wins on startup.
export interface TargetBarPrefs {
  dynamicTargetBarColor: boolean;
  /** ISO timestamp of the most recent edit; '' when never edited. */
  updatedAt: string;
}

export const TARGET_BAR_PREFS_LOCAL_KEYS = { updated: 'mundus_target_bar_prefs_updated' } as const;

export function collectLocalTargetBarPrefs(): TargetBarPrefs {
  let enabled = true;
  let updated = '';
  try {
    const saved = localStorage.getItem(DYNAMIC_TARGET_BAR_KEY);
    enabled = saved !== null ? saved === 'true' : true;
    updated = localStorage.getItem(TARGET_BAR_PREFS_LOCAL_KEYS.updated) || '';
  } catch (e) {}
  return { dynamicTargetBarColor: enabled, updatedAt: updated };
}

/** Stamp the local "edited at" time; call AFTER writing the new value. */
export function stampLocalTargetBarPrefs(): string {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(TARGET_BAR_PREFS_LOCAL_KEYS.updated, now);
  } catch (e) {}
  return now;
}

export function applyTargetBarPrefsToLocalStorage(prefs: TargetBarPrefs): void {
  try {
    localStorage.setItem(DYNAMIC_TARGET_BAR_KEY, String(prefs.dynamicTargetBarColor));
    localStorage.setItem(TARGET_BAR_PREFS_LOCAL_KEYS.updated, prefs.updatedAt);
  } catch (e) {}
}

export type TargetBarPrefsMergeAction = 'apply-cloud' | 'push-local' | 'none';

/**
 * Resolve local vs cloud (last-write-wins). NOTE: `false` is a valid cloud
 * value - presence is tested with typeof, never truthiness.
 */
export function mergeTargetBarPrefs(
  local: TargetBarPrefs,
  cloud: Partial<TargetBarPrefs> | null
): { action: TargetBarPrefsMergeAction; prefs: TargetBarPrefs } {
  if (!cloud || typeof cloud.dynamicTargetBarColor !== 'boolean') {
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
        dynamicTargetBarColor: cloud.dynamicTargetBarColor,
        updatedAt: cloudUpdated || new Date().toISOString()
      }
    };
  }
  if (cloudUpdated < local.updatedAt) {
    return { action: 'push-local', prefs: local };
  }
  return { action: 'none', prefs: local };
}
