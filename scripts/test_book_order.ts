/* v0.8.3 — unit tests for the book order engine (src/lib/bookOrder.ts).
 * Run: npx tsx scripts/test_book_order.ts
 */
import {
  adjacentSwapReindex,
  bookDocumentSequence,
  resolveBookLayout,
  sortByBookOrder,
  sortFoldersForBook,
} from '../src/lib/bookOrder';
import type { Folder, MundusProject, NovelDocument } from '../src/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

const iso = (d: number) => new Date(2026, 0, d).toISOString();

function doc(id: string, folderId?: string, bookOrderIndex?: number, createdDay = 1): NovelDocument {
  return {
    id,
    userId: 'author',
    mundusId: 'mundus-e2e',
    folderId,
    title: id,
    content: `<p>${id}</p>`,
    plainText: id,
    wordCount: 1,
    characterCount: 1,
    readingTimeMinutes: 1,
    status: 'draft',
    category: 'Manuscript',
    isFavorite: false,
    fontFamily: 'serif',
    fontSize: 16,
    createdAt: iso(createdDay),
    updatedAt: iso(createdDay),
    ...(bookOrderIndex !== undefined ? { bookOrderIndex } : {}),
  } as NovelDocument;
}

function folder(id: string, orderIndex?: number, createdDay = 1): Folder {
  return {
    id,
    userId: 'author',
    mundusId: 'mundus-e2e',
    name: id,
    createdAt: iso(createdDay),
    updatedAt: iso(createdDay),
    ...(orderIndex !== undefined ? { orderIndex } : {}),
  } as Folder;
}

const project = (over: Partial<MundusProject> = {}): MundusProject =>
  ({
    id: 'mundus-e2e',
    userId: 'author',
    name: 'E2E World',
    createdAt: iso(1),
    updatedAt: iso(1),
    ...over,
  }) as MundusProject;

const ids = (docs: NovelDocument[]) => docs.map((d) => d.id);

/* ---------- sortByBookOrder ---------- */
{
  const input = [doc('a'), doc('b'), doc('c')];
  check('sort: all unindexed keeps array order', JSON.stringify(ids(sortByBookOrder(input, (d) => d.bookOrderIndex))) === '["a","b","c"]');
  const mixed = [doc('new1'), doc('mid', undefined, 1), doc('new2'), doc('first', undefined, 0)];
  check(
    'sort: indexed docs first (by index), unindexed after in array order',
    JSON.stringify(ids(sortByBookOrder(mixed, (d) => d.bookOrderIndex))) === '["first","mid","new1","new2"]'
  );
}

/* ---------- sortFoldersForBook ---------- */
{
  const f = [folder('f1', 0, 3), folder('f2', undefined, 2), folder('f3', 1, 1)];
  check('folders: orderIndex wins over array order', JSON.stringify(sortFoldersForBook(f).map((x) => x.id)) === '["f1","f3","f2"]');
  const noIdx = [folder('x1', undefined, 2), folder('x2', undefined, 1)];
  check('folders: missing orderIndex keeps array order (stable)', JSON.stringify(sortFoldersForBook(noIdx).map((x) => x.id)) === '["x1","x2"]');
}

/* ---------- resolveBookLayout ---------- */
{
  const docs = [
    doc('loose-new', undefined, undefined, 9),
    doc('f1-b', 'F1', 1, 2),
    doc('orphan', 'GONE', undefined, 8),
    doc('f1-a', 'F1', 0, 1),
    doc('loose-old', undefined, undefined, 3),
    doc('f2-only', 'F2', undefined, 4),
  ];
  const folders = [folder('F1', 1, 2), folder('F2', 0, 1)];
  const layout = resolveBookLayout(docs, folders, project());

  check('layout: folder groups ordered by orderIndex', JSON.stringify(layout.folderGroups.map((g) => g.folder.id)) === '["F2","F1"]');
  check('layout: docs inside folder sorted by bookOrderIndex', JSON.stringify(ids(layout.folderGroups.find((g) => g.folder.id === 'F1')!.docs)) === '["f1-a","f1-b"]');
  check('layout: unindexed doc in folder still listed', layout.folderGroups.find((g) => g.folder.id === 'F2')!.docs.length === 1);
  check('layout: unknown folderId counts as loose', ids(layout.looseDocs).includes('orphan'));
  check('layout: loose keeps array order when unindexed', JSON.stringify(ids(layout.looseDocs)) === '["loose-new","orphan","loose-old"]');
  check('layout: loose position defaults to bottom', layout.loosePosition === 'bottom');
  check(
    'layout: loose position top honored',
    resolveBookLayout(docs, folders, project({ looseDocsPosition: 'top' })).loosePosition === 'top'
  );
  check('layout: null project tolerated', resolveBookLayout(docs, folders, null).loosePosition === 'bottom');
}

/* ---------- bookDocumentSequence ---------- */
{
  const docs = [
    doc('t1', 'F1', 0, 1),
    doc('t2', 'F1', 1, 2),
    doc('l1', undefined, undefined, 3),
    doc('l2', undefined, undefined, 4),
  ];
  const folders = [folder('F1', 0)];
  const bottom = bookDocumentSequence(resolveBookLayout(docs, folders, project({ looseDocsPosition: 'bottom' })));
  check('sequence: loose bottom = folders then loose', JSON.stringify(ids(bottom)) === '["t1","t2","l1","l2"]');
  const top = bookDocumentSequence(resolveBookLayout(docs, folders, project({ looseDocsPosition: 'top' })));
  check('sequence: loose top = loose then folders', JSON.stringify(ids(top)) === '["l1","l2","t1","t2"]');
}

/* ---------- adjacentSwapReindex ---------- */
{
  const seq = ['a', 'b', 'c', 'd'];
  check('swap: unknown id → null', adjacentSwapReindex(seq, 'zz', -1) === null);
  check('swap: first up → null', adjacentSwapReindex(seq, 'a', -1) === null);
  check('swap: last down → null', adjacentSwapReindex(seq, 'd', 1) === null);

  const downB = adjacentSwapReindex(seq, 'b', 1)!;
  check('swap: b down swaps b and c', downB['b'] === 2 && downB['c'] === 1);
  check('swap: map normalizes whole scope 0..n-1', Object.values(downB).sort().join(',') === '0,1,2,3' && Object.keys(downB).length === 4);
  check('swap: untouched entries keep slots', downB['a'] === 0 && downB['d'] === 3);

  const upB = adjacentSwapReindex(seq, 'b', -1)!;
  check('swap: b up swaps a and b', upB['b'] === 0 && upB['a'] === 1);
}

/* ---------- end-to-end style scenario (reorder sticks + new doc appends) ---------- */
{
  // Author reorders F1 (b,a,c) via swaps; new doc created afterwards lands at the end.
  const docs = [
    doc('c', 'F1', 2),
    doc('a', 'F1', 0),
    doc('b', 'F1', 1),
    doc('brand-new', 'F1', undefined, 9),
  ];
  const layout = resolveBookLayout(docs, [folder('F1', 0)], project());
  check('scenario: manual order sticks', JSON.stringify(ids(layout.folderGroups[0].docs).slice(0, 3)) === '["a","b","c"]');
  check('scenario: new doc appends after manual order', ids(layout.folderGroups[0].docs)[3] === 'brand-new');
}

console.log(`\n=== book order: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
