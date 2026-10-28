// Unit tests for src/lib/targetProgress.ts — v0.7.84 target-menu reading time +
// v0.7.85 dynamic bar colors (with goal-achieved glow), full monochrome when OFF,
// and cross-device LWW sync of the toggle.
// Run: npx tsx scripts/test_target_progress.ts
import {
  estimateTargetReadingMinutes,
  formatReadingTime,
  getTargetBarFillClass,
  getDynamicTargetBarColorEnabled,
  setDynamicTargetBarColorEnabled,
  collectLocalTargetBarPrefs,
  stampLocalTargetBarPrefs,
  applyTargetBarPrefsToLocalStorage,
  mergeTargetBarPrefs,
  TARGET_BAR_GOAL_GLOW,
  TARGET_BAR_GOAL_PILL_GLOW,
  READING_WORDS_PER_MINUTE,
  READING_CHARS_PER_MINUTE,
} from '../src/lib/targetProgress';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  ok ', name); }
  else { fail++; console.log('  FAIL', name); }
}

// node has no localStorage — provide a minimal stub like the browser surface
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
};

console.log('[1] Reading-time estimation — words (200 wpm convention, matches existing "~X min read")');
check('2000 words = 10 min', estimateTargetReadingMinutes(2000, 'words') === 10);
check('500 words = 2.5 min', estimateTargetReadingMinutes(500, 'words') === 2.5);
check('1 word = 0.005 min', estimateTargetReadingMinutes(1, 'words') === 1 / READING_WORDS_PER_MINUTE);

console.log('[2] Reading-time estimation — characters (1000 cpm, same clock as words/200)');
check('5000 chars = 5 min', estimateTargetReadingMinutes(5000, 'characters') === 5);
check('30000 chars = 30 min', estimateTargetReadingMinutes(30000, 'characters') === 30);
check('cpm parity: 1000 chars == 200 words', READING_CHARS_PER_MINUTE / 1000 === READING_WORDS_PER_MINUTE / 200);

console.log('[3] Invalid input -> 0 (menu line hidden)');
check('0 -> 0', estimateTargetReadingMinutes(0, 'words') === 0);
check('negative -> 0', estimateTargetReadingMinutes(-500, 'characters') === 0);
check('NaN -> 0', estimateTargetReadingMinutes(NaN, 'words') === 0);
check('Infinity -> 0', estimateTargetReadingMinutes(Infinity, 'words') === 0);

console.log('[4] Formatting');
check('0.4 min -> "under 1 min"', formatReadingTime(0.4) === 'under 1 min');
check('10 min -> "10 min"', formatReadingTime(10) === '10 min');
check('2.4 min rounds to "2 min"', formatReadingTime(2.4) === '2 min');
check('2.6 min rounds to "3 min"', formatReadingTime(2.6) === '3 min');
check('0.5 min -> "under 1 min"', formatReadingTime(0.5) === 'under 1 min');
check('60 min -> "1 hr"', formatReadingTime(60) === '1 hr');
check('90 min -> "1 hr 30 min"', formatReadingTime(90) === '1 hr 30 min');
check('123 min -> "2 hr 3 min"', formatReadingTime(123) === '2 hr 3 min');
check('0 -> "" (hidden)', formatReadingTime(0) === '');
check('NaN -> "" (hidden)', formatReadingTime(NaN) === '');

console.log('[5] Bar colors (blank 0 / red <20 / orange <50 / yellow <80 / green 80-99 / goal glow at 100)');
check('0% -> blank/neutral', getTargetBarFillClass(0) === 'bg-neutral-300 dark:bg-neutral-700');
check('1% -> red', getTargetBarFillClass(1) === 'bg-red-500');
check('19% -> red', getTargetBarFillClass(19) === 'bg-red-500');
check('20% -> orange', getTargetBarFillClass(20) === 'bg-orange-500');
check('49% -> orange', getTargetBarFillClass(49) === 'bg-orange-500');
check('50% -> yellow', getTargetBarFillClass(50) === 'bg-yellow-400');
check('79% -> yellow', getTargetBarFillClass(79) === 'bg-yellow-400');
check('80% -> green (near goal, NOT goal glow)', getTargetBarFillClass(80) === 'bg-green-500');
check('99% -> green (near goal, NOT goal glow)', getTargetBarFillClass(99) === 'bg-green-500');
check('100% -> emerald + goal glow', getTargetBarFillClass(100) === `bg-emerald-500 ${TARGET_BAR_GOAL_GLOW}`);
check('over 100 clamps -> goal glow', getTargetBarFillClass(150) === `bg-emerald-500 ${TARGET_BAR_GOAL_GLOW}`);
check('negative clamps -> blank', getTargetBarFillClass(-5) === 'bg-neutral-300 dark:bg-neutral-700');
check('NaN clamps -> blank', getTargetBarFillClass(NaN) === 'bg-neutral-300 dark:bg-neutral-700');

