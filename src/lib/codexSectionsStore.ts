import type { CodexSection } from '../types';

/**
 * Per-project Codex categories (sections) storage — v0.7.76.
 *
 * Before v0.7.76 there was exactly ONE category list shared by every project:
 *   - localStorage 'mundus_codex_categories' (mirrored to 'mundus_codex_sections')
 *   - read/written directly by CodexMode and MapMode, never cloud-synced.
 *
 * v0.7.76 makes each project's categories independent while staying fully
 * backward compatible (same zero-surprise migration as per-project calendars
 * in v0.7.74):
 *   - New map storage: localStorage 'mundus_codex_sections_by_project'
 *     → { [mundusId]: CodexSection[] } (every entry stamped with updatedAt)
 *   - The legacy shared list is KEPT as the shared fallback so projects whose
 *     categories were never edited keep showing exactly what they showed
 *     before the upgrade.
 *   - A project gets its own map entry the first time its categories are
 *     edited (lazy divergence). The entry then travels through backups and
 *     the cloud sync (sectionsByProject) with per-entry updatedAt merging.
 */

export const LEGACY_CODEX_SECTIONS_KEYS = ['mundus_codex_categories', 'mundus_codex_sections'] as const;
export const CODEX_SECTIONS_MAP_KEY = 'mundus_codex_sections_by_project';

export type CodexSectionsMap = Record<string, CodexSection[]>;

/** The single source of truth for the factory default categories. */
export const DEFAULT_CODEX_SECTIONS: CodexSection[] = [
  { id: 'regions', label: 'Regions & Lands', iconName: 'Globe', color: '#10b981', desc: 'Geographical realms, provinces & climate zones' },
  { id: 'locations', label: 'Castles & Locations', iconName: 'Castle', color: '#8b5cf6', desc: 'Cities, fortresses, seats of power & landmarks' },
  { id: 'factions', label: 'Factions & Orders', iconName: 'Shield', color: '#f59e0b', desc: 'Guilds, religious orders, armies & alliances' },
  { id: 'houses', label: 'Houses & Dynasties', iconName: 'Users', color: '#3b82f6', desc: 'Noble lineages, family houses & royal clans' },
  { id: 'objects', label: 'Objects & Artifacts', iconName: 'Sparkles', color: '#06b6d4', desc: 'Relics, magical items, catalysts & weapons' },
  { id: 'powers', label: 'Magic & Powers', iconName: 'Wand2', color: '#ec4899', desc: 'Spellcraft systems, resonances & arcane rules' },
  { id: 'lore', label: 'Histories & Key Events', iconName: 'Scroll', color: '#a855f7', desc: 'Historical events, key milestones, legends & myths' }
];

/**
 * Defensive normalizer: repairs corrupt/partial lists coming from storage,
 * the cloud or backups. Returns null when nothing usable remains.
 * The updatedAt revision timestamp is preserved on every item (all items of
 * one save action share the same timestamp — the list's revision).
 */
export function normalizeCodexSections(raw: any): CodexSection[] | null {
  if (!Array.isArray(raw)) return null;
  const str = (v: any, d: string) => (typeof v === 'string' && v.trim() ? v.trim() : d);
  const out: CodexSection[] = [];
  const seenIds = new Set<string>();
  let sharedUpdatedAt = '';
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = str((item as any).id, '');
    const label = str((item as any).label, '');
    if (!id || !label || seenIds.has(id)) continue;
    seenIds.add(id);
    const sec: CodexSection = {
      id,
      label,
      iconName: str((item as any).iconName, 'BookOpen'),
      color: str((item as any).color, '#3b82f6'),
      desc: typeof (item as any).desc === 'string' ? (item as any).desc : ''
    };
    if (typeof (item as any).updatedAt === 'string' && (item as any).updatedAt && !sharedUpdatedAt) {
      sharedUpdatedAt = (item as any).updatedAt;
    }
    if (sharedUpdatedAt) sec.updatedAt = sharedUpdatedAt;
    out.push(sec);
  }
  return out.length > 0 ? out : null;
}

