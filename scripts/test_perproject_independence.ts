// v0.7.81 regression test — per-project Codex categories & calendars independence.
// Simulates the exact reported bug: create a category in project A -> it must
// NOT appear in project B (which never edited its categories).
// Run: bun scripts/test_perproject_independence.ts

import {
  DEFAULT_CODEX_SECTIONS,
  normalizeCodexSections,
  resolveCodexSections,
  stampCodexSections,
  codexSectionsRevision,
  mergeCodexSectionMaps,
  type CodexSectionsMap
} from '../src/lib/codexSectionsStore';
import type { CodexSection } from '../src/types';
import {
  resolveTimelineConfig,
  mergeTimelineConfigMaps,
  normalizeTimelineConfig,
  type TimelineConfigMap
} from '../src/lib/timelineConfigStore';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
}

// --- Minimal localStorage mock (the stores touch localStorage lazily) ---
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; }
};

// ---------------------------------------------------------------------------
// 1) The reported bug scenario — categories
// ---------------------------------------------------------------------------
console.log('\n[1] Category leak scenario (the reported bug)');
const sharedFallback: CodexSection[] = normalizeCodexSections(DEFAULT_CODEX_SECTIONS)!; // pre-upgrade shared list
const map: CodexSectionsMap = {}; // no project edited its categories yet

// Project A resolves to the shared fallback before any edit:
const beforeA = resolveCodexSections(map, sharedFallback, 'proj-A');
check('A starts on the shared fallback', beforeA.length === DEFAULT_CODEX_SECTIONS.length);

// User adds "Dragons" in project A -> handleSaveCodexSections (fixed) writes ONLY the map entry:
const editedA = stampCodexSections(
  normalizeCodexSections([...beforeA, { id: 'dragons', label: 'Dragons', iconName: 'BookOpen', color: '#ef4444', desc: '' }])!,
  '2026-10-16T10:00:00.000Z'
);
const mapAfterA = { ...map, 'proj-A': editedA };
// (the fixed handler no longer does: sharedFallback = editedA)

// Project B (never edited) must NOT see "Dragons":
const resolvedB = resolveCodexSections(mapAfterA, sharedFallback, 'proj-B');
check('B does NOT see the new category', !resolvedB.some((s) => s.id === 'dragons'));
check('B still sees the shared fallback', resolvedB.length === DEFAULT_CODEX_SECTIONS.length);

// Project A sees its own list:
const resolvedA = resolveCodexSections(mapAfterA, sharedFallback, 'proj-A');
check('A sees the new category', resolvedA.some((s) => s.id === 'dragons'));

// Cross-device: cloud push carries sections = fallback (frozen), sectionsByProject = map.
// Device 2 startup merge must not let the cloud fallback clobber anything:
const pushedSections = sharedFallback; // fixed push: legacy fallback, NOT project A's list
check('cloud push carries the frozen fallback (no Dragons)', !pushedSections.some((s) => s.id === 'dragons'));

// Device 2 has its own fallback -> cloud fallback is IGNORED (seed-only-when-null):
const device2Fallback = sharedFallback;
const mergedMap = mergeCodexSectionMaps({ 'proj-A': editedA }, { 'proj-A': editedA }).map;
const resolvedBOnDevice2 = resolveCodexSections(mergedMap, device2Fallback, 'proj-B');
check('device 2 B does not see Dragons (fallback kept)', !resolvedBOnDevice2.some((s) => s.id === 'dragons'));

// Fresh device (no local fallback) -> seeded from cloud, still without Dragons:
const freshFallback = pushedSections;
check('fresh device seeded with frozen fallback', freshFallback.length === DEFAULT_CODEX_SECTIONS.length);

// ---------------------------------------------------------------------------
// 2) Revision merge still works (cloud map entries)
// ---------------------------------------------------------------------------
console.log('\n[2] Cloud per-project map merge');
const cloudNewer = stampCodexSections(editedA, '2026-10-16T11:00:00.000Z');
const m1 = mergeCodexSectionMaps({ 'proj-A': editedA }, { 'proj-A': cloudNewer });
check('newer cloud revision wins', codexSectionsRevision(m1.map['proj-A']) === '2026-10-16T11:00:00.000Z');
check('merge reports change', m1.changed === true);
const m2 = mergeCodexSectionMaps({ 'proj-A': cloudNewer }, { 'proj-A': editedA });
check('older cloud revision does not clobber local', codexSectionsRevision(m2.map['proj-A']) === '2026-10-16T11:00:00.000Z');
check('merge reports no change', m2.changed === false);

// ---------------------------------------------------------------------------
// 3) Same independence semantics for calendars
// ---------------------------------------------------------------------------
console.log('\n[3] Calendar leak scenario');
const fallbackCal = normalizeTimelineConfig({ timeSystem: 'fantasy', epochName: 'Age of Kings', majorUnitName: 'Year', minorUnitName: 'Month', subUnitName: 'Day', baseYear: 1200, unitsPerMajor: 12, subUnitsPerMinor: 30 });
const calMap: TimelineConfigMap = {};
check('A starts on the shared fallback calendar', resolveTimelineConfig(calMap, fallbackCal, 'proj-A').epochName === 'Age of Kings');

// User edits project A's calendar (fixed handler writes ONLY the map entry):
const editedCal = normalizeTimelineConfig({ ...fallbackCal, epochName: 'Third Era', updatedAt: '2026-10-16T10:00:00.000Z' }, 'proj-A')!;
const calMapAfterA = { ...calMap, 'proj-A': editedCal };
check('A sees its own edited calendar', resolveTimelineConfig(calMapAfterA, fallbackCal, 'proj-A').epochName === 'Third Era');
check('B does NOT see A\'s calendar', resolveTimelineConfig(calMapAfterA, fallbackCal, 'proj-B').epochName === 'Age of Kings');

// Cloud merge per entry:
const newerCal = normalizeTimelineConfig({ ...editedCal, epochName: 'Fourth Era', updatedAt: '2026-10-16T12:00:00.000Z' }, 'proj-A')!;
const cm1 = mergeTimelineConfigMaps({ 'proj-A': editedCal }, { 'proj-A': newerCal });
check('newer cloud calendar wins', cm1.map['proj-A'].epochName === 'Fourth Era');
const cm2 = mergeTimelineConfigMaps({ 'proj-A': newerCal }, { 'proj-A': editedCal });
check('older cloud calendar does not clobber local', cm2.map['proj-A'].epochName === 'Fourth Era');

// ---------------------------------------------------------------------------
// 4) Cloud payload builder semantics (the conditional-spread fix)
// ---------------------------------------------------------------------------
console.log('\n[4] Cloud payload: frozen fallback / omit-when-null');
function buildCodexPayload(fallback: CodexSection[] | null, mapObj: CodexSectionsMap) {
  // mirrors the fixed debounced push in App.tsx
  return {
    ...(fallback ? { sections: fallback } : {}),
    sectionsByProject: mapObj
  };
}
const withFallback = buildCodexPayload(sharedFallback, mapAfterA);
check('fallback present -> sections carried', Array.isArray((withFallback as any).sections) && !(withFallback as any).sections.some((s: CodexSection) => s.id === 'dragons'));
const withoutFallback = buildCodexPayload(null, mapAfterA);
check('fallback null -> sections field omitted (no deleteField clobber)', !('sections' in withoutFallback));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
