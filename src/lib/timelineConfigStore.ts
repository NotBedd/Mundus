import type { TimelineConfig } from '../types';
import { INITIAL_TIMELINE_CONFIG } from './initialData';

/**
 * Per-project calendar (TimelineConfig) storage — v0.7.74.
 *
 * Before v0.7.74 there was exactly ONE calendar shared by every project:
 *   - localStorage 'mundus_timeline_config'
 *   - Firestore /users/{uid}/settings/timeline → { config, events, links }
 *
 * v0.7.74 makes each project's calendar independent while staying fully
 * backward compatible:
 *   - New map storage: localStorage 'mundus_timeline_configs'
 *     → { [mundusId]: TimelineConfig } (each entry stamped with mundusId + updatedAt)
 *   - The legacy single-config key is KEPT as the shared fallback so projects
 *     that never had their calendar edited keep showing exactly what they
 *     showed before the upgrade (zero-surprise migration).
 *   - A project gets its own map entry the first time its calendar is edited
 *     (lazy divergence), and the entry then travels through backups and the
 *     cloud sync (configByProject) with per-entry updatedAt conflict resolution.
 */

export const LEGACY_TIMELINE_CONFIG_KEY = 'mundus_timeline_config';
export const TIMELINE_CONFIGS_KEY = 'mundus_timeline_configs';

export type TimelineConfigMap = Record<string, TimelineConfig>;

/** Defensive normalizer: repairs corrupt/partial configs coming from storage or the cloud. */
export function normalizeTimelineConfig(raw: any, mundusId?: string): TimelineConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const positiveInt = (v: any, d: number) =>
    typeof v === 'number' && isFinite(v) && v >= 1 ? Math.floor(v) : d;
  const finiteNum = (v: any, d: number) =>
    typeof v === 'number' && isFinite(v) ? v : d;
  const str = (v: any, d: string) =>
    typeof v === 'string' && v.trim() ? v : d;

  const config: TimelineConfig = {
    timeSystem: (['standard', 'fantasy', 'scifi', 'custom'] as const).includes(raw.timeSystem)
      ? raw.timeSystem
      : INITIAL_TIMELINE_CONFIG.timeSystem,
    epochName: str(raw.epochName, INITIAL_TIMELINE_CONFIG.epochName),
    majorUnitName: str(raw.majorUnitName, INITIAL_TIMELINE_CONFIG.majorUnitName),
    minorUnitName: str(raw.minorUnitName, INITIAL_TIMELINE_CONFIG.minorUnitName),
    subUnitName: str(raw.subUnitName, INITIAL_TIMELINE_CONFIG.subUnitName),
    baseYear: finiteNum(raw.baseYear, INITIAL_TIMELINE_CONFIG.baseYear),
    unitsPerMajor: positiveInt(raw.unitsPerMajor, INITIAL_TIMELINE_CONFIG.unitsPerMajor),
    subUnitsPerMinor: positiveInt(raw.subUnitsPerMinor, INITIAL_TIMELINE_CONFIG.subUnitsPerMinor)
  };
  if (mundusId) config.mundusId = mundusId;
  else if (typeof raw.mundusId === 'string' && raw.mundusId) config.mundusId = raw.mundusId;
  if (typeof raw.updatedAt === 'string' && raw.updatedAt) config.updatedAt = raw.updatedAt;
  return config;
}

/** The pre-0.7.74 shared calendar (fallback for projects without their own entry). */
export function loadLegacyTimelineConfig(): TimelineConfig | null {
  try {
    const raw = localStorage.getItem(LEGACY_TIMELINE_CONFIG_KEY);
    if (!raw) return null;
    return normalizeTimelineConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Loads the per-project calendar map from localStorage. */
export function loadTimelineConfigMap(): TimelineConfigMap {
  try {
    const raw = localStorage.getItem(TIMELINE_CONFIGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map: TimelineConfigMap = {};
    for (const key of Object.keys(parsed)) {
      const cfg = normalizeTimelineConfig(parsed[key], key);
      if (cfg) map[key] = cfg;
    }
    return map;
  } catch {
    return {};
  }
}

export function saveTimelineConfigMap(map: TimelineConfigMap): void {
  try {
    localStorage.setItem(TIMELINE_CONFIGS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to persist per-project timeline configs:', e);
  }
}

/** Keeps the legacy key in sync so old code paths / entry-less projects see the latest calendar. */
export function saveLegacyTimelineConfig(config: TimelineConfig): void {
  try {
    localStorage.setItem(LEGACY_TIMELINE_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to persist legacy timeline config:', e);
  }
}

/**
 * Resolution order for a project's calendar:
 *   1. its own map entry (edited at least once) — full independence
 *   2. the legacy shared calendar (never edited → identical to pre-0.7.74 behavior)
 *   3. factory default
 */
export function resolveTimelineConfig(
  map: TimelineConfigMap,
  legacy: TimelineConfig | null,
  mundusId: string | null | undefined
): TimelineConfig {
  if (mundusId && map[mundusId]) return map[mundusId];
  return legacy || INITIAL_TIMELINE_CONFIG;
}

/**
 * Merges a cloud-sourced per-project map into the local one.
 * Per entry: cloud wins only when strictly newer (updatedAt) or when missing locally.
 * Returns a NEW map (never mutates inputs).
 */
export function mergeTimelineConfigMaps(
  local: TimelineConfigMap,
  cloud: TimelineConfigMap | null | undefined
): { map: TimelineConfigMap; changed: boolean } {
  if (!cloud || typeof cloud !== 'object') return { map: local, changed: false };
  const map: TimelineConfigMap = { ...local };
  let changed = false;
  for (const key of Object.keys(cloud)) {
    const cloudCfg = normalizeTimelineConfig(cloud[key], key);
    if (!cloudCfg) continue;
    const localCfg = map[key];
    if (!localCfg) {
      map[key] = cloudCfg;
      changed = true;
    } else {
      const cloudAt = cloudCfg.updatedAt || '';
      const localAt = localCfg.updatedAt || '';
      if (cloudAt > localAt) {
        map[key] = cloudCfg;
        changed = true;
      }
    }
  }
  return { map, changed };
}

/** Normalizes an arbitrary record (cloud/backup) into a validated TimelineConfigMap. */
export function normalizeTimelineConfigMap(raw: any): TimelineConfigMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const map: TimelineConfigMap = {};
  for (const key of Object.keys(raw)) {
    const cfg = normalizeTimelineConfig(raw[key], key);
    if (cfg) map[key] = cfg;
  }
  return map;
}

/** True when the config differs from the legacy fallback in any user-facing field. */
export function timelineConfigsDiffer(a: TimelineConfig | null, b: TimelineConfig | null): boolean {
  if (!a || !b) return a !== b;
  return (
    a.timeSystem !== b.timeSystem ||
    a.epochName !== b.epochName ||
    a.majorUnitName !== b.majorUnitName ||
    a.minorUnitName !== b.minorUnitName ||
    a.subUnitName !== b.subUnitName ||
    a.baseYear !== b.baseYear ||
    a.unitsPerMajor !== b.unitsPerMajor ||
    a.subUnitsPerMinor !== b.subUnitsPerMinor
  );
}
