// v0.7.91-NIGHTLY — unit tests for the new Harper grammar engine mapping
// helpers and the Whistle STT text helpers (pure logic, no WASM needed).
// Run: npx tsx scripts/test_nightly_features.ts
import {
  pickCaretLint,
  lintToSuggestion,
  adjustedRemoveSpan,
  type GrammarLint,
} from '../src/lib/grammarEngine';
import {
  resampleLinear,
  assembleSttText,
  appendSttCommitted,
  joinText,
  sanitizeAudioSamples,
  finalizeDictationText,
  describeSttError,
} from '../src/lib/sttEngine';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

function lint(start: number, end: number, problem: string, kind: string, replacements: Array<string | null>): GrammarLint {
  return {
    start,
    end,
    problemText: problem,
    lintKind: kind,
    message: `${kind}: ${problem}`,
    suggestions: replacements.map((r) =>
      r === null ? { replacement: '', remove: true } : { replacement: r, remove: false }
    ),
  };
}

console.log('\n== pickCaretLint ==');
{
  const lints = [
    lint(0, 15, 'They was', 'Grammar', ['They were']),
    lint(6, 12, 'was walkng'.slice(0, 6), 'Spelling', ['walking']), // "was wa" — synthetic overlap
    lint(20, 33, 'long sentence', 'Readability', []), // no suggestions → ignored
  ];
  const hit = pickCaretLint(lints, 10, 12);
  check('overlapping lint picked', hit !== null && hit.lintKind === 'Spelling', hit);
  const exact = pickCaretLint([lint(4, 8, 'teh', 'Spelling', ['the']), lint(0, 20, 'whole sentence', 'Grammar', ['ok'])], 4, 8);
  check('exact-cover lint preferred', exact !== null && exact.problemText === 'teh', exact);
  const smallest = pickCaretLint([lint(0, 20, 'sentence', 'Grammar', ['ok']), lint(6, 10, 'word', 'Spelling', ['word2'])], 7, 9);
  check('smallest overlapping span wins when no exact cover', smallest !== null && smallest.problemText === 'word', smallest);
  check('no overlap → null', pickCaretLint([lint(0, 4, 'teh', 'Spelling', ['the'])], 10, 12) === null);
  check('lint without suggestions skipped', pickCaretLint([lint(5, 9, 'x', 'Readability', [])], 6, 8) === null);
  check('empty list → null', pickCaretLint([], 0, 1) === null);
}

console.log('\n== lintToSuggestion ==');
{
  const normal = lintToSuggestion(lint(0, 3, 'teh', 'Spelling', ['the', 'ten']));
  check('replacement mapped', normal !== null && normal.replacement === 'the', normal);
  check('alternatives carried', normal !== null && normal.alternatives.length === 1 && normal.alternatives[0] === 'ten', normal);
  check('kind carried', normal !== null && normal.lintKind === 'Spelling');
  const removal = lintToSuggestion(lint(4, 9, 'a a', 'Miscellaneous', [null, 'the']));
  check('remove-kind → empty replacement', removal !== null && removal.replacement === '', removal);
  check('non-first suggestions kept as alternatives', removal !== null && removal.alternatives[0] === 'the', removal);
  check('no suggestions → null', lintToSuggestion(lint(0, 2, 'x', 'Readability', [])) === null);

  // v0.8.0: the popup cycles through up to THREE corrections with ←/→.
  const three = lintToSuggestion(lint(0, 3, 'teh', 'Spelling', ['the', 'ten', 'then', 'tech']));
  check('choices caps at 3', three !== null && three.choices.length === 3, three);
  check('choices keep Harper precedence', three !== null && three.choices[0] === 'the' && three.choices[1] === 'ten' && three.choices[2] === 'then', three);
  check('choices[0] mirrors replacement', three !== null && three.replacement === three.choices[0], three);
  const removalChoices = lintToSuggestion(lint(4, 9, 'a a', 'Miscellaneous', [null, 'the']));
  check('remove-kind mapped into choices as empty string', removalChoices !== null && removalChoices.choices[0] === '' && removalChoices.choices[1] === 'the', removalChoices);
  const duped = lintToSuggestion(lint(0, 3, 'teh', 'Spelling', ['the', 'the', 'ten']));
  check('duplicate candidates deduped', duped !== null && duped.choices.length === 2, duped);
  const emptyOnly = lintToSuggestion(lint(0, 3, 'teh', 'Spelling', ['', '']));
  check('all-empty non-remove candidates → null', emptyOnly === null, emptyOnly);
}

