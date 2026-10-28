// Offline Persistence & Firestore Sync Queue Manager for Mundus
import type { DocumentSnapshot, Character } from '../types';

const PENDING_SYNC_KEY = 'mundus_pending_sync_doc_ids';
const PENDING_CHAR_SYNC_KEY = 'mundus_pending_sync_char_ids';
const SNAPSHOTS_KEY_PREFIX = 'mundus_snapshots_';

export function isBrowserOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function getPendingSyncDocIds(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read pending sync doc IDs:', e);
    return [];
  }
}

export function markDocPendingSync(docId: string): string[] {
  try {
    const current = getPendingSyncDocIds();
    if (!current.includes(docId)) {
      const updated = [...current, docId];
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(updated));
      return updated;
    }
    return current;
  } catch (e) {
    console.error('Failed to mark doc pending sync:', e);
    return [];
  }
}

export function clearDocPendingSync(docId: string): string[] {
  try {
    const current = getPendingSyncDocIds();
    const updated = current.filter((id) => id !== docId);
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to clear doc pending sync:', e);
    return [];
  }
}

export function isDocPendingSync(docId: string): boolean {
  const pending = getPendingSyncDocIds();
  return pending.includes(docId);
}

// ---------------------------------------------------------------------------
// Character pending-sync queue (mirrors the document mechanism).
// Characters previously had NO retry path: a single failed fire-and-forget
// write was lost forever and the next launch replaced local data with stale
// cloud data. These helpers persist the IDs of characters whose cloud write
// failed so they can be re-pushed when connectivity returns.
// ---------------------------------------------------------------------------
export function getPendingSyncCharacterIds(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_CHAR_SYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read pending sync character IDs:', e);
    return [];
  }
}

export function markCharacterPendingSync(characterId: string): string[] {
  try {
    const current = getPendingSyncCharacterIds();
    if (!current.includes(characterId)) {
      const updated = [...current, characterId];
      localStorage.setItem(PENDING_CHAR_SYNC_KEY, JSON.stringify(updated));
      return updated;
    }
    return current;
  } catch (e) {
    console.error('Failed to mark character pending sync:', e);
    return [];
  }
}

