// v0.8.64 — Global marker icon image library.
//
// The marker creation/edit menu lets the author upload small custom images and
// use them AS the marker on the map (replacing the classic pin). Uploaded
// images are stored once in this shared library so any marker in any project
// can reuse them; each entry can be removed again from the picker with the X
// badge on its thumbnail (mirroring the codex-entry image workflow).
//
// Storage: localStorage (markers themselves are localStorage-only too, so this
// keeps the feature offline-first and consistent with the rest of map data).
// Images are compressed before they get here (fileToOptimizedDataUrl, ~256px),
// and writes are quota-guarded so a huge library can never corrupt the save.
//
// v0.8.64 (round 2): the library now SYNCS across devices via Firebase
// (/users/{id}/settings/markerIcons). Entries are immutable (id/url/name/
// createdAt never change after upload), so the merge is a union by id — but
// deletions must win too, so removals are recorded as TOMBSTONES (same idea
// as the character tombstones in syncManager.ts, pruned after 7 days). A
// tombstoned id is dropped from every merge, which prevents the "removed on
// one device, resurrected by another" problem of naive union merges.

export interface MarkerIconImage {
  id: string;
  url: string; // data URL (local) or hosted URL (ImgBB)
  name: string; // original file name, shown as tooltip
  createdAt: string;
}

const LIBRARY_KEY = 'mundus_marker_icon_library_v1';
/** Hard cap so the picker stays usable; images are tiny (~10-40KB each). */
export const MAX_MARKER_ICON_IMAGES = 40;
/** Reject a single entry larger than ~400KB compressed (safety net). */
const MAX_SINGLE_ITEM_BYTES = 400 * 1024;

export function getMarkerIconLibrary(): MarkerIconImage[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((it: any) => it && typeof it.id === 'string' && typeof it.url === 'string')
      .map((it: any) => ({
        id: it.id,
        url: it.url,
        name: typeof it.name === 'string' ? it.name : 'icon',
        createdAt: typeof it.createdAt === 'string' ? it.createdAt : new Date().toISOString()
      }));
  } catch {
    return [];
  }
}

/** Raw write with a quota guard; returns false when storage refused the write. */
export function saveMarkerIconLibrary(items: MarkerIconImage[]): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export interface AddMarkerIconResult {
  ok: boolean;
  error?: 'full' | 'quota' | 'too-large';
  item?: MarkerIconImage;
}

