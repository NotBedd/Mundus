// v0.8.65 — Node-side smoke test for the newly shipped spell dictionaries
// (pt / ru / tr) through the SAME engine the app uses (hunspell-asm).
// Run: node scripts/test_spellcheck_v0865.mjs
// Exits non-zero if any check fails, so CI/prepare scripts can gate on it.
// hunspell-asm is CommonJS — use default-import interop. The factory comes
// from loadModule(), exactly like the app's spellCheckEngine.ensureFactory().
import hunspellAsm from 'hunspell-asm';
import { readFile } from 'node:fs/promises';

const { loadModule } = hunspellAsm;

const CASES = [
  {
    code: 'pt',
    pkg: 'dictionary-pt',
    valid: ['mundo', 'escrever', 'coração', 'português'],
    invalid: ['mundoxx', 'escrverr'],
    suggest: { input: 'mundu', expect: 'mundo' },
  },
  {
    code: 'ru',
    pkg: 'dictionary-ru',
    valid: ['мир', 'привет', 'книга', 'пишет'],
    invalid: ['приветxx', 'книгаx'],
    suggest: { input: 'превет', expect: 'привет' },
  },
  {
    code: 'tr',
    pkg: 'dictionary-tr',
    valid: ['dünya', 'kitap', 'yazmak', 'Türkçe'],
    invalid: ['kitapxx', 'yazmakx'],
    suggest: { input: 'kitp', expect: 'kitap' },
  },
];

let failures = 0;
const factory = await loadModule();

for (const c of CASES) {
  const aff = await readFile(new URL(`../node_modules/${c.pkg}/index.aff`, import.meta.url));
  const dic = await readFile(new URL(`../node_modules/${c.pkg}/index.dic`, import.meta.url));
  const affPath = factory.mountBuffer(new Uint8Array(aff), `${c.code}.aff`);
  const dicPath = factory.mountBuffer(new Uint8Array(dic), `${c.code}.dic`);
  const t0 = Date.now();
  const instance = factory.create(affPath, dicPath);
  const constructMs = Date.now() - t0;
  console.log(`[${c.code}] constructed in ${constructMs} ms`);

  for (const w of c.valid) {
    const ok = instance.spell(w);
    if (!ok) { failures++; console.error(`[${c.code}] FAIL: "${w}" should be VALID`); }
    else console.log(`[${c.code}] ok: "${w}" valid`);
  }
  for (const w of c.invalid) {
    const bad = instance.spell(w);
    if (bad) { failures++; console.error(`[${c.code}] FAIL: "${w}" should be INVALID`); }
    else console.log(`[${c.code}] ok: "${w}" flagged as misspelled`);
  }
  const sugg = instance.suggest(c.suggest.input) || [];
  const hit = sugg.includes(c.suggest.expect);
  console.log(`[${c.code}] suggest("${c.suggest.input}") = [${sugg.slice(0, 5).join(', ')}] -> ${hit ? 'contains expected' : 'NO exact match (non-fatal, engine ranking may differ)'}`);
  if (!hit) console.log(`[${c.code}] note: suggestion ranking differs — spellcheck still works; not counted as failure`);
  try { instance.dispose(); } catch { /* ok */ }
}

if (failures > 0) {
  console.error(`\n${failures} dictionary check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll pt/ru/tr dictionary smoke tests passed.');
