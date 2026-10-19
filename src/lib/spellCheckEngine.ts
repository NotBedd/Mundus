// Word-style Spell Check Engine for Mundus
// Provides real-time spellcheck, red wavy underline styling, suggestions, and comprehensive dictionary integration
import englishWords from 'an-array-of-english-words';

export interface MisspelledWordInfo {
  word: string;
  count: number;
  suggestions: string[];
  contexts: string[]; // Snippets of text showing where it appears
}

// Common misspellings and corrections mapping (Word-style smart autocorrect / suggestions)
const COMMON_TYPOS: Record<string, string[]> = {
  teh: ['the'],
  taht: ['that'],
  thier: ['their', 'there'],
  there: ['their', 'they\'re'],
  recieve: ['receive'],
  recieved: ['received'],
  recieving: ['receiving'],
  beleive: ['believe'],
  beleived: ['believed'],
  wierd: ['weird'],
  definately: ['definitely'],
  definatly: ['definitely'],
  seperate: ['separate'],
  seperated: ['separated'],
  untill: ['until'],
  occured: ['occurred'],
  occuring: ['occurring'],
  alot: ['a lot'],
  truely: ['truly'],
  wich: ['which'],
  goverment: ['government'],
  enviroment: ['environment'],
  neccessary: ['necessary'],
  necesary: ['necessary'],
  accomodate: ['accommodate'],
  embarass: ['embarrass'],
  tommorow: ['tomorrow'],
  tommorrow: ['tomorrow'],
  calender: ['calendar'],
  priviledge: ['privilege'],
  privelege: ['privilege'],
  remeber: ['remember'],
  foriegn: ['foreign'],
  peice: ['piece'],
  freind: ['friend'],
  freinds: ['friends'],
  guarentee: ['guarantee'],
  writting: ['writing'],
  begining: ['beginning'],
  succesful: ['successful'],
  arguement: ['argument'],
  judgement: ['judgment', 'judgement'],
  mispell: ['misspell'],
  mispelled: ['misspelled'],
  intrest: ['interest'],
  intresting: ['interesting'],
  knowlege: ['knowledge'],
  completly: ['completely'],
  basicly: ['basically'],
  noticable: ['noticeable'],
  existance: ['existence'],
  realy: ['really'],
  comming: ['coming'],
  droped: ['dropped'],
  planed: ['planned'],
  stoped: ['stopped'],
  runing: ['running'],
  swimmed: ['swam'],
  speach: ['speech'],
  suprise: ['surprise'],
  suprised: ['surprised'],
  acident: ['accident'],
  alright: ['all right'],
  dissapear: ['disappear'],
  dissapoint: ['disappoint'],
  dissappointed: ['disappointed'],
  grammer: ['grammar'],
  happend: ['happened'],
  interupt: ['interrupt'],
  liason: ['liaison'],
  millenium: ['millennium'],
  persue: ['pursue'],
  posession: ['possession'],
  recommand: ['recommend'],
  recomended: ['recommended'],
  refference: ['reference'],
  religous: ['religious'],
  resistence: ['resistance'],
  rythm: ['rhythm'],
  sieze: ['seize'],
  tendancy: ['tendency'],
  threshold: ['threshold'],
  unfortunatly: ['unfortunately'],
  vaccum: ['vacuum'],
  villian: ['villain'],
  weather: ['whether', 'weather'],
  whitch: ['which'],
};

