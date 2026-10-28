/**
 * v0.7.96 — Story Flow layout persistence + duplicate-shortcut helper tests.
 *
 * Story flow layout: read/write/normalize roundtrip through (stubbed)
 * localStorage, remap on id collisions, merge semantics (backup wins for
 * shared ids, current order preserved, new ids appended), clear, and
 * corruption survival — the pieces behind "restored backups keep the
 * arranged Story Flow Graph".
 *
 * Shortcut helpers: bindingsEqual and findBindingConflicts — the engine of
 * the new duplicate-shortcut warning in Settings.
 */
import {
  readStoryFlowLayout,
  writeStoryFlowLayout,
  normalizeStoryFlowLayout,
  remapStoryFlowLayout,
  mergeStoryFlowLayouts,
  clearStoryFlowLayout,
  storyFlowNodesKey,
  storyFlowPositionsKey,
  type StoryFlowLayout,
} from '../src/lib/storyFlowLayout';
import {
  bindingsEqual,
  findBindingConflicts,
  DEFAULT_KEYBINDINGS,
} from '../src/lib/shortcutManager';

// node has no localStorage — minimal stub
const __store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (__store.has(k) ? __store.get(k)! : null),
  setItem: (k: string, v: string) => { __store.set(k, String(v)); },
  removeItem: (k: string) => { __store.delete(k); }
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e: any) {
    failed++;
    failures.push(`${name}: ${e?.message || e}`);
  }
}

