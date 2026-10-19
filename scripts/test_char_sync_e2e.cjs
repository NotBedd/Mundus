// E2E (v0.7.75): character sync regression tests.
// Focus: the exact user-reported failure class — characters disappearing.
// 1. Merged persistence keeps storage-only characters when a STALE TAB flushes
//    (the old code let a second tab's pagehide clobber erase new characters).
// 2. Deleting a character tombstones it; a stale stored roster cannot resurrect
//    it on reload.
// 3. A timestamp-less character (the cloud-invisibility class of data) still
//    loads and displays locally.
// Each test runs in its own browser context (isolated renderer processes);
// localStorage state is handed over via storageState. No Firebase in sandbox ->
// cloud paths skip gracefully; all assertions target the local sync layer,
// which mirrors the cloud merge logic.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');

const APP_URL = 'http://localhost:4199/';
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.error(`  FAIL ${name}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForServer(url, tries = 60) {
  return new Promise((resolve, reject) => {
    const ping = (n) => http.get(url, (res) => { res.resume(); resolve(); }).on('error', () => {
      if (n <= 0) return reject(new Error('server never came up'));
      setTimeout(() => ping(n - 1), 500);
    });
    ping(tries);
  });
}

async function evalRoster(page, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await page.evaluate(() => JSON.parse(localStorage.getItem('mundus_characters') || '[]'));
    } catch (e) {
      const msg = String(e && e.message || e);
      if (attempt === 3 || page.isClosed() || (!msg.includes('Execution context') && !msg.includes('Target closed'))) throw e;
      console.log(`  [warn] evaluate failed (${label}, attempt ${attempt}) — retrying`);
      await sleep(1200);
      if (!page.url().startsWith(APP_URL)) { await page.goto(APP_URL); await sleep(1500); }
    }
  }
}

(async () => {
  const server = spawn('npx', ['vite', 'preview', '--port', '4199', '--strictPort'], {
    cwd: '/home/z/my-project/mundus_app', stdio: 'ignore', detached: false,
  });
  let browser;
  try {
    await waitForServer(APP_URL);
    browser = await chromium.launch({ headless: true });

    // ================= Test 1: stale tab flush must not erase new characters =================
    console.log('\n[Test 1] stale-tab clobber protection');
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pageB = await context.newPage(); // boots FIRST with an empty roster (stale tab)
      await pageB.goto(APP_URL); await sleep(1500);
      const pageA = await context.newPage();
      await pageA.goto(APP_URL); await sleep(1200);

      // Create a world through the REAL UI
      await pageA.click('#btn-atlas-create-card'); await sleep(400);
      await pageA.fill('input[placeholder="e.g. Secunda, The Obsidian Realm, Novaris"]', 'Sync World');
      await pageA.getByRole('button', { name: 'create new Mundus' }).click(); await sleep(1200);
      const worldId = await pageA.evaluate(() => JSON.parse(localStorage.getItem('mundus_projects'))[0].id);
      await pageA.click(`#mundus-card-${worldId}`); await sleep(1200);

      // Create a character through the real UI ("New Character" creates instantly)
      await pageA.click('#nav-item-characters'); await sleep(600);
      await pageA.click('#btn-create-new-character'); await sleep(1200); // includes 350ms debounce
      let roster = await evalRoster(pageA, 'after-create');
      check('created character persisted to localStorage', roster.some((c) => c.name === 'New Character' && c.mundusId === worldId));

      // Close the STALE tab -> its pagehide flush used to overwrite the roster
      await pageB.close(); await sleep(700);
      roster = await evalRoster(pageA, 'after-stale-close');
      check('stale tab pagehide did NOT erase the new character (merge persistence)', roster.some((c) => c.name === 'New Character'));

      // hand storage over to the next context
      const state = await context.storageState();
      await context.close();

      // ================= Test 2: delete -> tombstone -> no resurrection =================
      console.log('\n[Test 2] delete tombstone prevents resurrection');
      const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
      const p2 = await ctx2.newPage();
      await p2.goto(APP_URL); await sleep(1500);
      // app boots to the Atlas — open the world first
      const wid2 = await p2.evaluate(() => JSON.parse(localStorage.getItem('mundus_projects'))[0].id);
      await p2.click(`#mundus-card-${wid2}`); await sleep(1300);
      await p2.click('#nav-item-characters'); await sleep(600);
      // open the character detail via its card (id is deterministic: char-<ts>)
      const charId = await p2.evaluate(() => JSON.parse(localStorage.getItem('mundus_characters'))[0].id);
      await p2.click(`#character-card-${charId}`); await sleep(900);
      await p2.click('#btn-delete-character'); await sleep(400);
      await p2.getByRole('button', { name: 'Delete?' }).click(); await sleep(1000);
      roster = await evalRoster(p2, 'after-delete');
      check('deleted character removed from localStorage roster', !roster.some((c) => c.id === charId));
      const tombs = await p2.evaluate(() => JSON.parse(localStorage.getItem('mundus_deleted_char_ids') || '[]'));
      check('deletion tombstone recorded', tombs.length > 0);

      // Simulate a stale other-tab roster that still contains the deleted character
      await p2.evaluate(() => {
        const raw = localStorage.getItem('mundus_characters') || '[]';
        const list = JSON.parse(raw);
        list.push({
          id: 'char-e2e-ghost', userId: 'author', mundusId: 'mundus-x', name: 'Erandil Ghost',
          aliases: '', sex: 'Male', status: 'alive', roles: ['Supporting'], factions: [], families: [],
          tags: [], birthTime: '', birthPlace: '', deathTime: '', deathPlace: '',
          appearance: '', overview: '', notes: '', avatarColor: '#8b5cf6',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        localStorage.setItem('mundus_characters', JSON.stringify(list));
      });
      await p2.reload(); await sleep(1600);
      roster = await evalRoster(p2, 'after-ghost-reload');
      // The tombstoned id must never come back; the unrelated ghost (never deleted)
      // legitimately survives — it belongs to another tab's roster.
      check('tombstoned deleted character NOT resurrected after reload', !roster.some((c) => c.id === charId));
      check('unrelated other-tab character kept by merge', roster.some((c) => c.id === 'char-e2e-ghost'));
      const ghostDeletedVisible = await p2.evaluate((cid) => document.body.innerText.includes(JSON.parse(localStorage.getItem('mundus_characters')).find((c) => c.id === cid)?.name || '___none___'), charId);
      check('deleted character not visible in UI after reload', !ghostDeletedVisible);

      const state2 = await ctx2.storageState();
      await ctx2.close();

      // ================= Test 3: timestamp-less character still loads =================
      console.log('\n[Test 3] timestamp-less character loads locally');
      const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state2 });
      const p3 = await ctx3.newPage();
      // inject a timestamp-less character (the cloud-invisibility data class) into the CURRENT world
      await p3.goto(APP_URL); await sleep(1200);
      const wid3 = await p3.evaluate(() => JSON.parse(localStorage.getItem('mundus_projects'))[0].id);
      await p3.evaluate((wid) => {
        const raw = localStorage.getItem('mundus_characters') || '[]';
        const list = JSON.parse(raw);
        list.push({
          id: 'char-e2e-oldtimer', userId: 'author', mundusId: wid, name: 'Old Timer',
          aliases: '', sex: 'Female', status: 'alive', roles: [], factions: [], families: [],
          tags: [], birthTime: '', birthPlace: '', deathTime: '', deathPlace: '',
          appearance: '', overview: 'Born before timestamps existed.', notes: '', avatarColor: '#8b5cf6',
        });
        localStorage.setItem('mundus_characters', JSON.stringify(list));
      }, wid3);
      await p3.reload(); await sleep(1600);
      // open the world so characters render
      await p3.click(`#mundus-card-${wid3}`); await sleep(1300);
      await p3.click('#nav-item-characters'); await sleep(600);
      const oldTimerVisible = await p3.evaluate(() => document.body.innerText.includes('Old Timer'));
      check('character without timestamps loads and displays', oldTimerVisible);
      await sleep(800); // let the persist effect run
      roster = await evalRoster(p3, 'oldtimer-persist');
      check('timestamp-less character survives merged persistence', roster.some((c) => c.id === 'char-e2e-oldtimer'));
      await ctx3.close();
    }

    await browser.close();
  } catch (e) {
    failed++;
    console.error('E2E ERROR:', e);
  } finally {
    try { if (browser) await browser.close(); } catch {}
    try { server.kill(); } catch {}
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