console.log('[5b] Bottom-bar pill glow (v0.7.86) — applied to the pill, distinct from the fill glow');
check('pill glow is a shadow class', TARGET_BAR_GOAL_PILL_GLOW.startsWith('shadow-['));
check('pill glow is emerald-toned', TARGET_BAR_GOAL_PILL_GLOW.includes('16,185,129'));
check('pill glow differs from fill glow', (TARGET_BAR_GOAL_PILL_GLOW as string) !== TARGET_BAR_GOAL_GLOW);
check('pill glow reachable from fill class at 100%', getTargetBarFillClass(100).includes(TARGET_BAR_GOAL_GLOW));

console.log('[6] Local persistence (default ON)');
check('default enabled (no saved value)', getDynamicTargetBarColorEnabled() === true);
setDynamicTargetBarColorEnabled(false);
check('persisted off', getDynamicTargetBarColorEnabled() === false);
setDynamicTargetBarColorEnabled(true);
check('persisted on', getDynamicTargetBarColorEnabled() === true);

console.log('[7] Target-bar prefs sync: collect / stamp / apply round-trip');
const collected = collectLocalTargetBarPrefs();
check('collect reflects stored value + unstamped', collected.dynamicTargetBarColor === true && collected.updatedAt === '');
applyTargetBarPrefsToLocalStorage({ dynamicTargetBarColor: false, updatedAt: '2026-01-01T00:00:00.000Z' });
const roundTrip = collectLocalTargetBarPrefs();
check('apply -> collect round-trip (value AND stamp)', roundTrip.dynamicTargetBarColor === false && roundTrip.updatedAt === '2026-01-01T00:00:00.000Z');
const stamped = stampLocalTargetBarPrefs();
check('stamp writes fresh ISO time', collectLocalTargetBarPrefs().updatedAt === stamped && !Number.isNaN(Date.parse(stamped)));

console.log('[8] mergeTargetBarPrefs — last-write-wins semantics');
let m = mergeTargetBarPrefs(
  { dynamicTargetBarColor: true, updatedAt: '' },
  null
);
check('cloud missing -> push-local', m.action === 'push-local');
check('push-local stamps when never edited', m.prefs.updatedAt !== '');

m = mergeTargetBarPrefs({ dynamicTargetBarColor: true, updatedAt: '' }, {});
check('cloud empty object -> push-local', m.action === 'push-local');

m = mergeTargetBarPrefs(
  { dynamicTargetBarColor: true, updatedAt: '' },
  { dynamicTargetBarColor: false, updatedAt: '2026-01-01T00:00:00.000Z' }
);
check('local unstamped + cloud present -> apply-cloud', m.action === 'apply-cloud');
check('FALSE is a valid cloud value (not "missing")', m.prefs.dynamicTargetBarColor === false);

m = mergeTargetBarPrefs(
  { dynamicTargetBarColor: true, updatedAt: '2026-01-01T10:00:00.000Z' },
  { dynamicTargetBarColor: false, updatedAt: '2026-01-02T10:00:00.000Z' }
);
check('cloud newer -> apply-cloud', m.action === 'apply-cloud' && m.prefs.dynamicTargetBarColor === false);

m = mergeTargetBarPrefs(
  { dynamicTargetBarColor: false, updatedAt: '2026-03-01T10:00:00.000Z' },
  { dynamicTargetBarColor: true, updatedAt: '2026-02-01T10:00:00.000Z' }
);
check('local newer -> push-local (local kept)', m.action === 'push-local' && m.prefs.dynamicTargetBarColor === false);

m = mergeTargetBarPrefs(
  { dynamicTargetBarColor: true, updatedAt: '2026-02-01T10:00:00.000Z' },
  { dynamicTargetBarColor: false, updatedAt: '2026-02-01T10:00:00.000Z' }
);
check('equal stamps -> none', m.action === 'none');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