export function clearCharacterPendingSync(characterId: string): string[] {
  try {
    const current = getPendingSyncCharacterIds();
    const updated = current.filter((id) => id !== characterId);
    localStorage.setItem(PENDING_CHAR_SYNC_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to clear character pending sync:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Character deletion tombstones (v0.7.75).
// Character persistence now MERGES with whatever is already in localStorage
// (multi-tab protection), so a character deleted in one tab would otherwise be
// resurrected by another tab's older stored roster — and re-pushed to the cloud
// on the next startup merge. A tombstone records "this id was deleted" so
// merges and startup syncs can drop it. Tombstones are pruned after 7 days.
// ---------------------------------------------------------------------------
const DELETED_CHAR_IDS_KEY = 'mundus_deleted_char_ids';
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CharacterTombstone {
  id: string;
  deletedAt: number;
}

function readCharacterTombstones(): CharacterTombstone[] {
  try {
    const raw = localStorage.getItem(DELETED_CHAR_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t: any) => t && typeof t.id === 'string' && typeof t.deletedAt === 'number')
      : [];
  } catch (e) {
    return [];
  }
}

function writeCharacterTombstones(list: CharacterTombstone[]): void {
  try {
    localStorage.setItem(DELETED_CHAR_IDS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to persist character tombstones:', e);
  }
}

export function markCharacterDeleted(characterId: string): void {
  if (!characterId) return;
  const list = readCharacterTombstones().filter((t) => t.id !== characterId);
  list.push({ id: characterId, deletedAt: Date.now() });
  writeCharacterTombstones(list);
}

export function isCharacterDeleted(characterId: string): boolean {
  return readCharacterTombstones().some((t) => t.id === characterId);
}

export function getDeletedCharacterIds(): string[] {
  return readCharacterTombstones().map((t) => t.id);
}

export function pruneCharacterTombstones(): void {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const kept = readCharacterTombstones().filter((t) => t.deletedAt >= cutoff);
  writeCharacterTombstones(kept);
}

// ---------------------------------------------------------------------------
// Pure roster-merge helpers (v0.7.75) — unit-testable, no storage I/O.
// ---------------------------------------------------------------------------

/**
 * charTimestampMs — safe updatedAt/createdAt reader. A character saved without
 * timestamps (older versions) sorts as epoch 0 instead of being excluded.
 */
export function charTimestampMs(char: Pick<Character, 'updatedAt' | 'createdAt'> | null | undefined): number {
  if (!char) return 0;
  const t = new Date(char.updatedAt || char.createdAt || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * mergeCharacterRosters — union of two character lists, newest updatedAt wins
 * per id, `primary` wins ties (it represents the live in-memory state the user
 * is looking at). Ids in `deletedIds` (tombstones) are never resurrected.
 * Inputs are never mutated.
 */
export function mergeCharacterRosters(
  primary: Character[],
  secondary: Character[],
  deletedIds: string[] = []
): Character[] {
  const deadSet = new Set(deletedIds);
  const map = new Map<string, Character>();
  (secondary || []).forEach((c) => {
    if (!c || typeof c.id !== 'string' || deadSet.has(c.id)) return;
    map.set(c.id, c);
  });
  (primary || []).forEach((c) => {
    if (!c || typeof c.id !== 'string' || deadSet.has(c.id)) return;
    const existing = map.get(c.id);
    if (!existing || charTimestampMs(c) >= charTimestampMs(existing)) {
      map.set(c.id, c);
    }
  });
  return Array.from(map.values());
}

/**
 * normalizeCharacterTimestamps — v0.7.75 repair for characters whose cloud doc
 * lost createdAt/updatedAt (undefined values used to be deleteField()-ed, and
 * Firestore queries ordered on updatedAt silently EXCLUDE documents missing
 * it — characters became invisible on every device even though they still
 * existed in the cloud). A repaired character becomes visible again and, being
 * strictly newer than the timestamp-less cloud copy, propagates to all devices.
 */
export function normalizeCharacterTimestamps<T extends Partial<Pick<Character, 'createdAt' | 'updatedAt'>> & Record<string, any>>(
  char: T,
  fallbackNowIso: string
): T {
  if (!char || typeof char !== 'object') return char;
  const createdAt = char.createdAt || char.updatedAt || fallbackNowIso;
  const updatedAt = char.updatedAt || createdAt;
  if (createdAt === char.createdAt && updatedAt === char.updatedAt) return char;
  return { ...char, createdAt, updatedAt };
}

export function subscribeToOnlineStatus(
  onStatusChange: (isOnline: boolean) => void
): () => void {
  const handleOnline = () => onStatusChange(true);
  const handleOffline = () => onStatusChange(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// Local snapshot cache helpers (for offline resilience)
export function getLocalSnapshots(documentId: string): DocumentSnapshot[] {
  if (!documentId) return [];
  try {
    const rawPlural = localStorage.getItem(`${SNAPSHOTS_KEY_PREFIX}${documentId}`);
    const rawSingular = localStorage.getItem(`mundus_snapshot_${documentId}`);
    const raw = rawPlural || rawSingular;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list: DocumentSnapshot[] = Array.isArray(parsed) ? parsed : [];
    // Strictly filter snapshots to ensure no snapshots leak across documents
    return list.filter((s) => s && (s.documentId === documentId || !s.documentId)).map(s => ({ ...s, documentId }));
  } catch (e) {
    console.error('Failed to read local snapshots for document:', e);
    return [];
  }
}

export function saveLocalSnapshot(snapshot: DocumentSnapshot): DocumentSnapshot[] {
  if (!snapshot || !snapshot.documentId) return [];
  try {
    const existing = getLocalSnapshots(snapshot.documentId);
    const filtered = existing.filter((s) => s.id !== snapshot.id);
    const updated = [snapshot, ...filtered];
    const jsonStr = JSON.stringify(updated);
    localStorage.setItem(`${SNAPSHOTS_KEY_PREFIX}${snapshot.documentId}`, jsonStr);
    localStorage.setItem(`mundus_snapshot_${snapshot.documentId}`, jsonStr);
    return updated;
  } catch (e) {
    console.error('Failed to save local snapshot:', e);
    return [];
  }
}

export function deleteLocalSnapshot(documentId: string, snapshotId: string): DocumentSnapshot[] {
  if (!documentId) return [];
  try {
    const existing = getLocalSnapshots(documentId);
    const updated = existing.filter((s) => s.id !== snapshotId);
    const jsonStr = JSON.stringify(updated);
    localStorage.setItem(`${SNAPSHOTS_KEY_PREFIX}${documentId}`, jsonStr);
    localStorage.setItem(`mundus_snapshot_${documentId}`, jsonStr);
    return updated;
  } catch (e) {
    console.error('Failed to delete local snapshot:', e);
    return [];
  }
}