// Additional vocabulary for literature, fantasy, worldbuilding, and historical fiction
const LITERARY_VOCABULARY = [
  'resonance', 'resonances', 'basin', 'oakhaven', 'tonal', 'vibration', 'vibrations', 'mineral', 'minerals',
  'derive', 'derives', 'deriving', 'elemental', 'pitch', 'generate', 'generates', 'radiant', 'copper',
  'dampen', 'dampens', 'dampening', 'kinetic', 'shockwave', 'shockwaves', 'courier', 'harden', 'hardens',
  'choir', 'chant', 'chants', 'slate', 'bramble', 'alchemy', 'alchemist', 'resonating', 'tuning', 'forks',
  'abyssal', 'inert', 'excited', 'melts', 'dampen', 'vault', 'vaults', 'crest', 'citadel', 'dynasty',
  'archivist', 'dossier', 'codex', 'epithet', 'factions', 'monarch', 'chronicle', 'chronicles', 'lore',
  'pantheon', 'relic', 'relics', 'artifact', 'artifacts', 'runic', 'runes', 'grimoire', 'tome', 'tomes',
  'mystic', 'ethereal', 'arcane', 'planar', 'celestial', 'astral', 'monolith', 'sanctuary', 'sovereign',
  'heir', 'empress', 'emperor', 'kingdoms', 'baron', 'duke', 'countess', 'savant', 'scholarship', 'manuscript',
  'paragraph', 'prose', 'stanza', 'verse', 'epilogue', 'prologue', 'anthology', 'glossary', 'compendium',
  'dune', 'oasis', 'gorge', 'fjord', 'plateau', 'archipelago', 'tundra', 'savanna', 'cavern', 'chasm',
  'citadel', 'fortress', 'bastion', 'keep', 'rampart', 'parapet', 'aqueduct', 'catacombs', 'labyrinth',
  'sunstone', 'gaslit', 'hilted', 'peepslot', 'catherine', 'elidor', 'apothecary', 'dirk', 'vial'
];

// Comprehensive English contractions
const COMMON_CONTRACTIONS = [
  // Negative contractions
  "aren't", "can't", "couldn't", "daren't", "didn't", "doesn't", "don't", "hadn't", "hasn't", 
  "haven't", "isn't", "mightn't", "mustn't", "needn't", "oughtn't", "shan't", 
  "shouldn't", "wasn't", "weren't", "won't", "wouldn't", "ain't",
  // 're
  "you're", "they're", "we're", "who're", "what're", "there're",
  // 've
  "i've", "you've", "we've", "they've", "could've", "should've", "would've", "might've", "must've", "who've",
  // 'll
  "i'll", "you'll", "he'll", "she'll", "it'll", "we'll", "they'll", "that'll", "this'll", "there'll", "who'll", "what'll",
  // 'd
  "i'd", "you'd", "he'd", "she'd", "it'd", "we'd", "they'd", "that'd", "there'd", "who'd", "what'd",
  // 's
  "he's", "she's", "it's", "that's", "what's", "there's", "here's", "where's", "when's", "why's", "how's", "who's", 
  "let's", "one's", "someone's", "anyone's", "everyone's", "nobody's", "something's", "anything's", "nothing's",
  // 'm
  "i'm",
  // Colloquial, vernacular & literary contractions
  "o'clock", "ma'am", "y'all", "c'mon", "ol'", "'tis", "'twas", "'cause", "'em", "li'l", "cap'n", "ne'er", "o'er", "e'er",
  // Common colloquial compounding words
  "aswell", "cannot", "gonna", "wanna", "gotta"
];

// Common abbreviations frequently used in literature, fiction, and narrative prose
const COMMON_ABBREVIATIONS = [
  'etc', 'eg', 'ie', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr',
  'approx', 'dept', 'corp', 'inc', 'ltd', 'co', 'min', 'sec', 'hr', 'hrs',
  'no', 'nos', 'vol', 'vols', 'chap', 'ch', 'ed', 'al', 'ibid', 'op', 'cit',
  'am', 'pm', 'bc', 'ad', 'bce', 'ce', 'id', 'iq', 'ok', 'okay', 'fyi', 'asap',
  'diy', 'faq', 'vip', 'dna', 'rna', 'cpu', 'gps', 'tv', 'pc', 'mph', 'kph',
  'km', 'cm', 'mm', 'kg', 'lb', 'lbs', 'oz', 'ft', 'yd', 'sq', 'pt', 'pts'
];

// Initialize comprehensive English dictionary (~275,000 words + literary + contractions + abbreviations)
const DICTIONARY_SET: Set<string> = new Set<string>();

