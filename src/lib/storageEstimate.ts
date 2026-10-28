/**
 * v0.8.1: REAL storage usage estimation.
 *
 * v0.7.98's estimate added a hardcoded `1024 * 16` "base metadata overhead"
 * to every scope, so an empty Mundus reported ~16 KB while the app-wide
 * total double-counted the constant differently than the per-Mundus numbers
 * did (16.6 + 16.2 ≠ 16.8 — the user-visible inconsistency).
 *
 * This module replaces the constant with actual measurement:
 *   - Per project: JSON size (UTF-16 code units × 2 bytes, which is exactly
 *     how localStorage/KeyValue storage accounts characters) of every record
 *     that belongs to that Mundus — documents, folders, characters, codex
 *     entries, timeline events, story links — plus the raw size of every
 *     per-project localStorage key (map markers, map image, world name,
 *     story-flow layout, per-document snapshots) and this project's slice of
 *     the per-project config maps (codex sections, timeline/calendar config).
 *   - Shared: every remaining Mundus localStorage key (settings, dictionary,
 *     fonts, backup prefix, ...) — real quota consumers that belong to no
 *     single project.
 *   - Total: Σ per-project + shared. Per-Mundus numbers now sum to the
 *     total, and an empty Mundus shows its true (small) size.
 */

import type { Character, CodexEntry, Folder, NovelDocument, StoryNodeLink, TimelineEvent } from '../types';

/** localStorage keys that embed a project id directly in the key name. */
const PER_PROJECT_KEY_PREFIXES = [
  'mundus_map_markers_',
  'mundus_map_world_name_',
  'mundus_map_image_',
  'mundus_story_flow_nodes_',
  'mundus_story_flow_positions_',
] as const;

/**
 * localStorage keys that embed a DOCUMENT id — attributed to the project
 * that owns the document (mundus_snapshot_<documentId>).
 */
const SNAPSHOT_KEY_PREFIX = 'mundus_snapshot_';

/** localStorage keys holding a { [mundusId]: config } JSON map. */
const PROJECT_MAP_KEYS = [
  'mundus_codex_sections_by_project',
  'mundus_timeline_configs',
] as const;

/**
 * Global list keys whose RECORDS are already counted per project in pass 2
 * (documents/folders/characters/codex/timeline/story links). These keys must
 * not also land in the shared bucket, or every record counts twice.
 */
const GLOBAL_LIST_KEYS = new Set([
  'mundus_documents',
  'mundus_folders',
  'mundus_characters',
  'mundus_codex_entries',
  'mundus_timeline_events',
  'mundus_story_links',
  'novelist_documents',
]);

export interface EstimateStorageInput {
  documents: NovelDocument[];
  folders: Folder[];
  characters: Character[];
  codexEntries: CodexEntry[];
  timelineEvents: TimelineEvent[];
  storyLinks: StoryNodeLink[];
  mundusIds: string[];
}

export interface StorageUsage {
  /** Real bytes per Mundus project id. */
  perProject: Record<string, number>;
  /** Bytes of shared (app-wide, not per-project) Mundus keys. */
  sharedBytes: number;
  /** perProject sum + sharedBytes. */
  totalBytes: number;
}

/** localStorage strings are UTF-16: two bytes per code unit. */
const utf16Bytes = (s: string): number => s.length * 2;

function jsonSize(value: unknown): number {
  try {
    return utf16Bytes(JSON.stringify(value ?? null));
  } catch {
    return 0;
  }
}

/**
 * Strips a trailing "_name" (mundus_map_image_<id>_name) and any non-id
 * remnants so map-image name keys attribute to the same project.
 */
function projectIdFromKey(key: string): string | null {
  for (const prefix of PER_PROJECT_KEY_PREFIXES) {
    if (!key.startsWith(prefix)) continue;
    let id = key.slice(prefix.length);
    if (id.endsWith('_name')) id = id.slice(0, -'_name'.length);
    return id || null;
  }
  return null;
}

