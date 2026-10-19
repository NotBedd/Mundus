// Unit tests for the v0.7.75 character sanitizer (root-cause fix for the
// event/fiber junk that bloated characters until storage/quota/cloud broke).
// Run: bun scripts/test_char_sanitize.ts

const __store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (__store.has(k) ? __store.get(k)! : null),
  setItem: (k: string, v: string) => void __store.set(k, String(v)),
  removeItem: (k: string) => void __store.delete(k),
  clear: () => void __store.clear(),
};

const { sanitizeCharacter, pickCharacterFields, CHARACTER_FIELD_SET } = await import('../src/lib/characterSanitize');
import type { Character } from '../src/types';

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.error(`  FAIL ${name}`); }
}

function mkChar(): Character {
  return {
    id: 'char-1', userId: 'author', mundusId: 'mundus-a', name: 'Kaelen',
    aliases: 'The King', sex: 'Male', status: 'alive', roles: ['Protagonist'],
    factions: ['Order'], families: ['House V'], tags: ['hero'],
    relatives: { father: 'char-2', mother: '', siblings: ['char-3'], partners: [], children: [] },
    birthTime: 'Y 418', birthPlace: 'Oakhaven', deathTime: '', deathPlace: '',
    appearance: 'tall', overview: 'A hero.', notes: 'secret',
    avatarColor: '#8b5cf6', avatarUrl: 'http://x/y.png',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

console.log('--- sanitizeCharacter: clean char passes through ---');
const clean = sanitizeCharacter(mkChar());
check('returns the character', !!clean && clean.name === 'Kaelen');
check('keeps relatives', clean?.relatives?.father === 'char-2');
check('keeps arrays', Array.isArray(clean?.roles) && clean!.roles[0] === 'Protagonist');

console.log('--- sanitizeCharacter: event/fiber junk is stripped ---');
// Simulate what the old bug produced: a character whose fields were overlaid
// by a React SyntheticEvent spread (target DOM node + fiber internals).
const junked: any = mkChar();
junked.target = { id: 'btn-create-new-character', tagName: 'BUTTON', _reactInternals: { tag: 5, memoizedState: { x: 1 } } };
junked.nativeEvent = { isTrusted: false, view: { document: {} } };
junked._reactName = 'onClick';
junked.type = 'click';           // NOT a whitelisted field
junked.memoizedState = { a: 1 }; // NOT whitelisted
junked.relatives = { ...junked.relatives, children: ['ok', 42, null] };
junked.roles = ['Protagonist', 5, undefined];
const cleanJunk = sanitizeCharacter(junked) as any;
check('junk fields removed (no target/nativeEvent/_reactName/type/memoizedState)',
  cleanJunk && !('target' in cleanJunk) && !('nativeEvent' in cleanJunk) &&
  !('_reactName' in cleanJunk) && !('type' in cleanJunk) && !('memoizedState' in cleanJunk));
check('known fields survive', cleanJunk.name === 'Kaelen' && cleanJunk.aliases === 'The King');
check('junked array entries dropped', JSON.stringify(cleanJunk.roles) === JSON.stringify(['Protagonist']));
check('relatives arrays cleaned', JSON.stringify(cleanJunk.relatives.children) === JSON.stringify(['ok']));
check('output is small (no fiber bloat)', JSON.stringify(cleanJunk).length < 2000);

console.log('--- sanitizeCharacter: edge cases ---');
check('null -> null', sanitizeCharacter(null) === null);
check('array -> null', sanitizeCharacter([1, 2]) === null);
check('no id -> null', sanitizeCharacter({ name: 'x' }) === null);
check('empty id -> null', sanitizeCharacter({ id: '  ', name: 'x' }) === null);
const minimal = sanitizeCharacter({ id: 'char-9' }) as any;
check('minimal char gets defaults', minimal.name === 'Unnamed Character' && Array.isArray(minimal.roles) && minimal.overview === '');
const coerced = sanitizeCharacter({ id: 'char-10', name: { deep: 'object' }, tags: 'not-an-array' }) as any;
check('object name -> default', coerced.name === 'Unnamed Character');
check('string tags -> []', JSON.stringify(coerced.tags) === '[]');

console.log('--- pickCharacterFields: the click-event fix ---');
const fakeEvent: any = { type: 'click', target: { id: 'btn' }, nativeEvent: {}, _reactName: 'onClick' };
const picked = pickCharacterFields(fakeEvent);
check('event yields NO character fields', Object.keys(picked).length === 0);
const drawerData = { name: 'Mira', aliases: undefined, status: 'alive', tags: ['mage'], updatedAt: '2026-01-01T00:00:00.000Z', junk: { big: true } } as any;
const picked2 = pickCharacterFields(drawerData);
check('drawer fields picked', (picked2 as any).name === 'Mira' && (picked2 as any).status === 'alive');
check('junk keys not picked', !('junk' in picked2));
check('whitelist has no stray fields', !CHARACTER_FIELD_SET.has('type') && !CHARACTER_FIELD_SET.has('target'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