// Populate dictionary set
(function initDictionary() {
  if (Array.isArray(englishWords)) {
    for (let i = 0; i < englishWords.length; i++) {
      DICTIONARY_SET.add(englishWords[i].toLowerCase());
    }
  }
  for (const w of LITERARY_VOCABULARY) {
    DICTIONARY_SET.add(w.toLowerCase());
  }
  for (const w of COMMON_CONTRACTIONS) {
    DICTIONARY_SET.add(w.toLowerCase());
    // Also add un-apostrophized version
    DICTIONARY_SET.add(w.replace(/'/g, '').toLowerCase());
  }
  for (const w of COMMON_ABBREVIATIONS) {
    DICTIONARY_SET.add(w.toLowerCase());
  }
})();

// Strip leading/trailing punctuation and normalize quotes/dashes
export function cleanWord(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[‘’\u2018\u2019]/g, "'")
    .replace(/[“”\u201C\u201D]/g, '"')
    .replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '')
    .trim();
}

// Check if a single word is spelled correctly
export function isWordValid(
  word: string,
  customWords: string[] = [],
  ignoredWords: string[] = []
): boolean {
  const cleaned = cleanWord(word);
  if (!cleaned) return true;

  // Numbers, ordinals or alphanumeric IDs (e.g. "Chapter 1", "3D", "100th", "4th", "21st") are valid
  if (/^\d+([a-zA-Z]+)?$/.test(cleaned) || /^\d+(st|nd|rd|th)$/i.test(cleaned)) return true;

  // Single characters (e.g. 'a', 'I') are valid
  if (cleaned.length <= 1) return true;

  // Roman numerals (I, II, III, IV, etc.) are valid
  if (/^(?=[MDCLXVI])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/i.test(cleaned)) {
    return true;
  }

  // Handle hyphenated compound words (e.g. "bone-hilted", "peep-slot", "gas-lit")
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-').filter(Boolean);
    if (parts.length > 1 && parts.every((p) => isWordValid(p, customWords, ignoredWords))) {
      return true;
    }
  }

  const lower = cleaned.toLowerCase();

  // Check custom user dictionary
  if (customWords.some((w) => w.toLowerCase() === lower)) return true;

  // Check temporary ignored words in this session
  if (ignoredWords.some((w) => w.toLowerCase() === lower)) return true;

  // Direct fast comprehensive dictionary lookup
  if (DICTIONARY_SET.has(lower)) return true;

  // Check possessives ending in 's or s' (e.g. grandfather's -> grandfather, Catherine's -> Catherine)
  if (lower.endsWith("'s")) {
    const base = lower.slice(0, -2);
    if (isWordValid(base, customWords, ignoredWords)) return true;
  }
  if (lower.endsWith("s'")) {
    const base = lower.slice(0, -1);
    if (isWordValid(base, customWords, ignoredWords)) return true;
  }

  // Common contractions and abbreviations
  if (lower.includes("'")) {
    // 1. Negative contractions ending in n't (e.g. shouldn't, wasn't, couldn't, wouldn't, didn't)
    if (lower.endsWith("n't")) {
      const base = lower.slice(0, -3);
      if (isWordValid(base, customWords, ignoredWords)) return true;
      if (['ca', 'wo', 'sha', 'ai', 'does'].includes(base)) return true; // can't, won't, shan't, ain't, doesn't
    }
    // 2. Contractions ending in 're (e.g. you're, they're, we're, who're)
    if (lower.endsWith("'re")) {
      const base = lower.slice(0, -3);
      if (isWordValid(base, customWords, ignoredWords)) return true;
    }
    // 3. Contractions ending in 've (e.g. i've, you've, could've, should've, would've)
    if (lower.endsWith("'ve")) {
      const base = lower.slice(0, -3);
      if (isWordValid(base, customWords, ignoredWords)) return true;
    }
    // 4. Contractions ending in 'll (e.g. i'll, you'll, that'll, we'll, they'll)
    if (lower.endsWith("'ll")) {
      const base = lower.slice(0, -3);
      if (isWordValid(base, customWords, ignoredWords)) return true;
    }
    // 5. Contractions ending in 'd (e.g. i'd, you'd, he'd, she'd, we'd, they'd)
    if (lower.endsWith("'d")) {
      const base = lower.slice(0, -2);
      if (isWordValid(base, customWords, ignoredWords)) return true;
    }
    // 6. Contractions ending in 'm (e.g. i'm)
    if (lower === "i'm") return true;

    // 7. General fallback stripping apostrophe (e.g. don't -> dont, o'clock -> oclock)
    const noApos = lower.replace(/'/g, '');
    if (DICTIONARY_SET.has(noApos)) return true;
  }

  // Check common English word derivations, inflections & suffixes
  if (lower.endsWith('s') && DICTIONARY_SET.has(lower.slice(0, -1))) return true;
  if (lower.endsWith('es') && DICTIONARY_SET.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('es') && DICTIONARY_SET.has(lower.slice(0, -1))) return true;
  if (lower.endsWith('ies') && DICTIONARY_SET.has(lower.slice(0, -3) + 'y')) return true;
  if (lower.endsWith('ied') && DICTIONARY_SET.has(lower.slice(0, -3) + 'y')) return true;
  if (lower.endsWith('ed') && DICTIONARY_SET.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('ed') && DICTIONARY_SET.has(lower.slice(0, -1))) return true; // e.g. pulverized -> pulverize
  if (lower.endsWith('ing') && DICTIONARY_SET.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('ing') && DICTIONARY_SET.has(lower.slice(0, -3) + 'e')) return true; // e.g. blurring -> blur / writing -> write
  if (lower.endsWith('ingly') && (DICTIONARY_SET.has(lower.slice(0, -5)) || DICTIONARY_SET.has(lower.slice(0, -5) + 'e'))) return true;
  if (lower.endsWith('ly') && DICTIONARY_SET.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('ly') && DICTIONARY_SET.has(lower.slice(0, -1))) return true;
  if (lower.endsWith('er') && DICTIONARY_SET.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('er') && DICTIONARY_SET.has(lower.slice(0, -1))) return true;
  if (lower.endsWith('est') && DICTIONARY_SET.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('est') && DICTIONARY_SET.has(lower.slice(0, -2))) return true;
  if (lower.endsWith('tion') && DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('tions') && DICTIONARY_SET.has(lower.slice(0, -5))) return true;
  if (lower.endsWith('sion') && DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('sions') && DICTIONARY_SET.has(lower.slice(0, -5))) return true;
  if (lower.endsWith('ment') && DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('ments') && DICTIONARY_SET.has(lower.slice(0, -5))) return true;
  if (lower.endsWith('ness') && DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('able') && (DICTIONARY_SET.has(lower.slice(0, -4)) || DICTIONARY_SET.has(lower.slice(0, -4) + 'e'))) return true;
  if (lower.endsWith('ably') && DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('ful') && DICTIONARY_SET.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('fully') && DICTIONARY_SET.has(lower.slice(0, -5))) return true;
  if (lower.endsWith('less') && DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('lessly') && DICTIONARY_SET.has(lower.slice(0, -6))) return true;
  if (lower.endsWith('ance') && DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('ances') && DICTIONARY_SET.has(lower.slice(0, -5))) return true;
  if (lower.endsWith('ence') && DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  if (lower.endsWith('ences') && DICTIONARY_SET.has(lower.slice(0, -5))) return true;
  if (lower.endsWith('ive') && DICTIONARY_SET.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('ively') && DICTIONARY_SET.has(lower.slice(0, -5))) return true;
  if (lower.endsWith('ize') && DICTIONARY_SET.has(lower.slice(0, -3))) return true;
  if (lower.endsWith('ized') && (DICTIONARY_SET.has(lower.slice(0, -4)) || DICTIONARY_SET.has(lower.slice(0, -4) + 'e') || DICTIONARY_SET.has(lower.slice(0, -1)))) return true;
  if (lower.endsWith('izing') && (DICTIONARY_SET.has(lower.slice(0, -5)) || DICTIONARY_SET.has(lower.slice(0, -5) + 'e') || DICTIONARY_SET.has(lower.slice(0, -3) + 'e'))) return true;

  // Doubled consonant endings e.g. blurring -> blur, stopped -> stop, planned -> plan, running -> run
  if (lower.endsWith('ed') && lower.length > 4 && lower[lower.length - 3] === lower[lower.length - 4]) {
    if (DICTIONARY_SET.has(lower.slice(0, -3))) return true;
  }
  if (lower.endsWith('ing') && lower.length > 5 && lower[lower.length - 4] === lower[lower.length - 5]) {
    if (DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  }
  if (lower.endsWith('er') && lower.length > 4 && lower[lower.length - 3] === lower[lower.length - 4]) {
    if (DICTIONARY_SET.has(lower.slice(0, -3))) return true;
  }
  if (lower.endsWith('est') && lower.length > 5 && lower[lower.length - 4] === lower[lower.length - 5]) {
    if (DICTIONARY_SET.has(lower.slice(0, -4))) return true;
  }

  // Common prefixes (un-, re-, dis-, non-, pre-, mis-, over-, under-, anti-, semi-)
  const prefixes = ['un', 're', 'dis', 'non', 'pre', 'mis', 'over', 'under', 'anti', 'semi', 'inter', 'super', 'co', 'post'];
  for (const pre of prefixes) {
    if (lower.startsWith(pre) && lower.length > pre.length + 3) {
      const rest = lower.slice(pre.length);
      if (DICTIONARY_SET.has(rest)) return true;
    }
  }

  return false;
}

// Levenshtein distance calculation
function getLevenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Generate smart spelling suggestions for a misspelled word
export function getSuggestions(word: string, customWords: string[] = []): string[] {
  const cleaned = cleanWord(word);
  const lower = cleaned.toLowerCase();

  // 1. Direct typo lookup (instant high precision match)
  if (COMMON_TYPOS[lower]) {
    const typoFixes = COMMON_TYPOS[lower];
    // Preserve initial capitalization for the early return as well
    const isCapitalized = cleaned.length > 0 && cleaned[0] === cleaned[0].toUpperCase() && cleaned[0] !== cleaned[0].toLowerCase();
    if (isCapitalized) {
      return typoFixes.map((r) => r.charAt(0).toUpperCase() + r.slice(1));
    }
    return [...typoFixes];
  }

  const results: string[] = [];

  // 2. Check custom words
  for (const cw of customWords) {
    if (getLevenshteinDistance(lower, cw.toLowerCase()) <= 2) {
      results.push(cw);
    }
  }

  // 3. Search dictionary with distance <= 2, focusing on words with similar lengths and starting letters
  const firstLetter = lower[0];
  for (const vocab of DICTIONARY_SET) {
    if (Math.abs(vocab.length - lower.length) > 2) continue;
    // Prefer words starting with the same first letter for performance and relevance
    if (vocab[0] !== firstLetter && Math.abs(vocab.length - lower.length) > 1) continue;

    if (getLevenshteinDistance(lower, vocab) <= 1) {
      results.push(vocab);
      if (results.length >= 4) break;
    }
  }

  if (results.length < 3) {
    for (const vocab of DICTIONARY_SET) {
      if (Math.abs(vocab.length - lower.length) > 2) continue;
      if (vocab[0] !== firstLetter) continue;
      if (getLevenshteinDistance(lower, vocab) === 2 && !results.includes(vocab)) {
        results.push(vocab);
        if (results.length >= 4) break;
      }
    }
  }

  // Preserve initial capitalization if the input word was capitalized
  const isCapitalized = cleaned.length > 0 && cleaned[0] === cleaned[0].toUpperCase() && cleaned[0] !== cleaned[0].toLowerCase();
  if (isCapitalized) {
    return results.map((r) => r.charAt(0).toUpperCase() + r.slice(1));
  }

  return results;
}

// Cache for computed suggestions to avoid heavy recomputation during typing
const suggestionCache = new Map<string, string[]>();

// Scan plain text and collect all misspelled words with contexts and optional lazy suggestions
export function scanForMisspellings(
  rawPlainText: string,
  customWords: string[] = [],
  ignoredWords: string[] = [],
  generateSuggestions = false
): MisspelledWordInfo[] {
  if (!rawPlainText || !rawPlainText.trim()) return [];

  // If HTML somehow reached this scanner, strip tags while enforcing whitespace boundaries between blocks
  const plainText = (rawPlainText.includes('<') && rawPlainText.includes('>'))
    ? rawPlainText
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article|header|footer)>/gi, '\n\n')
        .replace(/<(p|div|h[1-6]|li|blockquote|tr|section|article|header|footer)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\u00a0/g, ' ')
    : rawPlainText.replace(/\u00a0/g, ' ');

  // Match words, including contractions (straight and curly apostrophes) and hyphenated tokens
  const wordRegex = /[a-zA-Z][a-zA-Z0-9'’\u2019-]*/g;
  const wordMap = new Map<string, { count: number; contexts: string[] }>();

  // Extract sentences/lines for snippet context
  const lines = plainText.split(/\n+/);

  for (const line of lines) {
    if (!line.trim()) continue;
    wordRegex.lastIndex = 0; // Guard against regex state drift across lines
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(line)) !== null) {
      const rawWord = match[0];
      const cleaned = cleanWord(rawWord);
      if (cleaned && !isWordValid(cleaned, customWords, ignoredWords)) {
        const key = cleaned.toLowerCase();
        
        // Extract surrounding context snippet (up to 30 chars before and after)
        const start = Math.max(0, match.index - 30);
        const end = Math.min(line.length, match.index + rawWord.length + 30);
        const snippet = (start > 0 ? '...' : '') + line.slice(start, end).trim() + (end < line.length ? '...' : '');

        const existing = wordMap.get(key) || { count: 0, contexts: [] };
        existing.count += 1;
        if (existing.contexts.length < 3 && !existing.contexts.includes(snippet)) {
          existing.contexts.push(snippet);
        }
        wordMap.set(key, existing);
      }
    }
  }

  const result: MisspelledWordInfo[] = [];
  wordMap.forEach((info, lowerKey) => {
    let suggestions: string[] = [];
    if (generateSuggestions) {
      if (suggestionCache.has(lowerKey)) {
        suggestions = suggestionCache.get(lowerKey)!;
      } else {
        suggestions = getSuggestions(lowerKey, customWords);
        suggestionCache.set(lowerKey, suggestions);
      }
    }
    result.push({
      word: lowerKey,
      count: info.count,
      suggestions,
      contexts: info.contexts
    });
  });

  return result.sort((a, b) => b.count - a.count);
}