/** The pre-0.7.76 shared category list (fallback for projects without their own entry). */
export function loadLegacyCodexSections(): CodexSection[] | null {
  for (const key of LEGACY_CODEX_SECTIONS_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = normalizeCodexSections(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // try the next legacy key
    }
  }
  return null;
}

/** Loads the per-project category map from localStorage. */
export function loadCodexSectionsMap(): CodexSectionsMap {
  try {
    const raw = localStorage.getItem(CODEX_SECTIONS_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map: CodexSectionsMap = {};
    for (const key of Object.keys(parsed)) {
      const list = normalizeCodexSections(parsed[key]);
      if (list) map[key] = list;
    }
    return map;
  } catch {
    return {};
  }
}

export function saveCodexSectionsMap(map: CodexSectionsMap): void {
  try {
    localStorage.setItem(CODEX_SECTIONS_MAP_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to persist per-project codex sections:', e);
  }
}

/** Keeps the legacy keys in sync so entry-less projects see the latest list (pre-0.7.76 behavior). */
export function saveLegacyCodexSections(sections: CodexSection[]): void {
  try {
    const json = JSON.stringify(sections);
    localStorage.setItem('mundus_codex_categories', json);
    localStorage.setItem('mundus_codex_sections', json);
  } catch (e) {
    console.error('Failed to persist legacy codex sections:', e);
  }
}

/**
 * Resolution order for a project's categories:
 *   1. its own map entry (edited at least once) — full independence
 *   2. the legacy shared list (never edited → identical to pre-0.7.76 behavior)
 *   3. factory defaults
 */
export function resolveCodexSections(
  map: CodexSectionsMap,
  legacy: CodexSection[] | null,
  mundusId: string | null | undefined
): CodexSection[] {
  if (mundusId && map[mundusId] && map[mundusId].length > 0) return map[mundusId];
  if (legacy && legacy.length > 0) return legacy;
  return DEFAULT_CODEX_SECTIONS;
}

/** Latest revision timestamp carried by a list ('' when unknown). */
export function codexSectionsRevision(list: CodexSection[] | null | undefined): string {
  if (!Array.isArray(list)) return '';
  let latest = '';
  for (const item of list) {
    if (item && typeof item.updatedAt === 'string' && item.updatedAt > latest) latest = item.updatedAt;
  }
  return latest;
}

/** Stamps every item of the list with one shared revision timestamp (mutates nothing). */
export function stampCodexSections(sections: CodexSection[], iso: string): CodexSection[] {
  return sections.map((s) => ({ ...s, updatedAt: iso }));
}

/**
 * Merges a cloud-sourced per-project map into the local one.
 * Per key: cloud wins only when strictly newer (revision) or missing locally.
 * Returns a NEW map (never mutates inputs).
 */
export function mergeCodexSectionMaps(
  local: CodexSectionsMap,
  cloud: CodexSectionsMap | null | undefined
): { map: CodexSectionsMap; changed: boolean } {
  if (!cloud || typeof cloud !== 'object' || Array.isArray(cloud)) return { map: local, changed: false };
  const map: CodexSectionsMap = { ...local };
  let changed = false;
  for (const key of Object.keys(cloud)) {
    const cloudList = normalizeCodexSections(cloud[key]);
    if (!cloudList) continue;
    const localList = map[key];
    if (!localList || localList.length === 0) {
      map[key] = cloudList;
      changed = true;
    } else if (codexSectionsRevision(cloudList) > codexSectionsRevision(localList)) {
      map[key] = cloudList;
      changed = true;
    }
  }
  return { map, changed };
}

/** Normalizes an arbitrary record (cloud/backup) into a validated CodexSectionsMap. */
export function normalizeCodexSectionsMap(raw: any): CodexSectionsMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const map: CodexSectionsMap = {};
  for (const key of Object.keys(raw)) {
    const list = normalizeCodexSections(raw[key]);
    if (list) map[key] = list;
  }
  return map;
}
