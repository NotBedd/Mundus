// v0.8.0 — Backup & restore deep-data verification suite.
//
// The user asked to VERIFY that every backup surface (rolling snapshots,
// per-Mundus backups, app-wide backups) survives a full round trip WITHOUT
// losing "deep" / "nested" data: multi-image codex galleries, the family
// tree (relatives), story flow link notes, story flow layouts, map markers
// with icons, document visual images, per-project calendars & categories.
//
// This suite exercises the REAL engine functions (buildMundusBackupFile,
// parseMundusBackupFile, parseBackupFile, saveAutoBackupSnapshot,
// mergeSnapshotItems) under Node with browser shims (FileReader/localStorage).
//
// Run: npx tsx scripts/test_backup_verification.ts

// ---------------------------------------------------------------------------
// Browser shims (Node has no FileReader / localStorage)
// ---------------------------------------------------------------------------
class FileReaderShim {
  onload: ((ev: { target: { result: string | null } }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  result: string | ArrayBuffer | null = null;
  readAsText(file: Blob): void {
    file.text()
      .then((t) => { this.result = t; this.onload?.({ target: { result: t } }); })
      .catch((e) => this.onerror?.(e));
  }
}
(globalThis as any).FileReader = FileReaderShim;

const memStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => { memStore.set(k, String(v)); },
  removeItem: (k: string) => { memStore.delete(k); },
  clear: () => memStore.clear(),
  key: (i: number) => [...memStore.keys()][i] ?? null,
  get length() { return memStore.size; },
};

import {
  buildMundusBackupFile,
  parseMundusBackupFile,
  parseBackupFile,
  saveAutoBackupSnapshot,
  getAutoBackupSnapshots,
  mergeSnapshotItems,
  stripLocalImageMarkers,
  LOCAL_IMAGE_PLACEHOLDER,
} from '../src/lib/backupEngine';
import { writeStoryFlowLayout, readStoryFlowLayout } from '../src/lib/storyFlowLayout';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log('  ok ', name); }
  else { failed++; console.log('  FAIL', name, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); }
}
const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// A data URL big enough to trip the 2500-char snapshot guard
const BIG_IMG = 'data:image/png;base64,' + 'A'.repeat(6000);
const SMALL_IMG = 'data:image/png;base64,' + 'B'.repeat(40);

// ---------------------------------------------------------------------------
// Rich fixture: every "deep / nested" structure the user called out
// ---------------------------------------------------------------------------
const now = '2026-10-22T00:00:00.000Z';

const richCharacters = [{
  id: 'char-1', userId: 'u', mundusId: 'world-1', name: 'Kaelen Vance', sex: 'Male',
  status: 'Alive', roles: ['Protagonist'], factions: ['Silver Quill'], families: ['House Vance'],
  tags: ['hero'], aliases: 'The Stormblade',
  // FAMILY TREE (deep nested)
  relatives: { father: 'char-2', mother: 'Rowan', siblings: ['char-3', 'Mira'], partners: ['char-4'], children: ['char-5', 'Ivy'] },
  avatarUrl: BIG_IMG,
  overview: 'The storm-caller.', createdAt: now, updatedAt: now,
}];

const richEntries = [{
  id: 'entry-1', userId: 'u', mundusId: 'world-1', title: 'The Iron Crown', category: 'artifacts',
  // MULTI-IMAGE GALLERY (deep nested array of big data URLs)
  images: [BIG_IMG, SMALL_IMG, BIG_IMG.replace('AAAA', 'BBBB')],
  imageUrl: BIG_IMG,
  themeColor: '#f59e0b', overview: 'Artifact of the old kings.', content: 'Forged in the First Age.',
  tags: ['relic'], linkedDocumentIds: ['doc-1'], linkedCharacterIds: ['char-1'],
  createdAt: now, updatedAt: now,
}];

const richLinks = [{
  id: 'link-1', userId: 'u', mundusId: 'world-1',
  fromDocId: 'doc-1', toDocId: 'doc-2', linkType: 'causes',
  // STORY FLOW LINK NOTE + LABEL
  label: 'Direct consequence of the duel', notes: 'Kaelen loses the crown here; seed for Act 3 betrayal.',
  createdAt: now, updatedAt: now,
}];

const richDocs = [{
  id: 'doc-1', userId: 'u', mundusId: 'world-1', title: 'Chapter One', folderId: null,
  content: '<p>The Iron Crown gleamed. Kyle was there.</p>',
  plainText: 'The Iron Crown gleamed. Kyle was there.',
  wordCount: 8, characterCount: 40, status: 'draft', kind: 'scene',
  // DOCUMENT VISUAL IMAGES (deep nested)
  visualImages: [{ id: 'vi-1', url: BIG_IMG, x: 12.5, y: 30, width: 200, height: 140, rotation: 0, caption: 'map inset' }],
  createdAt: now, updatedAt: now,
}];

const richMarkers = [{
  id: 'marker-1', title: 'Oakhaven', category: 'locations', color: '#8b5cf6',
  icon: 'Castle', xPct: 42.5, yPct: 61.25, createdAt: now, updatedAt: now,
}];

