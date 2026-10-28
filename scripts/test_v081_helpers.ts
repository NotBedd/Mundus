/**
 * v0.8.1 helper tests: storageEstimate (real storage accounting) +
 * updateCheck version comparison.
 */
import { estimateStorageUsage } from '../src/lib/storageEstimate';
import { parseVersionTag, compareVersionLists, isNewerVersion } from '../src/lib/updateCheck';
import type { NovelDocument, Folder, Character, CodexEntry, TimelineEvent, StoryNodeLink } from '../src/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL — ' + name + (detail ? ' :: ' + detail : '')); }
}

/* --------------------------------------------------------------- *
 * localStorage polyfill (estimateStorageUsage reads window.localStorage)
 * --------------------------------------------------------------- */
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.localStorage = new FakeStorage();
const LS = (globalThis as any).window.localStorage as FakeStorage;

const doc = (id: string, mundusId: string, content: string): NovelDocument =>
  ({ id, title: 'T' + id, mundusId, content, plainText: content, createdAt: '', updatedAt: '' } as any);

function run() {
  LS.setItem('mundus_documents', JSON.stringify([doc('d1', 'A', 'x'.repeat(100)), doc('d2', 'B', 'y'.repeat(50))]));
  LS.setItem('mundus_folders', '[]');
  LS.setItem('mundus_characters', '[]');
  LS.setItem('mundus_codex_entries', '[]');
  LS.setItem('mundus_timeline_events', '[]');
  LS.setItem('mundus_story_links', '[]');
  LS.setItem('mundus_projects', JSON.stringify([{ id: 'A' }, { id: 'B' }]));
  LS.setItem('mundus_accent_color', '#8b5cf6');
  LS.setItem('mundus_map_markers_A', JSON.stringify([{ id: 'm1', title: 'Pin' }]));
  LS.setItem('mundus_map_image_A', 'data:image/png;base64,' + 'z'.repeat(200));
  LS.setItem('mundus_map_image_A_name', 'World Map');
  LS.setItem('mundus_snapshot_d1', JSON.stringify({ v: '1' }));
  LS.setItem('mundus_map_markers_ZZ', JSON.stringify([{ id: 'ghost' }])); // orphan: world deleted, key remains
  LS.setItem('mundus_codex_sections_by_project', JSON.stringify({ A: [{ id: 's1', label: 'Factions' }], B: [{ id: 's2', label: 'Races' }] }));

  const input = {
    documents: [doc('d1', 'A', 'x'.repeat(100)), doc('d2', 'B', 'y'.repeat(50))],
    folders: [] as Folder[],
    characters: [] as Character[],
    codexEntries: [] as CodexEntry[],
    timelineEvents: [] as TimelineEvent[],
    storyLinks: [] as StoryNodeLink[],
    mundusIds: ['A', 'B'],
  };

  const usage = estimateStorageUsage(input);

  // 1. NO 16 KB constant — an empty project measures ~0, not 16384
  check('v081: empty project B is tiny (no 16KB constant)', usage.perProject['B'] < 2048, `B=${usage.perProject['B']}`);
  check('v081: project A carries real data', usage.perProject['A'] > usage.perProject['B'], `A=${usage.perProject['A']} B=${usage.perProject['B']}`);

  // 2. per-project keys attributed to the right project
  const bytesOf = (s: string) => s.length * 2;
  const aKeysExpect = bytesOf('mundus_map_markers_A') + bytesOf(LS.getItem('mundus_map_markers_A') || '')
    + bytesOf('mundus_map_image_A') + bytesOf(LS.getItem('mundus_map_image_A') || '')
    + bytesOf('mundus_map_image_A_name') + bytesOf(LS.getItem('mundus_map_image_A_name') || '')
    + bytesOf('mundus_snapshot_d1') + bytesOf(LS.getItem('mundus_snapshot_d1') || '');
  check('v081: per-project localStorage keys attributed to A', usage.perProject['A'] >= aKeysExpect, `expected>=${aKeysExpect} got=${usage.perProject['A']}`);

  // 3. config map slices attributed per project
  const sliceA = bytesOf(JSON.stringify([{ id: 's1', label: 'Factions' }]));
  check('v081: codex sections map slice counted for A', usage.perProject['A'] >= aKeysExpect + sliceA, `A=${usage.perProject['A']} keys=${aKeysExpect} slice=${sliceA}`);

  // 4. global list keys not double counted in shared
  const sumProjects = usage.perProject['A'] + usage.perProject['B'] + (usage.perProject['ZZ'] || 0);
  const shared = usage.sharedBytes;
  check('v081: shared holds only non-list keys (accent color etc.)', shared >= bytesOf('mundus_accent_color') + bytesOf('#8b5cf6') && shared < 4096, `shared=${shared}`);

  // 5. orphan project keys still counted
  check('v081: orphan per-project keys counted', typeof usage.perProject['ZZ'] === 'number' && usage.perProject['ZZ'] > 0, `ZZ=${usage.perProject['ZZ']}`);

  // 6. total = sum(perProject) + shared
  const recomputed = Object.values(usage.perProject).reduce((a, b) => a + b, 0) + shared;
  check('v081: total equals sum of parts', usage.totalBytes === recomputed, `total=${usage.totalBytes} recomputed=${recomputed}`);
  check('v081: total equals perProject sum + shared (A+B+ZZ)', Math.abs(usage.totalBytes - sumProjects - shared) < 1, '');

  // 7. the user's report scenario: two projects' numbers now ADD UP
  check('v081: per-Mundus values reconcile with the total', usage.totalBytes > usage.perProject['A'] && usage.totalBytes > usage.perProject['B'], '');
}

run();

/* --------------------------------------------------------------- *
 * updateCheck version comparison
 * --------------------------------------------------------------- */
check('v081: parse v0.8.1', JSON.stringify(parseVersionTag('v0.8.1')) === '[0,8,1]');
check('v081: parse 0.8.10 (no v)', JSON.stringify(parseVersionTag('0.8.10')) === '[0,8,10]');
check('v081: parse garbage -> null', parseVersionTag('not-a-version') === null);
check('v081: parse empty -> null', parseVersionTag('') === null);
check('v081: compare equal', compareVersionLists([0, 8, 1], [0, 8, 1]) === 0);
check('v081: newer patch', compareVersionLists([0, 8, 2], [0, 8, 1]) === 1);
check('v081: older', compareVersionLists([0, 7, 99], [0, 8, 0]) === -1);
check('v081: minor beats patch', compareVersionLists([0, 9, 0], [0, 8, 99]) === 1);
check('v081: missing segment = 0', compareVersionLists([0, 8], [0, 8, 0]) === 0);
check('v081: isNewer true case', isNewerVersion('v0.8.2', 'v0.8.1') === true);
check('v081: isNewer same version false', isNewerVersion('v0.8.1', 'v0.8.1') === false);
check('v081: isNewer future major', isNewerVersion('v1.0.0', 'v0.8.1') === true);
check('v081: isNewer garbage candidate false', isNewerVersion('weird', 'v0.8.1') === false);

console.log(`=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