console.log('\n== adjustedRemoveSpan ==');
{
  check('collapses left space when both sides spaced', JSON.stringify(adjustedRemoveSpan('the the cat', 4, 7)) === '[3,7]');
  check('no change when only left spaced', JSON.stringify(adjustedRemoveSpan('a a', 2, 3)) === '[2,3]');
  check('no change at string end', JSON.stringify(adjustedRemoveSpan('a a', 0, 1)) === '[0,1]');
}

console.log('\n== STT text helpers ==');
{
  const src = new Float32Array(48000).fill(0.5);
  const same = resampleLinear(src, 16000, 16000);
  check('same rate → identity (same object)', same === src);
  const down = resampleLinear(src, 48000, 16000);
  check('48k→16k length /3', down.length === 16000, down.length);
  const up = resampleLinear(new Float32Array(8000).fill(0.25), 8000, 16000);
  check('8k→16k length ×2', up.length === 16000, up.length);
  check('empty input safe', resampleLinear(new Float32Array(0), 48000, 16000).length === 0);

  check('assemble = committed + pending', assembleSttText('hello ', 'wor') === 'hello wor');
  check('pending replaces previous tail', assembleSttText('hello ', 'world') === 'hello world');
  check('committed growth rides on top of pending swap', assembleSttText('hello there ', 'gen') === 'hello there gen');
  check('assemble inserts seam space between word groups', assembleSttText('into the old', 'tavern, closed') === 'into the old tavern, closed');
  check('assemble keeps space before sentence start', assembleSttText('him, and', 'said, "The') === 'him, and said, "The');

  // v0.7.92-nightly: committed-delta seam repair (the "oldtavern" glue bug).
  check('append inserts missing seam space', appendSttCommitted('Palla walked into the old', 'tavern, closed the door') === 'Palla walked into the old tavern, closed the door');
  check('append does not double-space', appendSttCommitted('ends with space ', 'next') === 'ends with space next');
  check('append across sentence boundary keeps one space', appendSttCommitted('coming."', 'We must leave') === 'coming." We must leave');
  check('append before punctuation attaches directly', appendSttCommitted('storm', ',') === 'storm,');
  check('append empty delta is a no-op', appendSttCommitted('kept', '') === 'kept');
  check('append onto empty committed', appendSttCommitted('', 'First words') === 'First words');
  check('joinText dash joiner attaches', joinText('well—', 'known') === 'well—known');
  check('joinText quote open attaches', joinText('said, ', '"The') === 'said, "The');

  // v0.7.92-nightly: sample sanitization (Whistle rejects |x|>1 / NaN).
  const dirty = new Float32Array([0.5, 1.25, -1.5, NaN, Infinity, -Infinity, 0, -0.75]);
  sanitizeAudioSamples(dirty);
  check('sanitize clamps and repairs', Array.from(dirty).every((s) => Number.isFinite(s) && s >= -1 && s <= 1), Array.from(dirty));
  check('sanitize NaN maps to 0', dirty[3] === 0);
  check('sanitize keeps clean values', dirty[0] === 0.5 && dirty[6] === 0 && dirty[7] === -0.75);

  check('trailing space added before following word', finalizeDictationText('hello world', 'x') === 'hello world ');
  check('trailing whitespace trimmed at end of node', finalizeDictationText('hello world  ', undefined) === 'hello world');
  check('no space added when text ends with hyphen', finalizeDictationText('well-', 'x') === 'well-');
  check('no space before punctuation follower', finalizeDictationText('done', ',') === 'done');
  check('empty dictation stays empty', finalizeDictationText('', undefined) === '');
}

console.log('\n== describeSttError ==');
{
  check('permission denial mapped', describeSttError(new Error('Permission denied by user')) === 'Microphone permission denied');
  check('not-allowed mapped', describeSttError(new DOMException('The request is not allowed', 'NotAllowedError')) === 'Microphone permission denied');
  check('long messages truncated', describeSttError(new Error('x'.repeat(200))).length <= 80);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