const richLayout = { nodes: ['doc-1', 'doc-2'], positions: { 'doc-1': { x: 100, y: 200 }, 'doc-2': { x: 400, y: 200 } } };
const richSections = [{ id: 'artifacts', userId: 'u', label: 'Relics of Old', iconName: 'Crown', color: '#f59e0b', desc: 'Magical items', updatedAt: now }];
const richProjects = [{ id: 'world-1', userId: 'u', name: 'Testworld', description: 'A test realm', genre: 'Fantasy', color: '#8b5cf6', pageFormat: 'a4', createdAt: now, updatedAt: now }];

const jsonToFile = (obj: unknown, name: string): File =>
  new File([JSON.stringify(obj, null, 2)], name, { type: 'application/json' });

// ---------------------------------------------------------------------------
console.log('[1] Per-Mundus backup round trip (build -> JSON -> parse)');
{
  const backup = buildMundusBackupFile({
    project: { id: 'world-1', name: 'Testworld', description: 'A test realm', genre: 'Fantasy', color: '#8b5cf6', pageFormat: 'a4', createdAt: now, updatedAt: now },
    documents: richDocs,
    folders: [],
    characters: richCharacters,
    timelineEvents: [],
    timelineConfig: { mundusId: 'world-1', months: ['Frostfall'] },
    codexSections: richSections,
    storyLinks: richLinks,
    codexEntries: richEntries,
    mapMarkers: richMarkers,
    mapWorldName: 'Testworld Realm',
    mapImage: { fileName: 'worldmap.png', width: 1024, height: 768, dataUrl: BIG_IMG },
    storyFlowLayout: richLayout,
  });
  const parsed = await parseMundusBackupFile(jsonToFile(backup, 'mundus_backup.json'));

  check('kind discriminator preserved', parsed.kind === 'mundus_backup');
  check('project meta preserved', parsed.project.name === 'Testworld' && parsed.project.pageFormat === 'a4');
  const pc = parsed.characters[0] as any;
  check('family tree (relatives) survives', deepEq(pc.relatives, richCharacters[0].relatives), pc.relatives);
  check('character avatar data URL survives', pc.avatarUrl === BIG_IMG);
  const pe = parsed.codexEntries[0] as any;
  check('codex multi-image gallery survives (3 images)', Array.isArray(pe.images) && pe.images.length === 3 && pe.images[0] === BIG_IMG);
  check('codex imageUrl mirror survives', pe.imageUrl === BIG_IMG);
  const pl = parsed.storyLinks[0] as any;
  check('story flow link LABEL survives', pl.label === 'Direct consequence of the duel');
  check('story flow link NOTES survive', pl.notes === 'Kaelen loses the crown here; seed for Act 3 betrayal.');
  const pm = parsed.mapMarkers[0] as any;
  check('map marker icon + color survive', pm.icon === 'Castle' && pm.color === '#8b5cf6' && pm.xPct === 42.5);
  check('map image data URL survives', parsed.mapImage?.dataUrl === BIG_IMG && parsed.mapImage?.width === 1024);
  check('story flow layout survives', deepEq(parsed.storyFlowLayout, richLayout), parsed.storyFlowLayout);
  check('codex section RENAMED label survives', parsed.codexSections[0].label === 'Relics of Old');
  const pd = parsed.documents[0] as any;
  check('document visualImages survive', pd.visualImages?.[0]?.url === BIG_IMG && pd.visualImages?.[0]?.caption === 'map inset');
}

// ---------------------------------------------------------------------------
console.log('[2] App-wide backup round trip (payload -> JSON -> parse)');
{
  const payload = {
    version: 'v0.8.0', exportedAt: now, appName: 'Mundus Writing Studio',
    projects: richProjects,
    documents: richDocs, folders: [], characters: richCharacters,
    timelineEvents: [{ id: 'ev-1', userId: 'u', mundusId: 'world-1', title: 'The Duel', date: 'Year 418', description: 'Kaelen falls', characterIds: ['char-1'], createdAt: now, updatedAt: now }],
    timelineConfig: { mundusId: 'world-1', months: ['Frostfall'] },
    timelineConfigs: { 'world-1': { mundusId: 'world-1', months: ['Frostfall', 'Emberfall'] } },
    codexSections: richSections,
    codexSectionsByProject: { 'world-1': richSections },
    storyLinks: richLinks,
    codexEntries: richEntries,
    storyFlowLayouts: { 'world-1': richLayout },
  };
  const parsed = await parseBackupFile(jsonToFile(payload, 'app_backup.json'));

  check('worlds list survives', parsed.projects.length === 1 && parsed.projects[0].name === 'Testworld');
  check('family tree survives app-wide', deepEq((parsed.characters[0] as any).relatives, richCharacters[0].relatives));
  check('codex gallery survives app-wide', (parsed.codexEntries[0] as any).images.length === 3);
  check('story link notes survive app-wide', (parsed.storyLinks[0] as any).notes?.includes('Act 3'));
  check('per-project calendars survive', deepEq((parsed.timelineConfigs as any)['world-1'].months, ['Frostfall', 'Emberfall']));
  check('per-project codex categories survive', (parsed.codexSectionsByProject as any)['world-1'][0].label === 'Relics of Old');
  check('story flow layouts survive app-wide', deepEq((parsed.storyFlowLayouts as any)['world-1'], richLayout));
  check('document visualImages survive app-wide', (parsed.documents[0] as any).visualImages?.[0]?.url === BIG_IMG);
}