// Custom dictionary local storage helpers
export function getCustomDictionary(): string[] {
  try {
    const raw = localStorage.getItem('mundus_custom_dictionary');
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load custom dictionary:', e);
  }
  return [];
}

export function saveCustomDictionary(words: string[]): void {
  try {
    localStorage.setItem('mundus_custom_dictionary', JSON.stringify(words));
  } catch (e) {
    console.error('Failed to save custom dictionary:', e);
  }
}

export function addWordToCustomDictionary(word: string): string[] {
  if (!word || !word.trim()) return getCustomDictionary();
  const current = getCustomDictionary();
  const parts = word.split(/\s+/).map((w) => cleanWord(w)).filter((w) => w.length > 1);
  let updated = [...current];
  let changed = false;
  for (const p of parts) {
    if (!updated.some((w) => w.toLowerCase() === p.toLowerCase())) {
      updated.push(p);
      changed = true;
    }
  }
  if (changed) {
    saveCustomDictionary(updated);
  }
  return updated;
}

export function removeWordFromCustomDictionary(word: string): string[] {
  const current = getCustomDictionary();
  const lower = word.toLowerCase();
  const updated = current.filter((w) => w.toLowerCase() !== lower);
  saveCustomDictionary(updated);
  return updated;
}

export function getSpellCheckEnabled(): boolean {
  try {
    const saved = localStorage.getItem('mundus_spellcheck_enabled');
    if (saved !== null) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load spellcheck toggle:', e);
  }
  return true;
}

