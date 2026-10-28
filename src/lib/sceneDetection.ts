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
import { matchesAnyMention, matchesMention } from './mentionDetection';

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

/**
 * v0.8.0: shared whole-word "which documents mention this entry" checker
 * (used by the Codex entry form's document list).
 *
 * The pre-0.8.0 implementation used raw substring matching
 * (`docText.includes(entryTitle)`), so an entry titled "Kyle" was reported as
 * mentioned by ANY document containing "xkylex", "xkyle" or "kylex" — within
 * word matches leaked into every detection surface. All comparisons now go
 * through matchesMention (Unicode whole-word boundaries, possessives still
 * count). Returns the human-readable reason ('' when not mentioned).
 */
export function getEntryDocumentMention(
  docTitle: string | null | undefined,
  docText: string | null | undefined,
  entryTitle: string,
  entrySubtitle?: string,
  entryTags?: string[]
): string {
  const title = (entryTitle || '').trim();
  if (!title || title.length < 2) return '';
  if (matchesMention(docTitle, title)) return 'In title';
  if (matchesMention(docText, title)) return 'Mentioned in text';
  const sub = (entrySubtitle || '').trim();
  if (sub.length >= 4 && matchesMention(docText, sub)) return 'Subtitle match';
  const tags = entryTags || [];
  if (tags.some((t) => t && t.trim().length >= 3 && matchesMention(docText, t.trim()))) {
    return 'Tag match';
  }
  return '';
}
