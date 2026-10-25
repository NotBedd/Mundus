// v0.8.64 round-2 E2E — drives the REAL built app (dist/):
//  A) Autocorrect toggle: desktop default ON, persisted device-locally,
//     new "Device-specific" hint text, explicit choice survives reload
//  B) Map Markers settings toggle: ON writes style + the cloud-sync stamp
//     (push path runs without crashing even when Firebase is unconfigured)
//  C) Icon library cloud-sync plumbing: add/remove still works and removals
//     now record tombstones (mundus_marker_icon_tombstones_v1)
//  D) Android UA context: autocorrect defaults OFF on mobile
// Run: node scripts/e2e_v0864_sync.cjs   (needs `npm run build` first)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = 4189;
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

// 32x32 red square PNG (map) + 16x16 teal square PNG (icon upload)
const TEST_PNG_MAP = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAKklEQVR4nO3NMQEAAAjDoMP/5x4ebGYSZdzazFSJEyexHdBKtQsAAAAAAAAAuwEmYAFZHkHt1AAAAABJRU5ErkJggg==',
  'base64'
);
const TEST_PNG_ICON = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJ0lEQVR4n2NkYPj/n4GBgYGRgYGBAQY6wIwaM6PGzKgRM6PGzAAAAP//AwB9qAEXHhKuhgAAAABJRU5ErkJggg==',
  'base64'
);

