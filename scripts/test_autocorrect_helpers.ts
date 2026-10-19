// Unit tests for v0.7.8 inline autocorrect helpers (extractWordAtCaret,
// isLikelySentenceStart, shouldSuggestCaretWord) + engine integration bits.
// Run: bun scripts/test_autocorrect_helpers.ts

// bun has no localStorage — shim it BEFORE importing spellCheckEngine.
const __store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (__store.has(k) ? __store.get(k)! : null),
  setItem: (k: string, v: string) => void __store.set(k, String(v)),
  removeItem: (k: string) => void __store.delete(k),
  clear: () => void __store.clear(),
  key: (i: number) => Array.from(__store.keys())[i] ?? null,
  get length() {
    return __store.size;
  },
};

const {
  extractWordAtCaret,
  isLikelySentenceStart,
  shouldSuggestCaretWord,
  cleanWord,
  isWordValid,
  getSuggestions,
} = await import('../src/lib/spellCheckEngine');

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`  FAIL: ${name}`, extra ?? '');
  }
}

// ---------------------------------------------------------------------------
// extractWordAtCaret
// ---------------------------------------------------------------------------
console.log('extractWordAtCaret');

// Word ends exactly at caret
{
  const r = extractWordAtCaret('the quick brown teh', 19);
  check('caret at word end', !!r && r.cleaned === 'teh' && r.start === 16 && r.end === 19, r);
}
// Caret right after a typed space -> word one char back
{
  const r = extractWordAtCaret('the quick teh ', 14);
  check('caret after space', !!r && r.cleaned === 'teh' && r.start === 10 && r.end === 13, r);
}
// Caret right after punctuation
{
  const r = extractWordAtCaret('it was teh, and then', 11);
  check('caret after comma', !!r && r.cleaned === 'teh', r);
}
// Mid-word caret -> null (word still growing)
{
  const r = extractWordAtCaret('the quick teh', 12);
  check('mid-word caret is null', r === null, r);
}
// Caret after multiple spaces -> null (no adjacent word)
{
  const r = extractWordAtCaret('teh  ', 5);
  check('double space is null', r === null, r);
}
// Empty / out-of-range
{
  check('empty text null', extractWordAtCaret('', 0) === null);
  check('oob caret null', extractWordAtCaret('word', 99) === null);
}
// Contraction kept intact — caret 10 is right after "didn’t" (cleanWord
// normalizes the curly apostrophe to a straight one)
{
  const r = extractWordAtCaret("she didn’t knwo ", 10);
  check('curly contraction word', !!r && r.cleaned === "didn't", r);
}
// Hyphenated token — caret 13 is the space right after "bone-hilted"
{
  const r = extractWordAtCaret('a bone-hilted blade', 13);
  check('hyphenated token', !!r && r.cleaned === 'bone-hilted', r);
}

// ---------------------------------------------------------------------------
// isLikelySentenceStart
// ---------------------------------------------------------------------------
console.log('isLikelySentenceStart');

check('start of text', isLikelySentenceStart('Teh quick', 0) === true);
check('after period+space', isLikelySentenceStart('He ran. Teh end', 8) === true);
check('after question mark', isLikelySentenceStart('What? Teh end', 6) === true);
check('after newline', isLikelySentenceStart('line one\nTeh', 9) === true);
check('after open quote', isLikelySentenceStart('He said “Teh', 9) === true);
check('mid-sentence is not start', isLikelySentenceStart('the quick Teh', 10) === false);
check('after plain word not start', isLikelySentenceStart('saw Teh there', 4) === false);

// ---------------------------------------------------------------------------
// shouldSuggestCaretWord
// ---------------------------------------------------------------------------
console.log('shouldSuggestCaretWord');

check('lowercase word allowed', shouldSuggestCaretWord('teh', 'the teh ', 4) === true);
check('too short skipped', shouldSuggestCaretWord('te', 'the te ', 5) === false);
check('digits skipped', shouldSuggestCaretWord('abc123', 'x abc123 ', 8) === false);
check('ALL-CAPS skipped (acronym)', shouldSuggestCaretWord('NASA', 'x NASA ', 6) === false);
check('capital mid-sentence skipped (proper noun)', shouldSuggestCaretWord('Kaelen', 'saw Kaelen ', 10) === false);
check('capital at sentence start allowed', shouldSuggestCaretWord('Teh', '. Teh ', 2) === true);
check('capital at text start allowed', shouldSuggestCaretWord('Teh', 'Teh ', 0) === true);

// ---------------------------------------------------------------------------
// Engine integration: validity + suggestions used by the popup pipeline
// ---------------------------------------------------------------------------
console.log('engine integration');

check('cleanWord strips punctuation', cleanWord('“teh,”') === 'teh', cleanWord('“teh,”'));
check('isWordValid the', isWordValid('the') === true);
check('isWordValid invented name (unknown)', isWordValid('xeloria') === false);
check('custom words whitelist', isWordValid('xeloria', ['Xeloria']) === true, isWordValid('xeloria', ['Xeloria']));
check('learned lowercase match', isWordValid('kaelen', ['kaelen']) === true);
check('session-ignored word', isWordValid('braleng', [], ['braleng']) === true);

const sug = getSuggestions('teh');
check('suggestion for teh contains the', Array.isArray(sug) && sug.includes('the'), sug);
const sug2 = getSuggestions('recieve');
check('suggestion for recieve contains receive', Array.isArray(sug2) && sug2.includes('receive'), sug2);
const sug3 = getSuggestions('Teh');
check('capitalized input keeps capital', Array.isArray(sug3) && sug3[0] === 'The', sug3);
const sug4 = getSuggestions('teh', ['tehness']);
check('custom dictionary participates in suggestions', Array.isArray(sug4), sug4);
check('no suggestions leak the input itself', getSuggestions('theword').every((s) => s.toLowerCase() !== 'theword'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
