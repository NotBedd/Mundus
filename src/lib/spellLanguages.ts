// v0.8.61 — Multi-language spellcheck infrastructure
// ---------------------------------------------------------------------
// The app ships real Hunspell dictionaries (the SAME dictionaries Chrome /
// electron-spellchecker reuse, packaged for the browser by the `dictionary-*`
// npm family) and checks text through `nspell`, a pure-JS Hunspell engine.
//
// Design constraints honored:
//   - ONE dictionary in memory at a time: each language lives in its own
//     lazy chunk (src/lib/dicts/dict-<code>.ts). Switching language drops
//     the previous nspell instance and its raw strings.
//   - English keeps the original v0.7.8 in-memory wordlist engine (fast,
//     no loading) — Hunspell is only consulted for non-English languages.
//   - v0.8.63: the v0.8.61 automatic language detection (stopword scoring)
//     was REMOVED at the user's request — it never worked reliably and the
//     silent fallbacks confused the dictionary UX. The setting is now a
//     plain manual choice; a legacy stored 'auto' value resolves to
//     English (the previous effective default).
//   - v0.8.65: Portuguese (pt — European, LibreOffice pt_PT), Turkish (tr)
//     and Russian (ru) join es/fr/it/de as Hunspell-backed languages. All
//     three ship SET UTF-8 dictionaries and ride the exact same engine
//     path (tokenize by Unicode letters → hunspell-asm). Autocorrect/
//     grammar suggestions remain English-only (Harper), unchanged.

export interface SpellLanguageInfo {
  code: string;
  name: string;
}

export const SPELL_LANGUAGES: SpellLanguageInfo[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'it', name: 'Italiano (Italian)' },
  { code: 'de', name: 'Deutsch (German)' },
  // v0.8.65: Portuguese / Turkish / Russian join the Hunspell family —
  // same real dictionary data Chrome ships, same one-at-a-time lazy chunks.
  { code: 'pt', name: 'Português (Portuguese)' },
  { code: 'tr', name: 'Türkçe (Turkish)' },
  { code: 'ru', name: 'Русский (Russian)' },
];

const LANG_SETTING_KEY = 'mundus_spell_language';

/**
 * v0.8.63: manual-only. A legacy stored 'auto' (v0.8.61) or anything unknown
 * resolves to English, which was the effective default under Auto anyway.
 */
export function getSpellLanguageSetting(): string {
  try {
    const saved = localStorage.getItem(LANG_SETTING_KEY);
    if (saved && SPELL_LANGUAGES.some((l) => l.code === saved)) {
      return saved;
    }
  } catch { /* private mode */ }
  return 'en';
}

export function setSpellLanguageSetting(value: string): void {
  try {
    localStorage.setItem(LANG_SETTING_KEY, value);
  } catch { /* private mode */ }
}


