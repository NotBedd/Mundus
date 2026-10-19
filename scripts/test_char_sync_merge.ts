// Unit tests for v0.7.75 character sync helpers (mergeCharacterRosters,
// charTimestampMs, normalizeCharacterTimestamps) + tombstone behavior.
// Run: bun scripts/test_char_sync_merge.ts

// bun has no localStorage — shim it BEFORE importing syncManager.
const __store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (__store.has(k) ? __store.get(k)! : null),
  setItem: (k: string, v: string) => void __store.set(k, String(v)),
  removeItem: (k: string) => void __store.delete(k),
  clear: () => void __store.clear(),
  key: (i: number) => Array.from(__store.keys())[i] ?? null,
  get length() {
    return __store.size;
  },
};

const {
  mergeCharacterRosters,
  charTimestampMs,
  normalizeCharacterTimestamps,
  markCharacterDeleted,
  isCharacterDeleted,
  getDeletedCharacterIds,
  pruneCharacterTombstones,
} = await import('../src/lib/syncManager');
import type { Character } from '../src/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`);
  }
}

function mkChar(id: string, updatedAt: string, extra: Partial<Character> = {}): Character {
  return {
    id,
    userId: 'author',
    mundusId: 'mundus-a',
    name: `Char ${id}`,
    aliases: '',
    sex: 'Male',
    status: 'alive',
    roles: ['Supporting'],
    factions: [],
    families: [],
    tags: [],
    birthTime: '',
    birthPlace: '',
    deathTime: '',
    deathPlace: '',
    appearance: '',
    overview: '',
    notes: '',
    avatarColor: '#8b5cf6',
    createdAt: updatedAt,
    updatedAt,
    ...extra,
  } as Character;
}

const T1 = '2026-01-01T10:00:00.000Z';
const T2 = '2026-01-02T10:00:00.000Z';

console.log('--- charTimestampMs ---');
check('parses updatedAt', charTimestampMs(mkChar('a', T1)) === Date.parse(T1));
check('falls back to createdAt', charTimestampMs({ updatedAt: undefined as any, createdAt: T1 } as any) === Date.parse(T1));
check('missing everything = 0', charTimestampMs({} as any) === 0);
check('null = 0', charTimestampMs(null) === 0);
check('garbage = 0', charTimestampMs({ updatedAt: 'not-a-date' } as any) === 0);

console.log('--- mergeCharacterRosters: union & newest-wins ---');
const localOnly = mkChar('local-only', T1);
const cloudOnly = mkChar('cloud-only', T1);
const newerLocal = mkChar('shared', T2, { name: 'Local newer' });
const olderCloud = mkChar('shared', T1, { name: 'Cloud older' });
const merged = mergeCharacterRosters([localOnly, newerLocal], [cloudOnly, olderCloud]);
check('keeps local-only character', merged.some((c) => c.id === 'local-only'));
check('keeps cloud-only character', merged.some((c) => c.id === 'cloud-only'));
check('newer local beats older cloud', merged.find((c) => c.id === 'shared')?.name === 'Local newer');
check('union size = 3', merged.length === 3);

console.log('--- mergeCharacterRosters: ties & tombstones ---');
const tieLocal = mkChar('x', T1, { name: 'Local tie' });
const tieCloud = mkChar('x', T1, { name: 'Cloud tie' });
const mergedTie = mergeCharacterRosters([tieLocal], [tieCloud]);
check('primary (live state) wins ties', mergedTie.find((c) => c.id === 'x')?.name === 'Local tie');
// primary = storage, secondary = state (order reversed by caller in some paths)
const mergedTie2 = mergeCharacterRosters([tieCloud], [tieLocal]);
check('primary wins ties regardless of which side', mergedTie2.find((c) => c.id === 'x')?.name === 'Cloud tie');

const tombstoned = mkChar('dead', T2);
const mergedDead = mergeCharacterRosters([tombstoned], [tombstoned], ['dead']);
check('tombstoned id never resurrected', mergedDead.length === 0);
check('inputs not mutated (localOnly still intact)', localOnly.updatedAt === T1);

console.log('--- normalizeCharacterTimestamps ---');
const nowIso = '2026-02-01T00:00:00.000Z';
const broken: any = { id: 'b', name: 'No timestamps' };
const fixed = normalizeCharacterTimestamps(broken, nowIso);
check('stamps missing updatedAt', !!fixed.updatedAt && fixed.updatedAt === nowIso);
check('stamps missing createdAt', !!fixed.createdAt && fixed.createdAt === nowIso);
const halfBroken: any = { id: 'c', createdAt: T1 };
const fixed2 = normalizeCharacterTimestamps(halfBroken, nowIso);
check('updatedAt repaired from createdAt', fixed2.updatedAt === T1);
check('createdAt preserved', fixed2.createdAt === T1);
const healthy = mkChar('h', T2);
const untouched = normalizeCharacterTimestamps(healthy, nowIso);
check('healthy char untouched (same ref)', untouched === healthy);

console.log('--- tombstones (localStorage) ---');
markCharacterDeleted('char-123');
check('isCharacterDeleted true after mark', isCharacterDeleted('char-123'));
check('getDeletedCharacterIds contains id', getDeletedCharacterIds().includes('char-123'));
markCharacterDeleted('char-123'); // idempotent
check('idempotent mark (single entry)', getDeletedCharacterIds().filter((i) => i === 'char-123').length === 1);
markCharacterDeleted('char-456');
check('two tombstones', getDeletedCharacterIds().includes('char-456'));
pruneCharacterTombstones();
check('survives prune (fresh tombstones)', isCharacterDeleted('char-123') && isCharacterDeleted('char-456'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
