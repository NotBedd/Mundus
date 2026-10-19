// Repro script for v0.7.91 items 1 & 2 (auto-color no-op + clear-formatting keeps highlight).
// Drives the REAL UI of the built app: real mouse-drag text selection, real toolbar clicks.
// Run: node scripts/repro_v0791.cjs   (serves dist/ on port 4177)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = 4177;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };

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
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (/Auto color|error/i.test(m.text())) console.log('  [console]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await sleep(1200);

  // --- Item 3: Atlas top-right settings button opens the settings modal ---
  const atlasSettingsBtn = await page.$('#btn-atlas-open-settings');
  check('Atlas shows a settings button next to the theme toggle', !!atlasSettingsBtn);
  if (atlasSettingsBtn) {
    await atlasSettingsBtn.click();
    await sleep(500);
    const modalOpen = await page.evaluate(() => document.body.innerText.includes('Mundus Settings'));
    check('Atlas settings button opens Mundus Settings modal', modalOpen);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(400);
    const modalClosed = await page.evaluate(() => !document.body.innerText.includes('Mundus Settings'));
    if (!modalClosed) { await page.reload({ waitUntil: 'networkidle' }); await sleep(1200); }
  }

  // --- Enter the write view from the Atlas hub ---
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log('  [boot screen]', bodyText.replace(/\n/g, ' | ').slice(0, 200));
  // Create a Mundus project if the hub is empty
  const createBtn = await page.$('text=Create new Mundus');
  if (createBtn) {
    await createBtn.click();
    await sleep(600);
    const nameInput = await page.$('input[type="text"]:not([style*="display: none"])');
    if (nameInput) { await nameInput.fill('Repro World'); }
    for (const sel of ['button:has-text("Create")', 'button:has-text("Add")', 'button:has-text("Save")', 'button:has-text("OK")']) {
      const b = await page.$(sel);
      if (b) { await b.click().catch(() => {}); break; }
    }
    await sleep(900);
  }
  // Click the first project card / enter affordance
  for (const sel of ['text=Repro World', 'text=Prima', 'text=Chapter 1', '[class*="atlas"] [class*="card"]']) {
    const el = await page.$(sel);
    if (el) { await el.click().catch(() => {}); break; }
  }
  await sleep(1000);
  let editor = await page.$('#novel-content-editable');
  if (!editor) {
    // Maybe landed on start menu; try again
    for (const sel of ['text=Write', 'text=Chapter 1', 'text=Prima']) {
      const el = await page.$(sel);
      if (el) { await el.click().catch(() => {}); await sleep(800); break; }
    }
    editor = await page.$('#novel-content-editable');
  }
  if (!editor) { console.log('  FAIL could not reach editor. Screen:', (await page.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\n/g, ' | ')); process.exit(2); }
  console.log('  [ok] editor visible');

  // --- Fresh content: clear editor and type our sentence ---
  await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    ed.innerHTML = '<p>The quick crimson fox jumps.</p>';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(600);

  // --- Real mouse-drag selection of the word "crimson" ---
  const rect = await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.nodeValue.indexOf('crimson');
      if (idx >= 0) {
        const r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, idx + 'crimson'.length);
        const b = r.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, left: b.left, right: b.right };
      }
    }
    return null;
  });
  if (!rect) { console.log('  FAIL word not found in editor'); process.exit(2); }
  await page.mouse.move(rect.left + 2, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.right - 2, rect.y, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
  const selLen = await page.evaluate(() => (window.getSelection() || '').toString());
  console.log('  [sel]', JSON.stringify(selLen));
  check('mouse-drag selection captured "crimson"', selLen === 'crimson');

  // --- Item 1 repro: apply red (#b91c1c), then click the fixed AUTO slot ---
  await page.click('#toolbar-color-btn');
  await sleep(350);
  const redApplied = await page.click('[title^="Apply #b91c1c"]').then(() => true).catch(() => false);
  await sleep(500);
  const redColor = await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    const w = ed.innerText.includes('crimson');
    const el = [...ed.querySelectorAll('*')].find((e) => e.textContent.trim() === 'crimson');
    const attr = (el || {}).outerHTML || '';
    return { computed: getComputedStyle(el || ed).color, html: attr.slice(0, 160), ok: w };
  });
  console.log('  [red]', JSON.stringify(redColor));
  check('red slot applied red color', redApplied && redColor.computed === 'rgb(185, 28, 28)', `got ${redColor.computed}`);

  // Re-select "crimson" (the color click may collapse/alter selection), then click AUTO slot
  await page.mouse.move(rect.left + 2, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.right - 2, rect.y, { steps: 8 });
  await page.mouse.up();
  await sleep(250);
  await page.click('#toolbar-color-btn');
  await sleep(350);
  await page.click('[title^="Default Theme Color"]');
  await sleep(800);
  const afterAuto = await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    // After the fix the word may live in a bare text node — locate it and use
    // its parent element for the computed-color comparison.
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let node;
    let hit = null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes('crimson')) { hit = node.parentElement; break; }
    }
    return {
      computed: hit ? getComputedStyle(hit).color : 'gone',
      editorColor: getComputedStyle(ed).color,
      fontTags: ed.querySelectorAll('font[color]').length,
      spanColor: ed.querySelectorAll('[style*="color"]').length,
    };
  });
  console.log('  [afterAuto]', JSON.stringify(afterAuto));
  check('AUTO slot removed red (word inherits editor theme color)', afterAuto.computed === afterAuto.editorColor, `word=${afterAuto.computed} editor=${afterAuto.editorColor}`);
  check('AUTO slot left no font[color] wrappers', afterAuto.fontTags === 0);

  // --- Item 2 repro: highlight gold, then Clear Formatting ---
  await page.mouse.move(rect.left + 2, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.right - 2, rect.y, { steps: 8 });
  await page.mouse.up();
  await sleep(250);
  await page.click('#toolbar-highlight-btn');
  await sleep(350);
  await page.click('[title="Apply Pale Gold"]');
  await sleep(500);
  const hlState = await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    const el = [...ed.querySelectorAll('*')].find((e) => e.textContent.trim() === 'crimson');
    return {
      bg: el ? getComputedStyle(el).backgroundColor : 'gone',
      tagged: ed.querySelectorAll('[data-mundus-hl]').length,
    };
  });
  console.log('  [highlight]', JSON.stringify(hlState));

  // Re-select and clear formatting
  await page.mouse.move(rect.left + 2, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.right - 2, rect.y, { steps: 8 });
  await page.mouse.up();
  await sleep(250);
  await page.click('[title="Clear Formatting on Selected Text"]');
  await sleep(800);
  const afterClear = await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    const el = [...ed.querySelectorAll('*')].find((e) => e.textContent.trim() === 'crimson');
    return {
      bg: el ? getComputedStyle(el).backgroundColor : 'gone',
      tagged: ed.querySelectorAll('[data-mundus-hl]').length,
      wordText: el ? el.textContent.trim() : '(word element gone)',
    };
  });
  console.log('  [afterClear]', JSON.stringify(afterClear));
  check('Clear Formatting removed the highlight wash', afterClear.bg === 'rgba(0, 0, 0, 0)', `bg=${afterClear.bg} tagged=${afterClear.tagged}`);
  check('Clear Formatting left no data-mundus-hl tags', afterClear.tagged === 0);

  // --- Item 4: drag a document row in Mundus View (StartMenu) — no stuck marquee ---
  const openHub = await page.$('[title="Open Mundus View"]');
  if (openHub) {
    await openHub.click();
    await sleep(800);
    const row = await page.$('[data-startmenu-doc-id]');
    check('Mundus View lists document rows', !!row);
    if (row) {
      const rb = await row.boundingBox();
      if (rb) {
        await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
        await page.mouse.down();
        await page.mouse.move(rb.x + rb.width / 2 + 8, rb.y + rb.height / 2, { steps: 3 });
        // Real HTML5 drags suppress mouseup and only fire dragstart —
        // reproduce exactly that sequence:
        await page.evaluate(() => {
          const r = document.querySelector('[data-startmenu-doc-id]');
          if (r) r.dispatchEvent(new MouseEvent('dragstart', { bubbles: true }));
        });
        await page.mouse.up();
        await sleep(250);
        // Wander the mouse — before the fix this kept painting the marquee.
        for (let i = 0; i < 12; i++) {
          await page.mouse.move(rb.x + 40 + i * 12, rb.y + 140 + (i % 3) * 10, { steps: 2 });
        }
        await sleep(350);
        const ghosts = await page.evaluate(() => document.querySelectorAll('[class*="bg-blue-500/20"]').length);
        check('no stuck marquee rectangle after file-drag release', ghosts === 0, `found ${ghosts}`);
      }
    }
  } else {
    check('Mundus View hub button found', false);
  }

  await browser.close();
  srv.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(3); });
