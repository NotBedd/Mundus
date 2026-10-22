import type { Folder, MundusProject, NovelDocument } from '../types';

/* ==================================================================
   v0.8.3 — Book order engine (Mundus View reorder mode + Export Book)

   The book order is derived from three persisted pieces:
   - NovelDocument.bookOrderIndex  → order of documents WITHIN a scope
     (their folder, or the loose/unfiled scope)
   - Folder.orderIndex             → order of folders (already existed)
   - MundusProject.looseDocsPosition → 'top' | 'bottom' placement of the
     unfiled block (default 'bottom' = the historical Mundus View layout)

   RESOLUTION RULES (deliberately conservative):
   - Items WITHOUT an explicit index sort AFTER indexed ones, keeping their
     current relative (array) order via a stable sort. Consequence 1: on a
     profile where nothing was ever reordered, the resolved order is
     byte-identical to the pre-v0.8.3 display order. Consequence 2: newly
     created documents land at the END of their scope until the author
     places them with the reorder arrows.
   - Folders keep the same rule on orderIndex; handleCreateFolder has
     stamped orderIndex since long before v0.8.3, so folder order resolves
     exactly as displayed today.
   ================================================================== */

export type LooseDocsPosition = 'top' | 'bottom';

export interface BookFolderGroup {
  folder: Folder;
  docs: NovelDocument[];
}

export interface BookLayout {
  looseDocs: NovelDocument[];
  folderGroups: BookFolderGroup[];
  loosePosition: LooseDocsPosition;
}

const UNINDEXED = Number.MAX_SAFE_INTEGER - 1;

/**
 * Stable sort that orders indexed items by index and keeps everything else
 * in its original array order after them. Stability is what guarantees the
 * "untouched profile looks exactly like before" property.
 */
export function sortByBookOrder<T>(items: T[], getIndex: (item: T) => number | undefined): T[] {
  return items
    .map((item, arrayPos) => ({ item, arrayPos, key: getIndex(item) }))
    .sort((a, b) => {
      const ka = a.key ?? UNINDEXED;
      const kb = b.key ?? UNINDEXED;
      if (ka !== kb) return ka - kb;
      return a.arrayPos - b.arrayPos;
    })
    .map((entry) => entry.item);
}

/** Folders in book order (orderIndex, ties keep current array order). */
export function sortFoldersForBook(folders: Folder[]): Folder[] {
  return sortByBookOrder(folders, (f) => f.orderIndex);
}

/**
 * Resolves the full book layout for a Mundus: folder groups (in folder
 * order, each with its documents in doc order) plus the loose scope.
 * A document whose folderId points at a deleted/unknown folder counts as
 * loose (mirrors the Mundus View unfiled filter).
 */
export function resolveBookLayout(
  documents: NovelDocument[],
  folders: Folder[],
  project?: MundusProject | null
): BookLayout {
  const loosePosition: LooseDocsPosition = project?.looseDocsPosition === 'top' ? 'top' : 'bottom';
  const folderGroups: BookFolderGroup[] = sortFoldersForBook(folders).map((folder) => ({
    folder,
    docs: sortByBookOrder(
      documents.filter((d) => d.folderId === folder.id),
      (d) => d.bookOrderIndex
    ),
  }));
  const folderIdSet = new Set(folders.map((f) => f.id));
  const looseDocs = sortByBookOrder(
    documents.filter((d) => !d.folderId || !folderIdSet.has(d.folderId)),
    (d) => d.bookOrderIndex
  );
  return { looseDocs, folderGroups, loosePosition };
}

/** Flat chapter sequence for exports: [loose top?] folders [loose bottom?]. */
export function bookDocumentSequence(layout: BookLayout): NovelDocument[] {
  const head = layout.loosePosition === 'top' ? layout.looseDocs : [];
  const tail = layout.loosePosition === 'bottom' ? layout.looseDocs : [];
  return [...head, ...layout.folderGroups.flatMap((g) => g.docs), ...tail];
}

/**
 * Computes the reindex map for moving `id` one slot up (-1) / down (+1)
 * inside its ordered scope. Returns a map of id → new index for the WHOLE
 * scope (normalizes it to 0..n-1, which is what makes the custom order
 * "stick" to the display), or null when the move is out of bounds.
 */
export function adjacentSwapReindex(
  scopeIdsInOrder: string[],
  id: string,
  direction: -1 | 1
): Record<string, number> | null {
  const from = scopeIdsInOrder.indexOf(id);
  if (from === -1) return null;
  const to = from + direction;
  if (to < 0 || to >= scopeIdsInOrder.length) return null;

  const next = [...scopeIdsInOrder];
  [next[from], next[to]] = [next[to], next[from]];
  const map: Record<string, number> = {};
  next.forEach((sid, idx) => {
    map[sid] = idx;
  });
  return map;
}
