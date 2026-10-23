// v0.8.61 — Hunspell dictionary chunk for 'de' (lazy-loaded, one at a time).
// Raw strings from the dictionary-de npm package (Chrome's own dictionary
// data). Kept in a dedicated module so Vite code-splits each language: only
// the ACTIVE language's chunk is ever fetched and held in memory.
import aff from 'dictionary-de/index.aff?raw';
import dic from 'dictionary-de/index.dic?raw';

export const lang = 'de';
export const hunspell = { aff, dic };