export function addMarkerIconImage(url: string, name: string): AddMarkerIconResult {
  const items = getMarkerIconLibrary();
  if (items.length >= MAX_MARKER_ICON_IMAGES) {
    return { ok: false, error: 'full' };
  }
  // Cheap size check for data URLs; hosted URLs are tiny strings.
  if (url.startsWith('data:') && url.length > MAX_SINGLE_ITEM_BYTES) {
    return { ok: false, error: 'too-large' };
  }
  const item: MarkerIconImage = {
    id: `mkico_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    url,
    name: (name || 'icon').slice(0, 80),
    createdAt: new Date().toISOString()
  };
  const ok = saveMarkerIconLibrary([item, ...items]);
  if (!ok) return { ok: false, error: 'quota' };
  // The id is no longer tombstoned anywhere it syncs to: clear any local
  // tombstone so a re-added id can never be filtered out by a stale one.
  removeMarkerIconTombstone(item.id);
  return { ok: true, item };
}

/** Returns the updated list after removal (empty removal is a no-op). */
export function removeMarkerIconImage(id: string): MarkerIconImage[] {
  const current = getMarkerIconLibrary();
  const items = current.filter((it) => it.id !== id);
  const changed = items.length !== current.length;
  saveMarkerIconLibrary(items);
  // v0.8.64 (round 2): record the removal as a tombstone so the cloud merge
  // (and other devices) never resurrect this entry.
  if (changed || hasMarkerIconTombstone(id)) {
    recordMarkerIconTombstone(id);
  }
  return items;
}

/** Look up a library URL by id; undefined when the entry no longer exists. */
export function getMarkerIconImageUrl(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return getMarkerIconLibrary().find((it) => it.id === id)?.url;
}

// ── Removal tombstones + cross-device merge (v0.8.64 round 2) ───────────────

export interface MarkerIconTombstone {
  id: string;
  deletedAt: number;
}

const TOMBSTONES_KEY = 'mundus_marker_icon_tombstones_v1';
/** Tombstones older than 7 days are pruned (same TTL as character tombstones). */
export const MARKER_ICON_TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readMarkerIconTombstones(): MarkerIconTombstone[] {
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t: any) => t && typeof t.id === 'string' && typeof t.deletedAt === 'number')
      : [];
  } catch {
    return [];
  }
}

function writeMarkerIconTombstones(list: MarkerIconTombstone[]): void {
  try {
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to persist marker icon tombstones:', e);
  }
}

export function hasMarkerIconTombstone(id: string): boolean {
  return readMarkerIconTombstones().some((t) => t.id === id);
}

function recordMarkerIconTombstone(id: string): void {
  if (!id) return;
  const list = readMarkerIconTombstones().filter((t) => t.id !== id);
  list.push({ id, deletedAt: Date.now() });
  writeMarkerIconTombstones(list);
}

function removeMarkerIconTombstone(id: string): void {
  const list = readMarkerIconTombstones();
  const filtered = list.filter((t) => t.id !== id);
  if (filtered.length !== list.length) writeMarkerIconTombstones(filtered);
}

export function pruneMarkerIconTombstones(): void {
  const cutoff = Date.now() - MARKER_ICON_TOMBSTONE_TTL_MS;
  const list = readMarkerIconTombstones();
  const kept = list.filter((t) => t.deletedAt >= cutoff);
  if (kept.length !== list.length) writeMarkerIconTombstones(kept);
}

/** Full sync snapshot: the visible library + the removal tombstones. */
export interface MarkerIconLibrarySnapshot {
  items: MarkerIconImage[];
  removed: MarkerIconTombstone[];
  updatedAt: string;
}

export function collectLocalMarkerIconLibrary(): MarkerIconLibrarySnapshot {
  pruneMarkerIconTombstones();
  return {
    items: getMarkerIconLibrary(),
    removed: readMarkerIconTombstones(),
    updatedAt: new Date().toISOString()
  };
}

/** Write a merged snapshot back to this device's localStorage. */
export function applyMarkerIconLibrarySnapshot(snapshot: MarkerIconLibrarySnapshot): void {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const removed = Array.isArray(snapshot?.removed) ? snapshot.removed : [];
  saveMarkerIconLibrary(items);
  writeMarkerIconTombstones(removed);
}

export type MarkerIconLibraryMergeResult = {
  snapshot: MarkerIconLibrarySnapshot;
  /** TRUE when the merged result differs from the local state (needs apply/push). */
  changed: boolean;
  /** TRUE when cloud entries were dropped by local tombstones. */
  removedFromCloud: number;
};

/**
 * mergeMarkerIconLibraries — pure union-by-id merge of two snapshots.
 *  - Items: union by id (local copy wins the impossible id collision; both
 *    sides' entries are kept otherwise).
 *  - Tombstones: union by id, newest deletedAt wins, TTL-pruned.
 *  - Tombstoned ids are dropped from BOTH sides' items (deletion wins).
 * Inputs are never mutated and never touch localStorage.
 */
export function mergeMarkerIconLibraries(
  local: MarkerIconLibrarySnapshot,
  cloud: Partial<MarkerIconLibrarySnapshot> | null
): MarkerIconLibraryMergeResult {
  const localItems = Array.isArray(local?.items) ? local.items : [];
  const localRemoved = Array.isArray(local?.removed) ? local.removed : [];
  const cloudItems = Array.isArray(cloud?.items) ? cloud.items : [];
  const cloudRemoved = Array.isArray(cloud?.removed) ? cloud.removed : [];

  const validItem = (it: any): it is MarkerIconImage =>
    !!it && typeof it.id === 'string' && typeof it.url === 'string';
  const validTomb = (t: any): t is MarkerIconTombstone =>
    !!t && typeof t.id === 'string' && typeof t.deletedAt === 'number';

  // Union tombstones (newest deletedAt wins per id), pruned to the TTL.
  const cutoff = Date.now() - MARKER_ICON_TOMBSTONE_TTL_MS;
  const tombMap = new Map<string, number>();
  localRemoved.filter(validTomb).forEach((t) => tombMap.set(t.id, t.deletedAt));
  cloudRemoved.filter(validTomb).forEach((t) => {
    const prev = tombMap.get(t.id);
    if (prev === undefined || t.deletedAt >= prev) tombMap.set(t.id, t.deletedAt);
  });
  const mergedRemoved = Array.from(tombMap.entries())
    .filter(([, deletedAt]) => deletedAt >= cutoff)
    .map(([id, deletedAt]) => ({ id, deletedAt }));
  // Only tombstones that survived the TTL prune actually suppress items —
  // an expired removal record must let the entry live again.
  const effectiveTombstones = new Set(mergedRemoved.map((t) => t.id));

  // Union items by id; drop anything tombstoned (deletion wins everywhere).
  const itemMap = new Map<string, MarkerIconImage>();
  cloudItems.filter(validItem).forEach((it) => {
    if (!effectiveTombstones.has(it.id)) itemMap.set(it.id, it);
  });
  let removedFromCloud = 0;
  cloudItems.forEach((it) => {
    if (validItem(it) && effectiveTombstones.has(it.id)) removedFromCloud++;
  });
  localItems.filter(validItem).forEach((it) => {
    if (effectiveTombstones.has(it.id)) return;
    itemMap.set(it.id, it);
  });
  const mergedItems = Array.from(itemMap.values());

  // "Changed" = the merged result differs from what this device currently has.
  const localVisible = localItems.filter((it) => validItem(it) && !localRemoved.some((t) => validTomb(t) && t.id === it.id));
  const changed =
    mergedItems.length !== localVisible.length ||
    mergedItems.some((it) => {
      const prev = localVisible.find((x) => x.id === it.id);
      return !prev || prev.url !== it.url || prev.name !== it.name;
    }) ||
    mergedRemoved.length !== localRemoved.filter(validTomb).length ||
    mergedRemoved.some((t) => !localRemoved.some((x) => validTomb(x) && x.id === t.id));

  return {
    snapshot: {
      items: mergedItems,
      removed: mergedRemoved,
      updatedAt: new Date().toISOString()
    },
    changed,
    removedFromCloud
  };
}
