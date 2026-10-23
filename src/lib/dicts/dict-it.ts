// v0.8.61 — Hunspell dictionary chunk for 'it' (lazy-loaded, one at a time).
// Raw strings from the dictionary-it npm package (Chrome's own dictionary
// data). Kept in a dedicated module so Vite code-splits each language: only
// the ACTIVE language's chunk is ever fetched and held in memory.
import aff from 'dictionary-it/index.aff?raw';
import dic from 'dictionary-it/index.dic?raw';

export const lang = 'it';
export const hunspell = { aff, dic };
