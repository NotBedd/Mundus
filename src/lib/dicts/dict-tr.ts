// v0.8.65 — Hunspell dictionary chunk for 'tr' (lazy-loaded, one at a time).
// Raw strings from the dictionary-tr npm package (Chrome's own dictionary
// data, Turkish — LANG tr_TR, SET UTF-8). Kept in a dedicated module so Vite
// code-splits each language: only the ACTIVE language's chunk is ever
// fetched and held in memory.
//
// Note: Turkish is an agglutinative language with complex affix rules, so
// its dictionary is the heaviest of the shipped languages (~8.7 MB of raw
// aff/dic data, more rules than Italian). It loads and constructs exactly
// like the others (Hunspell WASM applies rules lazily per lookup), but the
// first switch to it fetches a larger chunk than es/fr/it/de.
import aff from 'dictionary-tr/index.aff?raw';
import dic from 'dictionary-tr/index.dic?raw';

export const lang = 'tr';
export const hunspell = { aff, dic };
