// v0.8.64 visual pass — screenshots of both marker styles + modal + settings
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const PORT = 4192;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.wasm': 'application/wasm' };
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/home/z/my-project/scripts/e2e_shots_0864';
fs.mkdirSync(OUT, { recursive: true });

const TEST_PNG_ICON = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJ0lEQVR4n2NkYPj/n4GBgYGRgYGBAQY6wIwaM6PGzKgRM6PGzAAAAP//AwB9qAEXHhKuhgAAAABJRU5ErkJggg==',
  'base64'
);
const TEST_PNG_MAP = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAKklEQVR4nO3NMQEAAAjDoMP/5x4ebGYSZdzazFSJEyexHdBKtQsAAAAAAAAAuwEmYAFZHkHt1AAAAABJRU5ErkJggg==',
  'base64'
);

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await page.addInitScript(() => {
    const proj = { id: 'mundus_e2e', userId: 'author', name: 'E2E World', description: '', genre: 'fantasy', color: '#8b5cf6', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    localStorage.setItem('mundus_projects', JSON.stringify([proj]));
    localStorage.setItem('mundus_active_id', 'mundus_e2e');
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page.locator('text=E2E World').first().click();
  await sleep(1800);
  await page.locator('#nav-item-world').click();
  await sleep(800);
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: TEST_PNG_MAP });
  await sleep(2500);

  const modalOpen = () => page.locator('text=Add Location Pin').count().then((c) => c > 0);

  // marker 1: glyph marker (Castle icon)
  await page.locator('.leaflet-container').click({ button: 'right', position: { x: 600, y: 380 } });
  await sleep(1000);
  console.log('modal1 open:', await modalOpen());
  await page.locator('button[title="Castle"]').first().click();
  await sleep(200);
  await page.locator('button:has-text("Save Location Pin")').first().click();
  await page.locator('text=Add Location Pin').first().waitFor({ state: 'detached', timeout: 8000 }).catch(async () => {
    console.log('modal1 did NOT close');
    await page.screenshot({ path: `${OUT}/fail_1.png` });
  });
  await sleep(800);

  // marker 2: upload icon image
  await page.locator('.leaflet-container').click({ button: 'right', position: { x: 800, y: 450 } });
  await sleep(1000);
  console.log('modal2 open:', await modalOpen());
  if (!(await modalOpen())) {
    await page.screenshot({ path: `${OUT}/fail_2.png` });
    throw new Error('second modal never opened');
  }
  const modal = page.locator('div.fixed.inset-0.z-\\[9999\\]').last();
  await modal.locator('input[type="file"][accept="image/*"]').nth(1).setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: TEST_PNG_ICON });
  await sleep(1500);
  await page.locator('button:has-text("Save Location Pin")').first().click();
  await page.locator('text=Add Location Pin').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => console.log('modal2 did NOT close'));
  await sleep(800);

  await page.screenshot({ path: `${OUT}/1_pin_style_default.png` });

  // modal view (edit marker 1) with library
  await page.locator('.mundus-map-marker-pin').first().click();
  await sleep(700);
  await page.locator('button:has-text("Edit")').first().click();
  await sleep(900);
  await page.screenshot({ path: `${OUT}/2_marker_modal_with_library.png` });
  // close via the modal X (last header close button inside modal)
  await page.locator('div.fixed.inset-0.z-\\[9999\\]').last().locator('button:has(svg.lucide-x)').first().click().catch(() => {});
  await sleep(500);

  // icon style
  await page.locator('button:has(svg.lucide-settings)').first().click();
  await sleep(500);
  await page.locator('#toggle-map-icon-markers').click();
  await sleep(300);
  await page.screenshot({ path: `${OUT}/3_settings_toggle_on.png` });
  await page.locator('#btn-close-settings').click();
  await sleep(900);
  await page.screenshot({ path: `${OUT}/4_icon_style_live.png` });

  await browser.close();
  srv.close();
  console.log('screenshots saved to', OUT);
})();
