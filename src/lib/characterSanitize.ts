// Character sanitizer (v0.7.75) — root-cause fix for "characters disappear /
// don't sync".
//
// ROOT CAUSE: CharactersMode wired the "New Character" button as
// `onClick={onCreateCharacter}`, passing the React click EVENT straight into
// handleCreateCharacter, which spread it over the new character
// (`...overrides`). The event drags the DOM node and the ENTIRE React fiber
// tree (memoizedState = whole app state) into the character object — observed
// ~330KB of junk for a single fresh character, growing with app state size.
// Consequences: Firestore writes blow past the 1MB document limit (characters
// never reach other devices) and localStorage quota explodes (persistence
// fails, characters vanish on reload). Codex entries were unaffected because
// they always received clean data objects.
//
// sanitizeCharacter() rebuilds a character from WHITELISTED fields only, so
// event/fiber/DOM junk can never enter storage or the cloud again — and
// existing polluted characters are repaired the next time they pass through a
// load/merge/save point.
import type { Character, CharacterRelatives } from '../types';

const CHARACTER_FIELDS = [
  'id', 'userId', 'mundusId', 'name', 'aliases', 'sex', 'status',
  'roles', 'factions', 'families', 'tags', 'relatives',
  'birthTime', 'birthPlace', 'deathTime', 'deathPlace',
  'appearance', 'overview', 'notes', 'avatarColor', 'avatarUrl',
  'createdAt', 'updatedAt',
] as const;

export const CHARACTER_FIELD_SET: ReadonlySet<string> = new Set(CHARACTER_FIELDS);

const STRING_FIELDS = [
  'id', 'userId', 'mundusId', 'name', 'aliases', 'sex', 'status',
  'birthTime', 'birthPlace', 'deathTime', 'deathPlace',
  'appearance', 'overview', 'notes', 'avatarColor', 'avatarUrl',
  'createdAt', 'updatedAt',
] as const;

const ARRAY_STRING_FIELDS = ['roles', 'factions', 'families', 'tags'] as const;

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function cleanRelatives(value: unknown): CharacterRelatives {
  const rel = (value && typeof value === 'object' && !Array.isArray(value))
    ? value as Record<string, unknown>
    : {};
  return {
    father: typeof rel.father === 'string' ? rel.father : '',
    mother: typeof rel.mother === 'string' ? rel.mother : '',
    siblings: cleanStringArray(rel.siblings),
    partners: cleanStringArray(rel.partners),
    children: cleanStringArray(rel.children),
  };
}

/**
 * Rebuilds a character from whitelisted fields only. Returns null for
 * non-objects / entries without a usable id. Junk-free output is safe for
 * localStorage and Firestore.
 */
export function sanitizeCharacter(input: unknown): Character | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  if (typeof src.id !== 'string' || !src.id.trim()) return null;

  const out: Record<string, unknown> = {};
  for (const field of CHARACTER_FIELDS) {
    if (src[field] !== undefined) out[field] = src[field];
  }

  for (const field of STRING_FIELDS) {
    const v = out[field];
    if (v === undefined || v === null) {
      out[field] = field === 'name' ? 'Unnamed Character' : '';
    } else if (typeof v !== 'string') {
      // A junked field may hold an object/array — coerce or drop to defaults.
      out[field] = field === 'name' ? 'Unnamed Character' : '';
    }
  }

  for (const field of ARRAY_STRING_FIELDS) {
    out[field] = cleanStringArray(out[field]);
  }

  out.relatives = cleanRelatives(out.relatives);
  return out as unknown as Character;
}

/**
 * Copies ONLY whitelisted character fields from any source object. Used by
 * handleCreateCharacter so an accidentally-passed React event (or any foreign
 * object) can no longer pollute a new character — and explicit `undefined`
 * values from form drawers (`field: value || undefined`) are copied as-is and
 * coalesced by the caller.
 */
export function pickCharacterFields(source: unknown): Partial<Character> {
  const out: Record<string, unknown> = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  const src = source as Record<string, unknown>;
  for (const field of CHARACTER_FIELDS) {
    if (src[field] !== undefined) out[field] = src[field];
  }
  return out as Partial<Character>;
}