/**
 * Size of a project's slice of a { [mundusId]: config } map key.
 * Returns 0 when the key is absent/corrupt.
 */
function projectMapSliceBytes(key: string, mundusId: string): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
    return jsonSize((parsed as Record<string, unknown>)[mundusId]);
  } catch {
    return 0;
  }
}

/** Real per-Mundus data bytes (documents + lore + per-project keys). */
function projectDataBytes(
  id: string,
  input: EstimateStorageInput,
  perProjectKeyBytes: Map<string, number>
): number {
  let bytes = 0;
  for (const d of input.documents) if ((d.mundusId || 'mundus-prima') === id) bytes += jsonSize(d);
  for (const f of input.folders) if ((f.mundusId || 'mundus-prima') === id) bytes += jsonSize(f);
  for (const c of input.characters) if ((c.mundusId || 'mundus-prima') === id) bytes += jsonSize(c);
  for (const e of input.codexEntries) if ((e.mundusId || 'mundus-prima') === id) bytes += jsonSize(e);
  for (const t of input.timelineEvents) if ((t.mundusId || 'mundus-prima') === id) bytes += jsonSize(t);
  for (const l of input.storyLinks) if ((l.mundusId || 'mundus-prima') === id) bytes += jsonSize(l);
  bytes += perProjectKeyBytes.get(id) || 0;
  for (const key of PROJECT_MAP_KEYS) bytes += projectMapSliceBytes(key, id);
  return bytes;
}

/**
 * Computes real storage usage for every Mundus + the shared app scope.
 * localStorage is scanned exactly once.
 */
export function estimateStorageUsage(input: EstimateStorageInput): StorageUsage {
  const perProject: Record<string, number> = {};
  const ids = input.mundusIds.length ? input.mundusIds : ['mundus-prima'];
  ids.forEach((id) => { perProject[id] = 0; });

  // Pass 1: classify raw localStorage keys (per-project vs shared).
  const perProjectKeyBytes = new Map<string, number>();
  const docToProject = new Map<string, string>();
  input.documents.forEach((d) => docToProject.set(d.id, d.mundusId || 'mundus-prima'));
  let sharedBytes = 0;
  try {
    const store = window.localStorage;
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key) continue;
      const size = utf16Bytes(key) + utf16Bytes(store.getItem(key) || '');
      let projectId: string | null = null;
      if (key.startsWith(SNAPSHOT_KEY_PREFIX)) {
        // Snapshot keys embed a DOCUMENT id — resolve it to the owning project.
        const docId = key.slice(SNAPSHOT_KEY_PREFIX.length);
        projectId = docToProject.get(docId) || null;
        if (!projectId) {
          // Document unknown (deleted project / stale snapshot): its bytes are
          // still real quota usage — park them in the shared bucket.
          if (key.startsWith('mundus_')) sharedBytes += size;
          continue;
        }
      } else {
        projectId = projectIdFromKey(key);
      }
      if (projectId) {
        perProjectKeyBytes.set(projectId, (perProjectKeyBytes.get(projectId) || 0) + size);
      } else if (
        key.startsWith('mundus_') &&
        !(PROJECT_MAP_KEYS as readonly string[]).includes(key) &&
        !GLOBAL_LIST_KEYS.has(key)
      ) {
        sharedBytes += size;
      }
      // Non-Mundus keys (third-party) and the global record lists (already
      // attributed per project above) are intentionally ignored.
    }
  } catch {
    // localStorage unavailable — fall back to list sizes only.
  }

  // Pass 2: real record data per project.
  ids.forEach((id) => {
    perProject[id] = projectDataBytes(id, input, perProjectKeyBytes);
  });

  // Projects whose per-project keys exist but whose id is no longer in the
  // list (deleted worlds leaving orphans) still consume quota — count them.
  perProjectKeyBytes.forEach((bytes, id) => {
    if (!(id in perProject)) perProject[id] = bytes;
  });

  const totalBytes = Object.values(perProject).reduce((a, b) => a + b, 0) + sharedBytes;
  return { perProject, sharedBytes, totalBytes };
}
