// Unit tests for src/lib/sceneDetection.ts — v0.7.89 "In This Scene"
// NAME-ONLY detection with whole-word name parts: an entity is detected by
// its full name/title phrase OR by any individual whole word of that name
// ("Kaelen" triggers "Kaelen Vance"; "Kael" does not). Aliases, epithets,
// character titles, subtitles and description fields must NEVER trigger.
// Generic words ("the", "of", ...) never trigger on their own.
// Run: npx tsx scripts/test_scene_detection.ts
import { detectInSceneEntryIds, detectInSceneCharacterIds } from '../src/lib/sceneDetection';
import type { CodexEntry, Character } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  ok ', name); }
  else { fail++; console.log('  FAIL', name); }
}

function makeEntry(partial: Partial<CodexEntry>): CodexEntry {
  return {
    id: 'e1', userId: 'u', title: 'Iron Crown', category: 'artifacts',
    overview: '', content: '', tags: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

function makeChar(partial: Partial<Character>): Character {
  return {
    id: 'c1', userId: 'u', name: 'Kaelen Vance', sex: 'Male', status: 'Alive',
    roles: [], factions: [], families: [], tags: [], overview: '',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  } as Character;
}

console.log('[1] Codex entries — full-title phrase matching');
const entries = [
  makeEntry({ id: 'a', title: 'The Iron Crown' }),
  makeEntry({ id: 'b', title: 'Rovengard', subtitle: 'Seat of House Vance' }),
];
check('full title matches', detectInSceneEntryIds(entries, 'He lifted the Iron Crown high.').has('a'));
check('flexible whitespace inside phrase matches', detectInSceneEntryIds(entries, 'the  Iron\nCrown glows').has('a'));
check('case-insensitive match', detectInSceneEntryIds(entries, 'THE IRON CROWN').has('a'));
check('possessive still matches', detectInSceneEntryIds(entries, "the Iron Crown's edge").has('a'));

console.log('[2] Codex entries — whole title words match (v0.7.89)');
check('title word ("crown") matches', detectInSceneEntryIds(entries, 'a golden crown').has('a'));
check('another title word ("iron") matches', detectInSceneEntryIds(entries, 'iron bars bent').has('a'));
check('generic word ("the") alone does NOT match', !detectInSceneEntryIds(entries, 'the village burned').has('a'));
check('stopword ("of") alone does NOT match', !detectInSceneEntryIds(
  [makeEntry({ id: 'f', title: 'Rite of Ashes' })], 'the war of kings ended'
).has('f'));
check('full stopword title still matches as phrase', detectInSceneEntryIds(
  [makeEntry({ id: 'f', title: 'Rite of Ashes' })], 'the Rite of Ashes was read'
).has('f'));

console.log('[3] Codex entries — fragments, subtitles and fields NEVER match');
check('title glued inside another word does NOT match', !detectInSceneEntryIds(entries, 'a crowning moment').has('a'));
check('substring of a longer word does NOT match', !detectInSceneEntryIds(
  [makeEntry({ id: 'e', title: 'King' })], 'the asking looking making Kingdom'
).has('e'));
check('standalone word matches', detectInSceneEntryIds([makeEntry({ id: 'e', title: 'King' })], 'the King returned').has('e'));
check('subtitle phrase does NOT match', !detectInSceneEntryIds(entries, 'Seat of House Vance stood tall').has('b'));
check('overview/description text does NOT match', !detectInSceneEntryIds(
  [makeEntry({ id: 'c', title: 'Xylos', overview: 'ancient elven relic of doom' })],
  'the ancient elven relic of doom was lost'
).has('c'));
check('entry with empty title never matches', !detectInSceneEntryIds([makeEntry({ id: 'd', title: '' })], 'anything at all').has('d'));

console.log('[4] Characters — full-name phrase matching');
const chars = [
  makeChar({ id: 'p', name: 'Kaelen Vance', aliases: 'The Stormblade, King' }),
  makeChar({ id: 'q', name: 'Mira' }),
];
check('full name matches', detectInSceneCharacterIds(chars, 'Kaelen Vance entered the hall.').has('p'));
check('case-insensitive full name matches', detectInSceneCharacterIds(chars, 'kaelen vance nodded').has('p'));
check('multi-space name still matches', detectInSceneCharacterIds(chars, 'Kaelen  Vance spoke').has('p'));

console.log('[5] Characters — whole name words match; aliases/epithets NEVER (v0.7.89)');
check('first-name word ("Kaelen") alone matches', detectInSceneCharacterIds(chars, 'Kaelen walked in').has('p'));
check('surname word ("Vance") alone matches', detectInSceneCharacterIds(chars, 'House Vance gathered').has('p'));
check('partial word ("Kael") does NOT match', !detectInSceneCharacterIds(chars, 'Kael walked in').has('p'));
check('partial suffix ("aelen") does NOT match', !detectInSceneCharacterIds(chars, 'aelen walked in').has('p'));
check('possessive of name word matches ("Kaelen\'s")', detectInSceneCharacterIds(chars, "Kaelen's sword glowed").has('p'));
check('alias ("The Stormblade") does NOT match', !detectInSceneCharacterIds(chars, 'the Stormblade appeared').has('p'));
check('alias ("King") does NOT match', !detectInSceneCharacterIds(chars, 'the King returned').has('p'));
check('character role/title ("General of Army X") does NOT match via "General"', !detectInSceneCharacterIds(
  [makeChar({ id: 'g', name: 'Doran Holt', roles: ['General of Army X'] })],
  'the General rode out'
).has('g'));
check('other character still detected independently', detectInSceneCharacterIds(chars, 'Mira smiled at House Vance').has('q'));
check('short name (2 letters) matches as full name', detectInSceneCharacterIds(
  [makeChar({ id: 'r', name: 'Bo' })], 'Bo laughed'
).has('r'));

console.log('[6] Stopword/generic words inside names never trigger alone');
const stormChars = [makeChar({ id: 's', name: 'The Storm King', aliases: 'Old Tempest' })];
check('full stylized name matches', detectInSceneCharacterIds(stormChars, 'the Storm King awoke').has('s'));
check('meaningful word ("Storm") matches', detectInSceneCharacterIds(stormChars, 'a storm was coming').has('s'));
check('meaningful word ("King") matches', detectInSceneCharacterIds(stormChars, 'the King was angry').has('s'));
check('generic word ("the") alone does NOT match', !detectInSceneCharacterIds(stormChars, 'the end').has('s'));
check('alias ("Old Tempest") does NOT match', !detectInSceneCharacterIds(stormChars, 'Old Tempest stirred').has('s'));

console.log('[7] Edge cases');
check('empty text -> no entries', detectInSceneEntryIds(entries, '').size === 0);
check('whitespace text -> no characters', detectInSceneCharacterIds(chars, '   \n\t  ').size === 0);
check('null/undefined text -> empty set', detectInSceneEntryIds(entries, undefined).size === 0 && detectInSceneCharacterIds(chars, null as any).size === 0);
check('empty rosters -> empty set', detectInSceneEntryIds([], 'Iron Crown').size === 0 && detectInSceneCharacterIds([], 'Mira').size === 0);
check('same name in both fields detected independently', detectInSceneEntryIds(entries, 'Rovengard').has('b'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
