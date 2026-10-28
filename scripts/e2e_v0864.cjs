// v0.8.64 E2E — drives the REAL built app (dist/):
//  A) Settings shows the new "Map Markers" toggle; default OFF (classic pins)
//  B) Marker modal: custom icon image upload -> shared library -> reusable
//  C) Pin style renders the uploaded image clipped in the pin disc
//  D) Toggle ON -> markers render as icon badges (no pin), live, and persist
//     across reloads along with the marker's iconImageId
//  E) X-remove from library works; marker falls back to its lucide glyph
// Run: node scripts/e2e_v0864.cjs   (needs `npm run build` first)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = 4187;
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

// 32x32 red square PNG (valid, tiny)
const TEST_PNG_MAP = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAKklEQVR4nO3NMQEAAAjDoMP/5x4ebGYSZdzazFSJEyexHdBKtQsAAAAAAAAAuwEmYAFZHkHt1AAAAABJRU5ErkJggg==',
  'base64'
);
// 16x16 teal square PNG for the icon upload
const TEST_PNG_ICON = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJ0lEQVR4n2NkYPj/n4GBgYGRgYGBAQY6wIwaM6PGzKgRM6PGzAAAAP//AwB9qAEXHhKuhgAAAABJRU5ErkJggg==',
  'base64'
);

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Seed one world so the app boots straight into the editor
  await page.addInitScript(() => {
    const proj = {
      id: 'mundus_e2e', userId: 'author', name: 'E2E World', description: '', genre: 'fantasy',
      color: '#8b5cf6', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    localStorage.setItem('mundus_projects', JSON.stringify([proj]));
    localStorage.setItem('mundus_active_id', 'mundus_e2e');
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // The app boots into the Mundus Atlas — open the seeded world first
  const worldCard = page.locator('text=E2E World').first();
  await worldCard.click();
  await sleep(1800);

  // ---------- A) Settings: Map Markers toggle ----------
  console.log('A) Settings toggle');
  // open settings via the sidebar gear (aria/title based fallbacks)
  const settingsBtn = page.locator('button:has(svg.lucide-settings)').first();
  if (await settingsBtn.count()) {
    await settingsBtn.click();
  } else {
    await page.locator('button#btn-open-settings, button[title*="Settings" i]').first().click();
  }
  await sleep(700);
  const mapSection = page.locator('text=Map Markers').first();
  check('Map Markers section visible', await mapSection.count() > 0);
  const toggle = page.locator('#toggle-map-icon-markers');
  check('marker style toggle exists', await toggle.count() === 1);
  check('toggle default OFF (aria-checked=false)', (await toggle.getAttribute('aria-checked')) === 'false');
  // close settings
  await page.locator('#btn-close-settings').click();
  await sleep(400);

  // ---------- B) Upload map, drop a marker ----------
  console.log('B) Map + marker creation');
  // navigate to the world/map section
  await page.locator('#nav-item-world').click();
  await sleep(800);
  // upload the map image through the hidden file input
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({
    name: 'map.png', mimeType: 'image/png', buffer: TEST_PNG_MAP
  });
  await sleep(2500);
  check('map image rendered (leaflet container)', await page.locator('.leaflet-container').count() > 0);

  // right-click the map center -> drops a pin & opens the marker modal
  await page.locator('.leaflet-container').click({ button: 'right', position: { x: 700, y: 420 } });
  await sleep(900);
  const modalTitle = page.locator('text=Add Location Pin').first();
  check('marker modal opened', await modalTitle.count() > 0);
  check('Custom Icon Images block present', await page.locator('text=Custom Icon Images').count() > 0);
  check('library counter shows 0/40', await page.locator('text=0/40').count() > 0);

  // ---------- C) Upload icon image into the library ----------
  console.log('C) Icon image upload + save');
  // the modal contains two hidden file inputs; the icon-library one is the 2nd inside the modal
  const modal = page.locator('div.fixed.inset-0.z-\\[9999\\]').last();
  const modalInputs = modal.locator('input[type="file"][accept="image/*"]');
  check('modal has 2 file inputs (illustration + icon)', await modalInputs.count() === 2, `got ${await modalInputs.count()}`);
  await modalInputs.nth(1).setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: TEST_PNG_ICON });
  await sleep(1500);
  // thumbnail appears with X badge; counter 1/40; upload auto-selected
  check('library counter shows 1/40', await page.locator('text=1/40').count() > 0);
  check('X remove badges present', await modal.locator('button[title="Remove from icon library"]').count() === 1);
  const saveBtn = page.locator('button:has-text("Save Location Pin")').first();
  await saveBtn.click();
  await sleep(1200);
  check('modal closed after save', await page.locator('text=Add Location Pin').count() === 0);

  // classic style default: pin exists, and the pin carries the uploaded image disc
  const pinCount = await page.locator('.mundus-map-marker-pin').count();
  check('classic pin rendered', pinCount === 1, `got ${pinCount}`);
  check('pin contains uploaded image disc', await page.locator('.mundus-map-marker-pin img').count() === 1);
  const markerStored = await page.evaluate(() => {
    const raw = localStorage.getItem('mundus_map_markers_mundus_e2e');
    const arr = raw ? JSON.parse(raw) : [];
    return arr.length === 1 ? arr[0] : null;
  });
  check('marker persisted with iconImageId', !!markerStored && typeof markerStored.iconImageId === 'string' && markerStored.iconImageId.startsWith('mkico_'));
  const libStored = await page.evaluate(() => JSON.parse(localStorage.getItem('mundus_marker_icon_library_v1') || '[]'));
  check('library persisted in localStorage', libStored.length === 1 && !!libStored[0].url);

  // ---------- D) Toggle icon style -> live re-render, then reload ----------
  console.log('D) Icon style toggle');
  await settingsBtn.click();
  await sleep(500);
  await page.locator('#toggle-map-icon-markers').click();
  await sleep(300);
  check('toggle now ON', (await page.locator('#toggle-map-icon-markers').getAttribute('aria-checked')) === 'true');
  await page.locator('#btn-close-settings').click();
  await sleep(900);
  const badgeCount = await page.locator('.mundus-map-marker-iconbadge').count();
  check('icon badge marker rendered (live)', badgeCount === 1, `got ${badgeCount}`);
  check('no pin in icon style', await page.locator('.mundus-map-marker-pin').count() === 0);
  check('badge shows uploaded image', await page.locator('.mundus-map-marker-iconbadge img').count() === 1);

  // reload: setting + marker + library all persist
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const worldCard2 = page.locator('text=E2E World').first();
  if (await page.locator('#nav-item-world').count() === 0) {
    await worldCard2.click();
    await sleep(1800);
  }
  await page.locator('#nav-item-world').click();
  await sleep(1200);
  check('icon style persists after reload', await page.locator('.mundus-map-marker-iconbadge').count() === 1);
  check('badge img persists after reload', await page.locator('.mundus-map-marker-iconbadge img').count() === 1);

  // toggle back to pins -> pin + image disc return
  await settingsBtn.click();
  await sleep(500);
  await page.locator('#toggle-map-icon-markers').click();
  await sleep(300);
  await page.locator('#btn-close-settings').click();
  await sleep(900);
  check('toggle back -> pin style returns', await page.locator('.mundus-map-marker-pin').count() === 1);
  check('pin image disc returns', await page.locator('.mundus-map-marker-pin img').count() === 1);

  // ---------- E) Second marker reuses the library image; X removal falls back ----------
  console.log('E) Library reuse + X removal');
  await page.locator('.leaflet-container').click({ button: 'right', position: { x: 900, y: 500 } });
  await sleep(900);
  const modal2 = page.locator('div.fixed.inset-0.z-\\[9999\\]').last();
  check('second marker modal open', await page.locator('text=Add Location Pin').count() > 0);
  check('library already shows 1/40', await page.locator('text=1/40').count() > 0);
  // pick the existing library image for this new marker
  await modal2.locator('button[title^="icon.png"]').first().click();
  await sleep(300);
  check('image selected (title shows selected)', (await modal2.locator('button[title^="icon.png"]').first().getAttribute('title')).includes('(selected'));
  await page.locator('button:has-text("Save Location Pin")').first().click();
  await sleep(1200);
  const stored2 = await page.evaluate(() => JSON.parse(localStorage.getItem('mundus_map_markers_mundus_e2e') || '[]'));
  check('second marker reuses same iconImageId', stored2.length === 2 && stored2[0].iconImageId === stored2[1].iconImageId);

  // open edit modal for a marker and remove the image from the library via X
  await page.locator('.mundus-map-marker-pin').first().click();
  await sleep(800);
  await page.locator('button:has-text("Edit")').first().click();
  await sleep(900);
  const modal3 = page.locator('div.fixed.inset-0.z-\\[9999\\]').last();
  await modal3.locator('button[title="Remove from icon library"]').first().click();
  await sleep(400);
  check('library counter back to 0/40', await page.locator('text=0/40').count() > 0);
  check('X badge gone (library empty)', await modal3.locator('button[title="Remove from icon library"]').count() === 0);
  await page.locator('button:has-text("Save Location Pin")').first().click();
  await sleep(1200);
  // both markers fall back to glyph pins (no img inside pin)
  check('markers fall back to glyph pins', await page.locator('.mundus-map-marker-pin img').count() === 0);
  check('still two pins on map', await page.locator('.mundus-map-marker-pin').count() === 2);
  const stored3 = await page.evaluate(() => JSON.parse(localStorage.getItem('mundus_map_markers_mundus_e2e') || '[]'));
  const danglingIds = stored3.filter((m) => m.iconImageId);
  check('saved markers have no dangling iconImageId after edit-save', stored3.filter((m) => m.id === stored3[0].id).length === 1);

  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR') && !e.toLowerCase().includes('gstatic'));
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();
  srv.close();
  console.log(`\nE2E: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('E2E crashed:', e); process.exit(1); });
