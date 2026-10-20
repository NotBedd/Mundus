/**
 * v0.7.95 — tests for purgeDeletedCharacterReferences + looksLikeCharacterId.
 *
 * Regression context: deleting a character used to leave their raw id inside
 * every survivor's relatives (father/mother strings, siblings/partners/children
 * arrays). The UI then displayed the id itself — the user-visible bug was
 * "a number remains shown as partner" after deleting one of two partners.
 *
 * Run: npx tsx scripts/test_relative_purge.ts
 */
import {
  purgeDeletedCharacterReferences,
  looksLikeCharacterId,
  syncRelativesAcrossCharacters,
} from '../src/utils/characterRelativesSync';
import type { Character } from '../src/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function makeChar(partial: Partial<Character> & { id: string; name: string }): Character {
  return {
    userId: 'test-user',
    sex: 'Other',
    status: 'alive',
    roles: [],
    factions: [],
    families: [],
    tags: [],
    overview: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    mundusId: 'mundus-test',
    ...partial,
  } as Character;
}

console.log('\n=== looksLikeCharacterId ===');
assert(looksLikeCharacterId('char-1729218375034') === true, 'plain epoch id matches');
assert(looksLikeCharacterId('char-1729218375034-48210') === true, 'id with random suffix matches');
assert(looksLikeCharacterId('Kaelen') === false, 'plain name does not match');
assert(looksLikeCharacterId('char-abc') === false, 'non-numeric tail does not match');
assert(looksLikeCharacterId('char-') === false, 'bare prefix does not match');
assert(looksLikeCharacterId('') === false, 'empty string does not match');
assert(looksLikeCharacterId(undefined) === false, 'undefined does not match');
assert(looksLikeCharacterId('CHAR-123') === false, 'uppercase prefix does not match');

console.log('\n=== purgeDeletedCharacterReferences — the reported bug ===');
{
  const kaelen = makeChar({ id: 'char-1001', name: 'Kaelen' });
  const lyra = makeChar({
    id: 'char-1002',
    name: 'Lyra',
    relatives: { father: '', mother: '', siblings: [], partners: ['char-1001'], children: [] },
  });
  const res = purgeDeletedCharacterReferences([lyra], 'char-1001', 'Kaelen');
  assert(res.changedIds.length === 1 && res.changedIds[0] === 'char-1002', 'partner survivor is reported as changed');
  assert(res.list[0].relatives?.partners?.length === 0, 'deleted id removed from partners (the "number as partner" bug)');
  assert(res.list[0].updatedAt !== lyra.updatedAt, 'survivor updatedAt is bumped so the cleanup wins cloud merges');
}

console.log('\n=== purge — every relatives slot (full roster) ===');
{
  const survivor = makeChar({
    id: 'char-2001',
    name: 'Survivor',
    relatives: {
      father: 'char-2002',
      mother: 'char-2003',
      siblings: ['char-2004', 'Kaelen'],
      partners: ['char-2005'],
      children: ['char-2006'],
    },
  });
  const roster = [
    survivor,
    makeChar({ id: 'char-2002', name: 'Father' }),
    makeChar({ id: 'char-2003', name: 'Mother' }),
    makeChar({ id: 'char-2004', name: 'Brother' }),
    makeChar({ id: 'char-2005', name: 'Doomed Partner' }),
    makeChar({ id: 'char-2006', name: 'Kid' }),
  ];
  const res = purgeDeletedCharacterReferences(
    roster.filter((c) => c.id !== 'char-2005'),
    'char-2005',
    'Doomed Partner'
  );
  const rel = res.list.find((c) => c.id === 'char-2001')!.relatives!;
  assert(rel.father === 'char-2002', 'unrelated father kept');
  assert(rel.mother === 'char-2003', 'unrelated mother kept');
  assert(rel.partners?.length === 0, 'deleted id removed from partners');
  assert(rel.siblings?.length === 2 && rel.siblings?.includes('char-2004') && rel.siblings?.includes('Kaelen'), 'unrelated sibling id AND custom-name sibling both kept');
  assert(rel.children?.length === 1 && rel.children[0] === 'char-2006', 'unrelated child kept');
  assert(res.changedIds.length === 1 && res.changedIds[0] === 'char-2001', 'exactly the touched survivor changed');
}