function assert(cond: any, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

test('keys use the same format as the StoryFlowGraph component', () => {
  assert(storyFlowNodesKey('abc') === 'mundus_story_flow_nodes_abc', 'nodes key');
  assert(storyFlowPositionsKey('abc') === 'mundus_story_flow_positions_abc', 'positions key');
  assert(storyFlowNodesKey('') === 'mundus_story_flow_nodes_default', 'empty falls back to default');
  assert(storyFlowNodesKey(undefined) === 'mundus_story_flow_nodes_default', 'undefined falls back to default');
});

// ---------------------------------------------------------------------------
// read / write roundtrip
// ---------------------------------------------------------------------------

test('write then read returns the same layout', () => {
  __store.clear();
  const layout: StoryFlowLayout = {
    nodes: ['doc-1', 'doc-2', 'doc-3'],
    positions: { 'doc-1': { x: 80, y: 80 }, 'doc-2': { x: 440, y: 80 }, 'doc-3': { x: 800, y: 295 } },
  };
  writeStoryFlowLayout('world-a', layout);
  const read = readStoryFlowLayout('world-a');
  assert(read !== null, 'layout should read back');
  assert(JSON.stringify(read) === JSON.stringify(layout), 'roundtrip must be identical');
});

test('read returns null when nothing was ever placed', () => {
  __store.clear();
  assert(readStoryFlowLayout('never-used') === null, 'empty world -> null');
});

test('read returns null for corrupt JSON in either key', () => {
  __store.clear();
  __store.set(storyFlowNodesKey('corrupt'), '{not json');
  __store.set(storyFlowPositionsKey('corrupt'), 'also-bad');
  assert(readStoryFlowLayout('corrupt') === null, 'corrupt data -> null, never throws');
});

test('write drops invalid positions and empty node ids', () => {
  __store.clear();
  writeStoryFlowLayout('world-b', {
    nodes: ['ok-1', '', 'ok-2'],
    positions: {
      'ok-1': { x: 10, y: 20 },
      'bad-1': { x: Number.NaN, y: 5 } as any,
      'bad-2': 'nope' as any,
      'bad-3': { x: 'x', y: 20 } as any,
    },
  });
  const read = readStoryFlowLayout('world-b')!;
  assert(read.nodes.length === 2 && read.nodes.includes('ok-1') && read.nodes.includes('ok-2'), 'empty ids filtered');
  assert(Object.keys(read.positions).length === 1 && read.positions['ok-1'], 'only valid positions kept');
});

test('write ignores null/undefined layouts', () => {
  __store.clear();
  writeStoryFlowLayout('world-c', null);
  writeStoryFlowLayout('world-c', undefined);
  assert(readStoryFlowLayout('world-c') === null, 'no keys written');
});

test('read returns null when the nodes list is empty even if positions exist', () => {
  __store.clear();
  __store.set(storyFlowNodesKey('empty-nodes'), '[]');
  __store.set(storyFlowPositionsKey('empty-nodes'), JSON.stringify({ a: { x: 1, y: 2 } }));
  assert(readStoryFlowLayout('empty-nodes') === null, 'nothing placed -> null');
});

// ---------------------------------------------------------------------------
// normalize (untrusted backup payloads)
// ---------------------------------------------------------------------------

test('normalize accepts valid layouts', () => {
  const out = normalizeStoryFlowLayout({ nodes: ['a'], positions: { a: { x: 1.5, y: -2 } } });
  assert(out !== null && out.nodes[0] === 'a' && out.positions.a.x === 1.5, 'valid payload normalized');
});

test('normalize rejects non-objects, arrays, empty nodes and garbage positions', () => {
  assert(normalizeStoryFlowLayout(null) === null, 'null');
  assert(normalizeStoryFlowLayout(undefined) === null, 'undefined');
  assert(normalizeStoryFlowLayout([1, 2]) === null, 'array');
  assert(normalizeStoryFlowLayout('x') === null, 'string');
  assert(normalizeStoryFlowLayout({ nodes: [], positions: {} }) === null, 'no nodes');
  const out = normalizeStoryFlowLayout({ nodes: ['a'], positions: { a: { x: 'left', y: 2 }, b: { x: 1, y: 2 } } });
  assert(out !== null && Object.keys(out!.positions).length === 1 && out!.positions.b, 'garbage positions skipped, valid kept');
});

// ---------------------------------------------------------------------------
// remap (import collision renames)
// ---------------------------------------------------------------------------

test('remap rewrites node ids and position keys through the rename table', () => {
  const layout: StoryFlowLayout = {
    nodes: ['doc-1', 'doc-2', 'doc-3'],
    positions: { 'doc-1': { x: 1, y: 1 }, 'doc-2': { x: 2, y: 2 }, 'doc-3': { x: 3, y: 3 } },
  };
  const renameMap = new Map([['doc-1', 'doc0-123-0'], ['doc-3', 'doc5-123-2']]);
  const out = remapStoryFlowLayout(layout, renameMap);
  assert(out.nodes.join(',') === 'doc0-123-0,doc-2,doc5-123-2', 'nodes remapped in order');
  assert(out.positions['doc0-123-0'] && out.positions['doc-2'] && out.positions['doc5-123-2'], 'position keys remapped');
  assert(out.positions['doc-1'] === undefined, 'old keys gone');
});

test('remap is a no-op with an empty rename map (same object returned)', () => {
  const layout: StoryFlowLayout = { nodes: ['a'], positions: { a: { x: 1, y: 2 } } };
  assert(remapStoryFlowLayout(layout, new Map()) === layout, 'empty map returns identical layout');
});

// ---------------------------------------------------------------------------
// merge (restore over an existing layout)
// ---------------------------------------------------------------------------

test('merge: backup wins for shared ids, new ids appended, order preserved', () => {
  const current: StoryFlowLayout = {
    nodes: ['a', 'b', 'c'],
    positions: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, c: { x: 3, y: 3 } },
  };
  const incoming: StoryFlowLayout = {
    nodes: ['b', 'a', 'd'],
    positions: { b: { x: 20, y: 20 }, a: { x: 10, y: 10 }, d: { x: 40, y: 40 } },
  };
  const out = mergeStoryFlowLayouts(current, incoming);
  assert(out.nodes.join(',') === 'a,b,c,d', 'current order first, incoming appends');
  assert(out.positions.a.x === 10 && out.positions.b.x === 20, 'incoming wins for shared ids');
  assert(out.positions.c.x === 3, 'untouched ids keep current positions');
  assert(out.positions.d.x === 40, 'new id gets incoming position');
});

test('merge keeps locally-placed nodes (union semantics, everything else is kept)', () => {
  const current: StoryFlowLayout = {
    nodes: ['a', 'local-only'],
    positions: { a: { x: 1, y: 1 }, 'local-only': { x: 9, y: 9 } },
  };
  const incoming: StoryFlowLayout = { nodes: ['a'], positions: { a: { x: 5, y: 5 } } };
  const out = mergeStoryFlowLayouts(current, incoming);
  assert(out.nodes.join(',') === 'a,local-only', 'local-only stays placed (matches merge-import semantics)');
  assert(out.positions['local-only'].x === 9, 'its position survives');
  assert(out.positions.a.x === 5, 'backup position wins for shared ids');
});