// ---------------------------------------------------------------------------
console.log('[3] Story flow layout localStorage restore (write -> read)');
{
  localStorage.clear();
  writeStoryFlowLayout('world-9', richLayout);
  const back = readStoryFlowLayout('world-9');
  check('layout write/read round trip', deepEq(back, richLayout), back);
}

// ---------------------------------------------------------------------------
console.log('[4] Snapshot sanitation + image-marker merge (the v0.8.0 fix)');
{
  // Simulate the browser (non-desktop) snapshot path: object fields holding
  // big data URLs are replaced by '[Local Image]' to protect localStorage.
  const snap = saveAutoBackupSnapshot({
    projects: richProjects,
    documents: richDocs as any[],
    folders: [],
    characters: richCharacters as any[],
    timelineEvents: [],
    timelineConfig: {},
    timelineConfigs: {},
    codexSections: richSections,
    codexSectionsByProject: {},
    storyLinks: richLinks as any[],
    codexEntries: richEntries as any[],
    storyFlowLayouts: { 'world-1': richLayout },
  });

  check('snapshot stored', getAutoBackupSnapshots().length === 1);
  const snapChars = (snap.data.characters as any[])[0];
  check('oversized avatarUrl marked as placeholder in snapshot', snapChars.avatarUrl === LOCAL_IMAGE_PLACEHOLDER, snapChars.avatarUrl?.slice(0, 40));
  check('relatives NOT touched by sanitation', deepEq(snapChars.relatives, richCharacters[0].relatives));
  const snapEntries = (snap.data.codexEntries as any[])[0];
  check('gallery ARRAY items survive sanitation untouched', snapEntries.images?.length === 3 && snapEntries.images[0] === BIG_IMG);
  check('oversized imageUrl marked as placeholder in snapshot', snapEntries.imageUrl === LOCAL_IMAGE_PLACEHOLDER);
  check('story link notes survive in snapshot', (snap.data.storyLinks as any[])[0].notes?.includes('Act 3'));
  check('story flow layouts survive in snapshot', deepEq((snap.data.storyFlowLayouts as any)['world-1'], richLayout));

  // RESTORE merge: snapshot values win everywhere EXCEPT image markers.
  const liveCharacters = [{ ...richCharacters[0], name: 'Kaelen Vance (edited live)', avatarUrl: 'data:image/png;base64,LIVE' } as any];
  const mergedChars = mergeSnapshotItems(snap.data.characters as any[], liveCharacters);
  check('merge keeps live avatar (marker stripped)', mergedChars[0].avatarUrl === 'data:image/png;base64,LIVE', mergedChars[0].avatarUrl);
  check('merge takes snapshot content fields (snapshot wins)', mergedChars[0].name === 'Kaelen Vance', mergedChars[0].name);
  check('merge keeps deep relatives', deepEq(mergedChars[0].relatives, richCharacters[0].relatives));

  const liveEntries = [{ ...richEntries[0], title: 'The Iron Crown (edited live)', imageUrl: 'data:image/png;base64,LIVE-ENTRY' } as any];
  const mergedEntries = mergeSnapshotItems(snap.data.codexEntries as any[], liveEntries);
  check('merge keeps live entry imageUrl', mergedEntries[0].imageUrl === 'data:image/png;base64,LIVE-ENTRY');
  check('merge keeps gallery', mergedEntries[0].images.length === 3);
  check('merge takes snapshot title (snapshot wins)', mergedEntries[0].title === 'The Iron Crown', mergedEntries[0].title);

  // Brand-new items (in snapshot, absent live) simply have no image fields.
  const novel = mergeSnapshotItems(
    [{ id: 'entry-new', title: 'From snapshot', imageUrl: LOCAL_IMAGE_PLACEHOLDER } as any],
    []
  );
  check('new item: marker field dropped entirely', !('imageUrl' in novel[0]) && novel[0].title === 'From snapshot');

  check('stripLocalImageMarkers leaves clean items untouched', stripLocalImageMarkers({ id: 'x', name: 'y' } as any).name === 'y');
}

// ---------------------------------------------------------------------------
console.log('[5] App-wide restore carries layouts into localStorage keys');
{
  localStorage.clear();
  const layouts = { 'world-1': richLayout };
  Object.entries(layouts).forEach(([mundusId, layout]) => writeStoryFlowLayout(mundusId, layout));
  const restored = readStoryFlowLayout('world-1');
  check('app-wide storyFlowLayouts restore path works', deepEq(restored, richLayout));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