const seedWorld = (extra = {}) => {
  const proj = {
    id: 'mundus_e2e', userId: 'author', name: 'E2E World', description: '', genre: 'fantasy',
    color: '#8b5cf6', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  localStorage.setItem('mundus_projects', JSON.stringify([proj]));
  localStorage.setItem('mundus_active_id', 'mundus_e2e');
  void extra;
};

async function bootIntoEditor(page) {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const worldCard = page.locator('text=E2E World').first();
  await worldCard.click();
  await sleep(1800);
}

async function openDictionaryMenu(page) {
  await page.locator('#toolbar-custom-dict-btn').click();
  await sleep(700);
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // ---------------- Desktop context ----------------
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(seedWorld);
  console.log('A) Autocorrect toggle (desktop)');
  await bootIntoEditor(page);

  await openDictionaryMenu(page);
  const acSwitch = page.locator('div:has-text("Autocorrect Suggestions") >> button[role="switch"]').first();
  // The switch is inside the section containing the label; fall back to scanning
  let acChecked = null;
  try {
    acChecked = await page.locator('button[role="switch"]').evaluateAll((btns) => {
      const hit = btns.find((b) => b.closest('div')?.textContent?.includes('Autocorrect Suggestions'));
      return hit ? hit.getAttribute('aria-checked') : null;
    });
  } catch (e) {}
  check('autocorrect switch found', acChecked !== null, `got ${acChecked}`);
  check('desktop default ON (aria-checked=true)', acChecked === 'true');
  check('no local override yet', (await page.evaluate(() => localStorage.getItem('mundus_autocorrect_enabled'))) === null);
  check('device-specific hint present', await page.locator('text=Device-specific').count() > 0);
  check('mobile-off hint mentions Android/iOS', await page.locator('text=OFF by default on Android/iOS').count() > 0);

  // toggle OFF -> persisted locally
  await page.locator('button[role="switch"]').evaluateAll((btns) => {
    const hit = btns.find((b) => b.closest('div')?.textContent?.includes('Autocorrect Suggestions'));
    if (hit) hit.click();
  });
  await sleep(500);
  check('toggled OFF (aria-checked=false)', (await page.locator('button[role="switch"]').evaluateAll((btns) => {
    const hit = btns.find((b) => b.closest('div')?.textContent?.includes('Autocorrect Suggestions'));
    return hit ? hit.getAttribute('aria-checked') : null;
  })) === 'false');
  check('local override written (false)', (await page.evaluate(() => localStorage.getItem('mundus_autocorrect_enabled'))) === 'false');

  // survives reload (device-specific persistence)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2200);
  await page.locator('text=E2E World').first().click();
  await sleep(1500);
  await openDictionaryMenu(page);
  check('OFF survives reload', (await page.locator('button[role="switch"]').evaluateAll((btns) => {
    const hit = btns.find((b) => b.closest('div')?.textContent?.includes('Autocorrect Suggestions'));
    return hit ? hit.getAttribute('aria-checked') : null;
  })) === 'false');
  // toggle back ON for cleanliness
  await page.locator('button[role="switch"]').evaluateAll((btns) => {
    const hit = btns.find((b) => b.closest('div')?.textContent?.includes('Autocorrect Suggestions'));
    if (hit) hit.click();
  });
  await sleep(400);
  check('toggled back ON (persisted true)', (await page.evaluate(() => localStorage.getItem('mundus_autocorrect_enabled'))) === 'true');
  // close the dictionary modal via its X (first close button in the modal)
  await page.locator('div.fixed >> button:has(svg.lucide-x)').first().click();
  await sleep(500);
  check('dictionary modal closed', (await page.locator('text=Spell Check & Dictionary').count()) === 0);

  // ---------------- B) Map Markers settings toggle + sync stamp ----------------
  console.log('B) Map Markers toggle + cloud-sync stamp');
  const settingsBtn = page.locator('button:has(svg.lucide-settings)').first();
  await settingsBtn.click();
  await sleep(700);
  const toggle = page.locator('#toggle-map-icon-markers');
  check('marker style toggle exists', await toggle.count() === 1);
  check('default OFF', (await toggle.getAttribute('aria-checked')) === 'false');
  await toggle.click();
  await sleep(600);
  check('toggled ON', (await toggle.getAttribute('aria-checked')) === 'true');
  check('style saved (icon)', (await page.evaluate(() => localStorage.getItem('mundus_map_marker_style'))) === 'icon');
  const stamp = await page.evaluate(() => localStorage.getItem('mundus_map_marker_prefs_updated'));
  check('cloud-sync stamp written', !!stamp && !Number.isNaN(Date.parse(stamp)), `got ${stamp}`);
  await toggle.click();
  await sleep(600);
  check('toggled back OFF', (await toggle.getAttribute('aria-checked')) === 'false');
  check('style saved (pin)', (await page.evaluate(() => localStorage.getItem('mundus_map_marker_style'))) === 'pin');
  check('stamp refreshed', (await page.evaluate(() => localStorage.getItem('mundus_map_marker_prefs_updated'))) !== stamp);
  check('settings hint mentions cloud sync', await page.locator('text=sync to the cloud across your devices').count() > 0);
  await page.locator('#btn-close-settings').click();
  await sleep(400);

  // ---------------- C) Icon library + tombstones ----------------
  console.log('C) Icon library sync plumbing (tombstones)');
  await page.locator('#nav-item-world').click();
  await sleep(800);
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({
    name: 'map.png', mimeType: 'image/png', buffer: TEST_PNG_MAP
  });
  await sleep(2500);
  check('map rendered', await page.locator('.leaflet-container').count() > 0);
  await page.locator('.leaflet-container').click({ button: 'right', position: { x: 700, y: 420 } });
  await sleep(900);
  check('marker modal opened', await page.locator('text=Add Location Pin').count() > 0);
  const modal = page.locator('div.fixed.inset-0.z-\\[9999\\]').last();
  const modalInputs = modal.locator('input[type="file"][accept="image/*"]');
  await modalInputs.nth(1).setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: TEST_PNG_ICON });
  await sleep(1500);
  check('library 1/40', await page.locator('text=1/40').count() > 0);
  const libBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('mundus_marker_icon_library_v1') || '[]'));
  check('library persisted', libBefore.length === 1);
  check('no tombstones before removal', (await page.evaluate(() => localStorage.getItem('mundus_marker_icon_tombstones_v1'))) === null);
  const saveBtn = page.locator('button:has-text("Save Location Pin")').first();
  await saveBtn.click();
  await sleep(1200);
  check('pin rendered with image disc', await page.locator('.mundus-map-marker-pin img').count() === 1);

  // edit -> remove from library -> tombstone recorded
  await page.locator('.mundus-map-marker-pin').first().click();
  await sleep(800);
  await page.locator('button:has-text("Edit")').first().click();
  await sleep(900);
  await modal.locator('button[title="Remove from icon library"]').first().click();
  await sleep(500);
  const tombs = await page.evaluate(() => JSON.parse(localStorage.getItem('mundus_marker_icon_tombstones_v1') || '[]'));
  check('tombstone recorded on X-remove', Array.isArray(tombs) && tombs.length === 1 && tombs[0].id === libBefore[0].id, JSON.stringify(tombs).slice(0, 120));
  check('library counter 0/40', await page.locator('text=0/40').count() > 0);
  await page.locator('button:has-text("Save Location Pin")').first().click();
  await sleep(1200);
  check('marker falls back to glyph pin', await page.locator('.mundus-map-marker-pin img').count() === 0);

  const realErrors = errors.filter((e) => !/firebasestorage|googleapis|403|Failed to load resource/i.test(e));
  check('no console errors (desktop)', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  // ---------------- D) Android UA context: autocorrect default OFF ----------------
  console.log('D) Android context default');
  const ctx2 = await browser.newContext({
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    isMobile: true, hasTouch: true
  });
  const page2 = await ctx2.newPage();
  page2.on('pageerror', (e) => console.log('  [android pageerror]', String(e).slice(0, 200)));
  await page2.addInitScript(seedWorld);
  await page2.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page2.locator('text=E2E World').first().click();
  await sleep(1800);
  await page2.locator('#toolbar-custom-dict-btn').click();
  await sleep(700);
  const ac2 = await page2.locator('button[role="switch"]').evaluateAll((btns) => {
    const hit = btns.find((b) => b.closest('div')?.textContent?.includes('Autocorrect Suggestions'));
    return hit ? hit.getAttribute('aria-checked') : null;
  });
  check('android default OFF (aria-checked=false)', ac2 === 'false', `got ${ac2}`);
  check('android: no local override written (pure default)', (await page2.evaluate(() => localStorage.getItem('mundus_autocorrect_enabled'))) === null);
  check('android: marker style still defaults to pin', (await page2.evaluate(() => localStorage.getItem('mundus_map_marker_style'))) === null);
  await ctx2.close();

  await browser.close();
  srv.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