test('merge prunes orphan positions that belong to no placed node', () => {
  const current: StoryFlowLayout = { nodes: ['a'], positions: { a: { x: 1, y: 1 } } };
  const incoming: StoryFlowLayout = {
    nodes: ['a'],
    positions: { a: { x: 5, y: 5 }, orphan: { x: 7, y: 7 } },
  };
  const out = mergeStoryFlowLayouts(current, incoming);
  assert(out.nodes.join(',') === 'a', 'only placed nodes in list');
  assert(out.positions.orphan === undefined, 'orphan position pruned');
  assert(out.positions.a.x === 5, 'backup wins');
});

test('merge works with no current layout (fresh world)', () => {
  const incoming: StoryFlowLayout = { nodes: ['x', 'y'], positions: { x: { x: 1, y: 1 } } };
  const out = mergeStoryFlowLayouts(null, incoming);
  assert(out.nodes.join(',') === 'x,y', 'incoming becomes the layout');
});

// ---------------------------------------------------------------------------
// clear (world deletion cleanup)
// ---------------------------------------------------------------------------

test('clear removes both keys', () => {
  writeStoryFlowLayout('doomed', { nodes: ['a'], positions: { a: { x: 1, y: 1 } } });
  assert(readStoryFlowLayout('doomed') !== null, 'layout exists before clear');
  clearStoryFlowLayout('doomed');
  assert(readStoryFlowLayout('doomed') === null, 'layout gone after clear');
  assert(!__store.has(storyFlowNodesKey('doomed')) && !__store.has(storyFlowPositionsKey('doomed')), 'both keys removed');
});

// ---------------------------------------------------------------------------
// Duplicate shortcut helpers
// ---------------------------------------------------------------------------

test('bindingsEqual compares keys case-insensitively and modifiers as booleans', () => {
  assert(bindingsEqual({ key: 'B', ctrlOrCmd: true }, { key: 'b', ctrlOrCmd: true }), 'case-insensitive');
  assert(bindingsEqual({ key: 'b' }, { key: 'b', ctrlOrCmd: false }), 'undefined == false');
  assert(!bindingsEqual({ key: 'b', ctrlOrCmd: true }, { key: 'b' }), 'ctrlOrCmd differs');
  assert(!bindingsEqual({ key: 'b', ctrlOrCmd: true, shift: true }, { key: 'b', ctrlOrCmd: true }), 'shift differs');
  assert(!bindingsEqual({ key: 'b', ctrlOrCmd: true, alt: true }, { key: 'b', ctrlOrCmd: true }), 'alt differs');
  assert(!bindingsEqual({ key: 'z' }, { key: 'y' }), 'key differs');
});

test('findBindingConflicts finds every OTHER action with the same combo', () => {
  const bindings = {
    ...DEFAULT_KEYBINDINGS,
    bold: { key: 'j', ctrlOrCmd: true },
    quote: { key: 'j', ctrlOrCmd: true },
  } as any;
  const conflicts = findBindingConflicts(bindings, 'bold', { key: 'j', ctrlOrCmd: true });
  assert(conflicts.length === 1 && conflicts[0] === 'quote', 'bold excluded, quote found');
  const none = findBindingConflicts(bindings, null, { key: 'j', ctrlOrCmd: true, shift: true });
  assert(none.length === 0, 'different modifier -> no conflict');
});

test('findBindingConflicts detects multiple conflicting actions at once', () => {
  const bindings = {
    ...DEFAULT_KEYBINDINGS,
    bold: { key: 'q', ctrlOrCmd: true },
    quote: { key: 'q', ctrlOrCmd: true },
    numberList: { key: 'q', ctrlOrCmd: true },
  } as any;
  const conflicts = findBindingConflicts(bindings, null, { key: 'q', ctrlOrCmd: true });
  assert(conflicts.length === 3, 'all three flagged together');
});

test('defaults are conflict-free (sanity check on the shipped profile)', () => {
  (Object.keys(DEFAULT_KEYBINDINGS) as (keyof typeof DEFAULT_KEYBINDINGS)[]).forEach((id) => {
    const conflicts = findBindingConflicts(DEFAULT_KEYBINDINGS, id, DEFAULT_KEYBINDINGS[id]);
    assert(conflicts.length === 0, `default binding for ${id} unexpectedly conflicts with ${conflicts.join(',')}`);
  });
});

// ---------------------------------------------------------------------------

const total = passed + failed;
console.log(`\nv0.7.96 helper tests: ${passed}/${total} passed${failed ? ` — FAILURES:\n${failures.map((f) => '  - ' + f).join('\n')}` : ''}`);
if (failed > 0) process.exit(1);
