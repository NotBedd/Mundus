// Custom Dictionary and Spell Check Manager for Mundus

const BASE_STORAGE_KEY = 'mundus_custom_dictionary';
const SPELLCHECK_KEY = 'mundus_spellcheck_enabled';

const DEFAULT_DICTIONARY: string[] = [];

function getProjectStorageKey(projectId?: string): string {
  if (projectId && projectId.trim()) {
    return `${BASE_STORAGE_KEY}_${projectId.trim()}`;
  }
  return BASE_STORAGE_KEY;
}

export function getSpellCheckEnabled(): boolean {
  try {
    const saved = localStorage.getItem(SPELLCHECK_KEY);
    return saved !== null ? saved === 'true' : true; // Enabled by default
  } catch {
    return true;
  }
}

export function setSpellCheckEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SPELLCHECK_KEY, String(enabled));
  } catch (e) {
    console.error('Failed to save spellcheck setting:', e);
  }
}

export function getCustomDictionary(projectId?: string): string[] {
  try {
    const key = getProjectStorageKey(projectId);
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to parse custom dictionary:', e);
  }
  return DEFAULT_DICTIONARY;
}

export function saveCustomDictionary(words: string[], projectId?: string): void {
  try {
    const key = getProjectStorageKey(projectId);
    localStorage.setItem(key, JSON.stringify(words));
  } catch (e) {
    console.error('Failed to save custom dictionary:', e);
  }
}

export function addWordToDictionary(rawWord: string, projectId?: string): string[] {
  const word = rawWord.trim();
  if (!word) return getCustomDictionary(projectId);

  const current = getCustomDictionary(projectId);
  const exists = current.some((w) => w.toLowerCase() === word.toLowerCase());
  if (exists) return current;

  const updated = [...current, word].sort((a, b) => a.localeCompare(b));
  try {
    const key = getProjectStorageKey(projectId);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save custom word:', e);
  }
  return updated;
}

export function removeWordFromDictionary(rawWord: string, projectId?: string): string[] {
  const word = rawWord.trim().toLowerCase();
  const current = getCustomDictionary(projectId);
  const updated = current.filter((w) => w.toLowerCase() !== word);
  try {
    const key = getProjectStorageKey(projectId);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to remove custom word:', e);
  }
  return updated;
}

const CHAR_HIGHLIGHT_KEY = 'mundus_character_name_highlight_enabled';

export function getCharacterNameHighlightEnabled(): boolean {
  try {
    const saved = localStorage.getItem(CHAR_HIGHLIGHT_KEY);
    return saved !== null ? saved === 'true' : false; // Disabled by default
  } catch {
    return false;
  }
}

export function setCharacterNameHighlightEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(CHAR_HIGHLIGHT_KEY, String(enabled));
  } catch (e) {
    console.error('Failed to save character name highlight setting:', e);
  }
}
