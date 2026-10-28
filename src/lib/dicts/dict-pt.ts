// v0.8.65 — Hunspell dictionary chunk for 'pt' (lazy-loaded, one at a time).
// Raw strings from the dictionary-pt npm package (Chrome's own dictionary
// data, European Portuguese — LibreOffice pt_PT, post-1990 agreement).
// Kept in a dedicated module so Vite code-splits each language: only
// the ACTIVE language's chunk is ever fetched and held in memory.
import aff from 'dictionary-pt/index.aff?raw';
import dic from 'dictionary-pt/index.dic?raw';

export const lang = 'pt';
export const hunspell = { aff, dic };
