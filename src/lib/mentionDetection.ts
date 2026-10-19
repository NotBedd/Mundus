/**
 * Whole-word / whole-phrase mention detection for Mundus.
 *
 * Character names, aliases, and codex titles must only be detected when they
 * appear as standalone words in the document text — never inside other words.
 * e.g. the alias "King" must match "the King returned" but must NOT match
 * "asking", "looking", "making" or "Kingdom".
 *
 * Implementation notes:
 * - Unicode-aware boundaries: `(?<![\p{L}\p{N}])` / `(?![\p{L}\p{N}])` reject
 *   matches glued to any letter or digit (works for accented names too, where
 *   the ASCII `\b` assertion fails).
 * - Whitespace inside a phrase is matched flexibly (`\s+`), so "Kaelen  Vance"
 *   in the text still matches the name "Kaelen Vance".
 * - Possessives and contractions still match ("King's" counts as "King").
 * - Patterns are compiled once per phrase and cached for performance, since
 *   detection re-runs on every keystroke while the manuscript changes.
 */

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
const escapeRegExp = (text: string): string => text.replace(ESCAPE_RE, '\\$&');

const phrasePatternCache = new Map<string, RegExp | null>();

function getMentionPattern(phrase: string): RegExp | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;

  const cached = phrasePatternCache.get(trimmed);
  if (cached !== undefined) return cached;

  const literal = trimmed.split(/\s+/).map(escapeRegExp).join('\\s+');
  let pattern: RegExp | null = null;

  try {
    // Unicode-aware whole-word boundaries (lookbehind is supported by all
    // modern Chromium/Firefox/Safari runtimes Mundus targets).
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${literal}(?![\\p{L}\\p{N}])`, 'iu');
  } catch {
    try {
      // Fallback for engines without lookbehind / unicode property escapes.
      pattern = new RegExp(`\\b${literal}\\b`, 'i');
    } catch {
      pattern = null;
    }
  }

  phrasePatternCache.set(trimmed, pattern);
  return pattern;
}

/**
 * Returns true when `phrase` appears in `haystack` as a standalone word or
 * phrase (not glued to other letters/digits on either side).
 */
export function matchesMention(haystack: string | null | undefined, phrase: string | null | undefined): boolean {
  if (!haystack || !phrase) return false;
  const pattern = getMentionPattern(phrase);
  if (!pattern) return false;
  pattern.lastIndex = 0;
  return pattern.test(haystack);
}

/**
 * Convenience: true when ANY of the phrases is mentioned in the haystack.
 */
export function matchesAnyMention(haystack: string | null | undefined, phrases: string[]): boolean {
  if (!haystack || !phrases || phrases.length === 0) return false;
  for (const phrase of phrases) {
    if (matchesMention(haystack, phrase)) return true;
  }
  return false;
}
