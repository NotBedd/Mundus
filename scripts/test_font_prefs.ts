// Unit tests for src/lib/fontPrefs.ts — v0.7.83 font preference sync (last-write-wins).
// Semantics recovered from the v0.7.82 build (verified against the shipped APK bundle).
import { mergeFontPrefs, collectLocalFontPrefs, type FontPrefs } from '../src/lib/fontPrefs';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  ok ', name); }
  else { fail++; console.log('  FAIL', name); }
}

const local = (p: string, h: string, q: string, u: string): FontPrefs =>
  ({ paragraphFont: p, headingFont: h, quoteFont: q, updatedAt: u });

console.log('[1] Cloud missing -> push-local');
let r = mergeFontPrefs(local('serif', 'serif', 'serif', ''), null);
check('action push-local', r.action === 'push-local');
check('updatedAt stamped when local never edited', r.prefs.updatedAt !== '');

console.log('[2] Cloud empty object -> push-local');
r = mergeFontPrefs(local('serif', 'serif', 'serif', '2026-01-01T00:00:00.000Z'), {});
check('action push-local', r.action === 'push-local');
check('local updatedAt preserved', r.prefs.updatedAt === '2026-01-01T00:00:00.000Z');

console.log('[3] Cloud fonts all empty strings -> push-local');
r = mergeFontPrefs(local('roboto', 'serif', 'serif', '2026-01-01T00:00:00.000Z'),
  { paragraphFont: '', headingFont: '', quoteFont: '', updatedAt: '2026-02-01T00:00:00.000Z' });
check('action push-local', r.action === 'push-local');

console.log('[4] Local never stamped, cloud present -> apply-cloud');
r = mergeFontPrefs(local('serif', 'serif', 'serif', ''),
  { paragraphFont: 'gfont_1', headingFont: 'sans', quoteFont: 'serif', updatedAt: '2026-01-01T00:00:00.000Z' });
check('action apply-cloud', r.action === 'apply-cloud');
check('paragraph from cloud', r.prefs.paragraphFont === 'gfont_1');
check('cloud updatedAt kept', r.prefs.updatedAt === '2026-01-01T00:00:00.000Z');

console.log('[5] Cloud newer -> apply-cloud');
r = mergeFontPrefs(local('roboto', 'serif', 'serif', '2026-01-01T10:00:00.000Z'),
  { paragraphFont: 'segoeui', headingFont: 'sans', quoteFont: 'mono', updatedAt: '2026-01-02T10:00:00.000Z' });
check('action apply-cloud', r.action === 'apply-cloud');
check('all three fonts from cloud', r.prefs.paragraphFont === 'segoeui' && r.prefs.headingFont === 'sans' && r.prefs.quoteFont === 'mono');

console.log('[6] Local newer -> push-local');
r = mergeFontPrefs(local('roboto', 'h', 'q', '2026-03-01T10:00:00.000Z'),
  { paragraphFont: 'old', headingFont: 'old', quoteFont: 'old', updatedAt: '2026-02-01T10:00:00.000Z' });
check('action push-local', r.action === 'push-local');
check('local fonts kept', r.prefs.paragraphFont === 'roboto' && r.prefs.headingFont === 'h' && r.prefs.quoteFont === 'q');

console.log('[7] Equal timestamps -> none');
r = mergeFontPrefs(local('a', 'b', 'c', '2026-01-01T00:00:00.000Z'),
  { paragraphFont: 'x', headingFont: 'y', quoteFont: 'z', updatedAt: '2026-01-01T00:00:00.000Z' });
check('action none', r.action === 'none');

console.log('[8] User scenario: PC sets Roboto, phone later sets Segoe UI');
// PC edits at T1 -> cloud = roboto@T1. Phone edits at T2 -> cloud = segoeui@T2.
// Phone startup: cloud(T1) older than local(T2)? phone local=T2 (just edited) -> none, then push? (phone pushed on edit)
// PC startup afterwards: local=T1, cloud=T2 -> apply-cloud Segoe UI on the PC.
const T1 = '2026-01-01T10:00:00.000Z', T2 = '2026-01-01T11:00:00.000Z';
const pcLocal = local('roboto', 'serif', 'serif', T1);
const phonePushed = { paragraphFont: 'segoeui', headingFont: 'sans', quoteFont: 'serif', updatedAt: T2 };
const pcResult = mergeFontPrefs(pcLocal, phonePushed);
check('PC applies phone edit', pcResult.action === 'apply-cloud' && pcResult.prefs.paragraphFont === 'segoeui');
const phoneBeforeEdit = local('roboto', 'serif', 'serif', '');
const phoneResult = mergeFontPrefs(phoneBeforeEdit, { paragraphFont: 'roboto', updatedAt: T1 });
check('phone adopts PC font on first sync', phoneResult.action === 'apply-cloud' && phoneResult.prefs.paragraphFont === 'roboto');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