console.log('\n=== purge — father/mother strings ===');
{
  const child = makeChar({
    id: 'char-3001',
    name: 'Child',
    relatives: { father: 'char-3002', mother: 'Matriarch', siblings: [], partners: [], children: [] },
  });
  const roster = [child, makeChar({ id: 'char-3002', name: 'Old Man' })];
  const res = purgeDeletedCharacterReferences(
    roster.filter((c) => c.id !== 'char-3002'),
    'char-3002',
    'Old Man'
  );
  assert(res.list[0].relatives?.father === '', 'deleted father id cleared');
  assert(res.list[0].relatives?.mother === 'Matriarch', 'custom-name mother kept');
}

console.log('\n=== purge — name-based refs ===');
{
  // Name unique among survivors -> purged.
  const a = makeChar({ id: 'char-4001', name: 'A', relatives: { father: '', mother: '', siblings: [], partners: ['Kaelen'], children: [] } });
  const b = makeChar({ id: 'char-4002', name: 'B' });
  const res1 = purgeDeletedCharacterReferences([a, b], 'char-9999', 'Kaelen');
  assert(res1.list[0].relatives?.partners?.length === 0, 'name-based ref purged when no survivor owns the name');

  // Another survivor owns the same name -> kept (may point at the survivor).
  const kaelen2 = makeChar({ id: 'char-4003', name: 'Kaelen' });
  const a2 = makeChar({ id: 'char-4004', name: 'A', relatives: { father: '', mother: '', siblings: [], partners: ['Kaelen'], children: [] } });
  const res2 = purgeDeletedCharacterReferences([a2, kaelen2], 'char-9999', 'Kaelen');
  assert(res2.list[0].relatives?.partners?.[0] === 'Kaelen', 'name-based ref kept when a same-named survivor exists');
}

console.log('\n=== purge — legacy dangling id cleanup (rule 2) ===');
{
  // char-888800001 / char-888800002 are id-shaped but resolve to nobody in the
  // roster — they are dangling pointers to deleted characters and are stripped.
  const hoarder = makeChar({
    id: 'char-5001',
    name: 'Hoarder',
    relatives: { father: 'char-888800001', mother: '', siblings: ['char-888800002'], partners: ['char-888800003'], children: [] },
  });
  const res = purgeDeletedCharacterReferences([hoarder], 'char-777700001');
  const rel = res.list[0].relatives!;
  assert(rel.father === '' && rel.siblings?.length === 0 && rel.partners?.length === 0, 'dangling id-shaped refs stripped opportunistically');
  assert(res.changedIds.length === 1, 'cleanup reported as changed');
}

console.log('\n=== purge — safety properties ===');
{
  const original = makeChar({
    id: 'char-6001',
    name: 'Original',
    relatives: { father: 'char-6002', mother: '', siblings: [], partners: ['char-6003'], children: [] },
  });
  const roster = [original, makeChar({ id: 'char-6002', name: 'Live Father' }), makeChar({ id: 'char-6003', name: 'Doomed' })];
  const frozen = JSON.stringify(original);
  const res = purgeDeletedCharacterReferences(
    roster.filter((c) => c.id !== 'char-6003'),
    'char-6003'
  );
  assert(JSON.stringify(original) === frozen, 'input roster is never mutated');
  assert(res.list[0] !== (original as any), 'changed survivors are new objects');
  assert(res.list[0].relatives?.father === 'char-6002', 'live refs survive');
}
{
  const noRel = makeChar({ id: 'char-7001', name: 'NoRel' });
  const res = purgeDeletedCharacterReferences([noRel], 'char-7001');
  assert(res.list[0] === noRel && res.changedIds.length === 0, 'character without relatives is untouched');
}

console.log('\n=== purge — integration with syncRelativesAcrossCharacters ===');
{
  // Deleting after a reciprocal sync must leave BOTH sides clean.
  const dad = makeChar({ id: 'char-8001', name: 'Dad', sex: 'Male' });
  const kid = makeChar({ id: 'char-8002', name: 'Kid', relatives: { father: 'char-8001', mother: '', siblings: [], partners: [], children: [] } });
  const synced = syncRelativesAcrossCharacters([dad, kid], 'char-8002', kid);
  const res = purgeDeletedCharacterReferences(synced.filter((c) => c.id !== 'char-8002'), 'char-8002', 'Kid');
  const dadAfter = res.list.find((c) => c.id === 'char-8001')!;
  assert((dadAfter.relatives?.children || []).length === 0, 'reciprocal child link purged from the father');
  assert(res.changedIds.includes('char-8001'), 'father reported as changed for cloud save');
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
