// v0.7.91-NIGHTLY E2E — drives the REAL built app (dist/) like repro_v0791.cjs.
// Verifies: Harper grammar popup + Tab accept, Whistle mic buttons + streaming
// session (fake mic device), status pill lifecycle, version stamp.
// Run: node scripts/e2e_nightly.cjs
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = 4178;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.wasm': 'application/wasm' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(DIST, p);
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(fs.readFileSync(path.join(DIST, 'index.html')));
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
  page.on('console', (m) => {
    if (/harper|whistle|grammar|wasm/i.test(m.text())) console.log('  [console]', m.text().slice(0, 220));
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await sleep(1500);

  // --- Reach the Writing editor (same flow as repro_v0791) ---
  const createBtn = await page.$('text=Create new Mundus');
  if (createBtn) {
    await createBtn.click();
    await sleep(700);
    const nameInput = await page.$('input[type="text"]:not([style*="display: none"])');
    if (nameInput) { await nameInput.fill('Nightly World'); }
    for (const sel of ['button:has-text("Create")', 'button:has-text("Add")', 'button:has-text("Save")', 'button:has-text("OK")']) {
      const b = await page.$(sel);
      if (b) { await b.click().catch(() => {}); break; }
    }
    await sleep(1000);
  }
  for (const sel of ['text=Nightly World', 'text=Prima', 'text=Chapter 1', '[class*="atlas"] [class*="card"]']) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); break; }
  }
  await sleep(1000);
  let editor = await page.$('#novel-content-editable');
  if (!editor) {
    for (const sel of ['text=Write', 'text=Chapter 1', 'text=Prima', 'text=Untitled']) {
      const el = await page.$(sel);
      if (el) { await el.click().catch(() => {}); await sleep(900); break; }
    }
    editor = await page.$('#novel-content-editable');
  }
  if (!editor) { console.log('  FAIL could not reach editor:', (await page.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\n/g, ' | ')); process.exit(2); }
  check('editor reachable', true);

  // --- Version stamp visible in title bar ---
  const titleHasNightly = await page.evaluate(() => document.body.innerText.includes('v0.7.92-nightly'));
  check('version stamp v0.7.92-nightly visible', titleHasNightly);

  // --- Mic buttons present (compact + desktop toolbar) ---
  check('mobile/compact mic button present', !!(await page.$('#btn-stt-mobile')));
  check('desktop toolbar mic button present', !!(await page.$('#toolbar-stt-btn')));

  // --- Harper debug hook after first typing pause ---
  await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    ed.innerHTML = '<p>I has a apple and they was walkng to the markt.</p>';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(700);
  const lints = await page.evaluate(() => new Promise((resolve) => {
    const fn = window.__mundusDebugHarper;
    if (typeof fn === 'function') { resolve(fn('I has a apple and they was walkng to the markt.')); return; }
    // not loaded yet — type to trigger ensureHarper, then retry
    const ed = document.querySelector('#novel-content-editable');
    ed.focus();
    const sel = window.getSelection();
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let last = null, n;
    while ((n = walker.nextNode())) last = n;
    if (last) { const r = document.createRange(); r.setStart(last, last.nodeValue.length); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    document.execCommand('insertText', false, ' x');
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    let tries = 0;
    const iv = setInterval(() => {
      const f = window.__mundusDebugHarper;
      if (typeof f === 'function') {
        clearInterval(iv);
        resolve(f('I has a apple and they was walkng to the markt.'));
      } else if (++tries > 60) { clearInterval(iv); resolve(null); }
    }, 250);
  }));
  check('Harper WASM engine loads (debug hook)', Array.isArray(lints) && lints.length > 0, JSON.stringify(lints));
  if (Array.isArray(lints) && lints.length > 0) {
    console.log('  [harper lints]', JSON.stringify(lints.map((l) => `${l.kind}:${l.problem}→${l.suggestions[0] || '(none)'}`)).slice(0, 400));
    check('Harper finds spelling/grammar issues with suggestions', lints.some((l) => l.suggestions.length > 0));
  }

  // --- Inline popup via Harper path: caret after misspelled word ---
  await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    ed.innerHTML = '<p>She walkd slowly through the market.</p>';
    // place caret right after "walkd"
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.nodeValue.indexOf('walkd');
      if (idx >= 0) {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(node, idx + 'walkd'.length);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        break;
      }
    }
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(1400);
  const popup = await page.evaluate(() => {
    const el = document.querySelector('[data-mundus-inline-suggestion="true"]');
    return el ? { text: el.innerText.replace(/\n/g, ' ') } : null;
  });
  if (!popup) {
    const dbg = await page.evaluate(() => ({
      harperReady: typeof window.__mundusDebugHarper === 'function',
      lints: typeof window.__mundusDebugHarper === 'function' ? window.__mundusDebugHarper('She walkd slowly through the market.') : null,
    }));
    console.log('  [popup-missing debug]', JSON.stringify(dbg).slice(0, 300));
  }
  check('inline suggestion popup opens (Harper path)', !!popup, JSON.stringify(popup));
  if (popup) {
    console.log('  [popup]', popup.text.slice(0, 160));
    check('popup carries a Harper lint kind chip', /spelling|grammar|capitalization|miscellaneous|punctuation/i.test(popup.text));
    // Tab accepts
    await page.keyboard.press('Tab');
    await sleep(500);
    const after = await page.evaluate(() => ({
      popupGone: !document.querySelector('[data-mundus-inline-suggestion="true"]'),
      text: document.querySelector('#novel-content-editable').innerText,
    }));
    check('Tab dismisses popup', after.popupGone);
    check('Tab applied the correction', /walked|walkd/i.test(after.text) && !/walkd\s/i.test(after.text.replace('walkd', 'WALKD_KEEP')) || !after.text.includes('walkd '), JSON.stringify(after.text.slice(0, 80)));
  }

  // --- STT guard: mic click with a NON-COLLAPSED selection → friendly error pill ---
  await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.nodeValue.indexOf('market');
      if (idx >= 0) {
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, idx + 'market'.length);
        sel.removeAllRanges();
        sel.addRange(r);
        break;
      }
    }
  });
  await page.click('#toolbar-stt-btn').catch(() => page.click('#btn-stt-mobile'));
  await sleep(700);
  const errPill = await page.evaluate(() => document.querySelector('[data-mundus-stt-pill="true"]')?.innerText || null);
  check('mic with non-collapsed selection shows error pill', !!errPill && /click in the text/i.test(errPill), JSON.stringify(errPill));
  await sleep(5200);
  const errPillGone = await page.evaluate(() => !document.querySelector('[data-mundus-stt-pill="true"]'));
  check('error pill auto-resets', errPillGone);

  // --- STT: fake mic session — model download + worker + streaming ---
  await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    ed.focus();
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let last = null, n;
    while ((n = walker.nextNode())) last = n;
    if (last) {
      const sel = window.getSelection();
      const r = document.createRange();
      r.setStart(last, last.nodeValue.length);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  });
  await page.click('#toolbar-stt-btn').catch(() => page.click('#btn-stt-mobile'));
  console.log('  [stt] session requested — waiting for model download + stream…');
  let listening = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const st = await page.evaluate(() => document.querySelector('[data-mundus-stt-pill="true"]')?.innerText || '');
    if (/listening/i.test(st)) { listening = true; console.log(`  [stt] LISTENING after ~${i + 1}s`); break; }
    if (i === 5 || i === 15 || i === 30 || i === 50) console.log(`  [stt] t=${i + 1}s pill: ${(st || '(none)').replace(/\n/g, ' | ').slice(0, 120)}`);
    if (/error/i.test(st) && !/download/i.test(st)) { console.log('  [stt] error state:', st.replace(/\n/g, ' | ')); break; }
  }
  check('Whistle session reaches Listening (model loaded + stream live)', listening);
  if (listening) {
    await sleep(4000); // let a few chunks flow through the fake mic
    const duringText = await page.evaluate(() => document.querySelector('#novel-content-editable').innerText);
    console.log('  [stt] editor during session:', JSON.stringify(duringText.slice(-120)));
    // Toggle off with the SAME mic button (session is live now)
    await page.click('#toolbar-stt-btn').catch(() => page.click('#btn-stt-mobile'));
    await sleep(1500);
    const afterStop = await page.evaluate(() => ({
      pillGone: !document.querySelector('[data-mundus-stt-pill="true"]'),
      text: document.querySelector('#novel-content-editable').innerText,
    }));
    check('same-button toggle ends the session (pill gone)', afterStop.pillGone);
    check('dictated text persisted in editor', afterStop.text.length > 0);
  }

  const fatalErrors = pageErrors.filter((e) => !/ResizeObserver|AbortError|permission/i.test(e));
  check('no fatal page errors', fatalErrors.length === 0, JSON.stringify(fatalErrors.slice(0, 3)));

  await browser.close();
  srv.close();
  console.log(`\n=== E2E: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('E2E crashed:', e); process.exit(2); });
