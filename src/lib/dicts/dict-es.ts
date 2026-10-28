// v0.8.61 — Hunspell dictionary chunk for 'es' (lazy-loaded, one at a time).
// Raw strings from the dictionary-es npm package (Chrome's own dictionary
// data). Kept in a dedicated module so Vite code-splits each language: only
// the ACTIVE language's chunk is ever fetched and held in memory.
import aff from 'dictionary-es/index.aff?raw';
import dic from 'dictionary-es/index.dic?raw';

export const lang = 'es';
export const hunspell = { aff, dic };
