// v0.8.65 — Hunspell dictionary chunk for 'ru' (lazy-loaded, one at a time).
// Raw strings from the dictionary-ru npm package (Chrome's own dictionary
// data, Russian — Cyrillic, SET UTF-8). Kept in a dedicated module so Vite
// code-splits each language: only the ACTIVE language's chunk is ever
// fetched and held in memory. The spell engine's word tokenizer matches
// \p{L} (Unicode letters), so Cyrillic text tokenizes natively — no
// transliteration or special casing involved.
import aff from 'dictionary-ru/index.aff?raw';
import dic from 'dictionary-ru/index.dic?raw';

export const lang = 'ru';
export const hunspell = { aff, dic };