export function saveSpellCheckEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('mundus_spellcheck_enabled', JSON.stringify(enabled));
  } catch (e) {
    console.error('Failed to save spellcheck toggle:', e);
  }
}

// ---------------------------------------------------------------------------
// Inline autocorrect helpers (v0.7.8) — word-at-caret extraction & popup gating.
// Pure functions so they are unit-testable without a DOM.
// ---------------------------------------------------------------------------

const INLINE_WORD_CHAR = /[A-Za-z0-9'’\u2019-]/;

export interface CaretWord {
  raw: string;    // the raw slice from the text node
  cleaned: string; // punctuation-stripped word (cleanWord)
  start: number;  // start offset of the word inside the text node
  end: number;    // end offset (exclusive) of the word inside the text node
}

/**
 * extractWordAtCaret — returns the word that just finished being typed at
 * `caret` inside `text`, or null. The word is considered finished when no word
 * characters continue after the caret, and the run ends exactly at the caret
 * (plain typing) or exactly one character before it (the user just typed a
 * space / punctuation). If the caret sits inside a still-growing word, null is
 * returned so the popup never nags mid-word.
 */
export function extractWordAtCaret(text: string, caret: number): CaretWord | null {
  if (!text || caret < 0 || caret > text.length) return null;

  // If word characters continue after the caret, the word isn't finished yet.
  let fwd = caret;
  while (fwd < text.length && INLINE_WORD_CHAR.test(text[fwd])) fwd++;
  if (fwd > caret) return null;

  // Word ends at the caret, or one char before it when the caret just typed a
  // non-word character (space, comma, quote…).
  let end = caret;
  if (end > 0 && !INLINE_WORD_CHAR.test(text[end - 1])) {
    if (end >= 2 && INLINE_WORD_CHAR.test(text[end - 2])) end -= 1;
    else return null;
  }

  let start = end;
  while (start > 0 && INLINE_WORD_CHAR.test(text[start - 1])) start--;
  const raw = text.slice(start, end);
  if (!raw) return null;
  const cleaned = cleanWord(raw);
  if (!cleaned) return null;
  return { raw, cleaned, start, end };
}

// Characters after which a Capitalized word is treated as a sentence start
// rather than a proper noun. Includes quotes/brackets/dashes/newlines so that
// “The , —The , (The all behave like sentence openings.
const SENTENCE_START_CHARS = new Set(['.', '!', '?', '—', '–', ':', ';', '"', '“', '”', '‘', '’', "'", '(', '[', '•', '*', '>', '\n']);

/**
 * isLikelySentenceStart — scans backwards over whitespace from `offset` and
 * decides whether a word starting there plausibly opens a sentence. Start of
 * the text counts as a sentence start.
 */
export function isLikelySentenceStart(text: string, offset: number): boolean {
  let i = offset - 1;
  // Only skip horizontal whitespace — a newline is a paragraph boundary and
  // must stop the scan (it is itself a sentence-start character below).
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  if (i < 0) return true;
  return SENTENCE_START_CHARS.has(text[i]);
}

/**
 * shouldSuggestCaretWord — gating rules for the inline autocorrect popup:
 * at least 3 letters, no digits, not ALL-CAPS (acronyms), and capitalized
 * words only when they plausibly start a sentence — a capital mid-sentence is
 * treated as a proper noun (invented names), which the red underline already
 * communicates without nagging a correction. Proper nouns learned from the
 * project (characters, aliases, families, factions, Codex titles) bypass this
 * entirely because they are valid in `isWordValid` via effectiveCustomWords.
 */
export function shouldSuggestCaretWord(cleaned: string, text: string, start: number): boolean {
  if (!cleaned || cleaned.length < 3) return false;
  if (/\d/.test(cleaned)) return false;
  if (cleaned.length >= 3 && cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned)) return false;
  if (/^[A-Z]/.test(cleaned) && !isLikelySentenceStart(text, start)) return false;
  return true;
}
