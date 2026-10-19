/**
 * "In This Scene" detection for Mundus (v0.7.89).
 *
 * NAME-ONLY matching — full name OR whole name words:
 * an entity counts as "in scene" when its NAME — the character's name or the
 * codex entry's title — appears in the manuscript either as the complete
 * name/title phrase or as any individual WHOLE WORD of that name.
 * e.g. the character "Kaelen Vance" is detected by "Kaelen Vance", by
 * "Kaelen" and by "Vance", but NOT by "Kael" (not a whole word).
 *
 * Fields OUTSIDE the name never trigger detection: character aliases,
 * epithets and titles (e.g. "General" from the character title
 * "General of Army X"), entry subtitles, overview/description text.
 *
 * Generic words that often appear inside longer names/titles ("the", "of",
 * "and", ...) are only meaningful inside the FULL phrase — they never act as
 * standalone triggers, so the entry "The Iron Crown" is detected by
 * "The Iron Crown", "Iron" and "Crown", but not by a stray "The".
 *
 * All matching is whole-word aware via matchesMention (Unicode boundaries,
 * flexible inner whitespace, possessives still count).
 */
import type { Character, CodexEntry } from '../types';
import { matchesAnyMention } from './mentionDetection';

/**
 * Words that are too generic to trigger detection on their own when they
 * appear as part of a longer name or title. They still count inside the
 * full name phrase ("The Iron Crown" matches as a whole).
 */
const NAME_TOKEN_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'into', 'over', 'under',
]);

/**
 * Builds the list of detectable phrases for a raw name/title:
 * the full name phrase plus every individual whole word of it
 * (single letters and generic stopwords excluded from the word list).
 */
function buildNamePhrases(rawName: string): string[] {
  const trimmed = rawName.trim();
  if (!trimmed) return [];
  const phrases = new Set<string>([trimmed]);
  trimmed.split(/\s+/).forEach((word) => {
    const cleaned = word.trim();
    // Skip initials / single letters — "J." or "X" alone would fire on noise.
    if (cleaned.length < 2) return;
    // Skip generic words ("the", "of", ...) — see NAME_TOKEN_STOPWORDS.
    if (NAME_TOKEN_STOPWORDS.has(cleaned.toLowerCase())) return;
    phrases.add(cleaned);
  });
  return [...phrases];
}

/**
 * Returns the ids of codex entries whose TITLE — the full title or any whole
 * word of it — appears in the scene text. Subtitles, overview and description
 * fields are intentionally NOT matched.
 */
export function detectInSceneEntryIds(
  codexEntries: CodexEntry[],
  documentPlainText: string | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!documentPlainText || !documentPlainText.trim()) return ids;
  const lowerText = documentPlainText.toLowerCase();

  codexEntries.forEach((entry) => {
    if (!entry.title) return;
    const phrases = buildNamePhrases(entry.title).map((p) => p.toLowerCase());
    if (phrases.length && matchesAnyMention(lowerText, phrases)) {
      ids.add(entry.id);
    }
  });

  return ids;
}

/**
 * Returns the ids of characters whose NAME — the full name or any whole word
 * of it — appears in the scene text. Aliases / epithets / titles are
 * intentionally NOT matched (name-only detection).
 */
export function detectInSceneCharacterIds(
  characters: Character[],
  documentPlainText: string | null | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!documentPlainText || !documentPlainText.trim()) return ids;
  const lowerText = documentPlainText.toLowerCase();

  characters.forEach((char) => {
    if (!char.name) return;
    const phrases = buildNamePhrases(char.name).map((p) => p.toLowerCase());
    if (phrases.length && matchesAnyMention(lowerText, phrases)) {
      ids.add(char.id);
    }
  });

  return ids;
}
