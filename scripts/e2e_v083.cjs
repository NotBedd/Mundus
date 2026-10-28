// v0.8.3 E2E — drives the REAL built app (dist/):
//  A) Book-order reorder mode in Mundus View (arrows, persistence, loose toggle)
//  B) Export Book dialog (folder/doc toggles) + EPUB / DOCX / PDF generation & validation
//  C) Android Atlas scroll fix (header pinned, content scrolls internally)
// Run: node scripts/e2e_v083.cjs   (needs `npm run build` first)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = 4183;
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

/* ---------- XML well-formedness checker (for EPUB internals) ---------- */
/* Every tag we generate comes from XMLSerializer or is hand-written XML with
   explicit close/self-close — so ALL open tags push, no HTML void set. */
function assertWellFormedXml(name, xml) {
  const stack = [];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    if (xml.startsWith('<!--', i)) { const e = xml.indexOf('-->', i); if (e === -1) throw new Error(`${name}: unterminated comment`); i = e + 3; continue; }
    if (xml.startsWith('<![CDATA[', i)) { const e = xml.indexOf(']]>', i); if (e === -1) throw new Error(`${name}: unterminated CDATA`); i = e + 3; continue; }
    if (xml.startsWith('<?', i)) { const e = xml.indexOf('?>', i); if (e === -1) throw new Error(`${name}: unterminated processing instruction`); i = e + 2; continue; }
    if (xml.startsWith('<!', i)) { const e = xml.indexOf('>', i); if (e === -1) throw new Error(`${name}: unterminated declaration`); i = e + 1; continue; }
    if (xml[i] === '<') {
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9:_.-]*)([^>]*?)(\/?)>/.exec(xml.slice(i));
      if (!m) throw new Error(`${name}: malformed tag at ${i}: ${xml.slice(i, i + 50)}`);
      const [, close, tag, attrs, selfClose] = m;
      if (!close) {
        const attrStr = attrs.replace(/\s+/g, ' ').trim();
        if (attrStr) {
          let rest = attrStr;
          const attrRe = /^([a-zA-Z_:][a-zA-Z0-9:_.-]*)="[^"]*"(?: |$)/;
          while (rest.length) {
            const am = attrRe.exec(rest);
            if (!am) throw new Error(`${name}: bad attribute near "${rest.slice(0, 50)}" in <${tag}>`);
            rest = rest.slice(am[0].length);
          }
        }
        if (!selfClose) stack.push(tag);
      } else {
        const top = stack.pop();
        if (top !== tag) throw new Error(`${name}: mismatched </${tag}>, expected </${top}>`);
      }
      i += m[0].length;
    } else if (xml[i] === '&') {
      const m = /^&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/.exec(xml.slice(i));
      if (!m) throw new Error(`${name}: unescaped & at ${i}`);
      i += m[0].length;
    } else {
      i++;
    }
  }
  if (stack.length) throw new Error(`${name}: unclosed tags: ${stack.join(',')}`);
}

/* ---------- seed helpers ---------- */
const PID = 'mundus-e2e-1';
const iso = (d) => new Date(2026, 0, d).toISOString();
function seedData({ extraProjects = 0 } = {}) {
  const docs = [
    { id: 'doc-e2e-loose-2', folderId: undefined, title: 'Loose Note B', day: 6 },
    { id: 'doc-e2e-f1-2', folderId: 'folder-e2e-1', title: 'Chapter Two', day: 2 },
    { id: 'doc-e2e-f2-1', folderId: 'folder-e2e-2', title: 'Epilogue Draft', day: 3 },
    { id: 'doc-e2e-f1-1', folderId: 'folder-e2e-1', title: 'Chapter One', day: 1 },
    { id: 'doc-e2e-loose-1', folderId: undefined, title: 'Loose Note A', day: 5 },
  ].map((d) => ({
    id: d.id, userId: 'author', mundusId: PID, folderId: d.folderId, title: d.title,
    content: `<p>Content of ${d.title}.</p>`, plainText: `Content of ${d.title}.`,
    wordCount: 4, characterCount: 20, readingTimeMinutes: 1, status: 'draft', category: 'Manuscript',
    isFavorite: false, fontFamily: 'serif', fontSize: 16,
    createdAt: iso(d.day), updatedAt: iso(d.day),
  }));
  const folders = [
    { id: 'folder-e2e-1', userId: 'author', mundusId: PID, name: 'Alpha Folder', orderIndex: 0, createdAt: iso(1), updatedAt: iso(1) },
    { id: 'folder-e2e-2', userId: 'author', mundusId: PID, name: 'Beta Folder', orderIndex: 1, createdAt: iso(2), updatedAt: iso(2) },
  ];
  const projects = [
    { id: PID, userId: 'author', name: 'E2E World', genre: 'Fantasy', description: 'A test world for the export pipeline.', pageFormat: 'trade_paperback', createdAt: iso(1), updatedAt: iso(1) },
  ];
  for (let i = 0; i < extraProjects; i++) {
    projects.push({ id: `mundus-pad-${i}`, userId: 'author', name: `Padding World ${i}`, description: 'Filling the Atlas grid so the page must scroll on a phone-sized viewport. '.repeat(6), createdAt: iso(3 + i), updatedAt: iso(3 + i) });
  }
  return { projects, folders, documents: docs };
}

async function seedPage(page, data) {
  // Seed BEFORE any app script runs, ONCE (flag-guarded): the app's own
  // beforeunload persistence would clobber a plain evaluate+reload seeding,
  // and re-seeding on every navigation would erase reordered state.
  await page.addInitScript((d) => {
    if (localStorage.getItem('mundus_e2e_seeded') === '1') return;
    localStorage.setItem('mundus_e2e_seeded', '1');
    localStorage.setItem('mundus_projects', JSON.stringify(d.projects));
    localStorage.setItem('mundus_folders', JSON.stringify(d.folders));
    localStorage.setItem('mundus_documents', JSON.stringify(d.documents));
    localStorage.setItem('mundus_active_id', d.projects[0].id);
  }, data);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await sleep(1200);
}

async function openMundusView(page) {
  await page.click('#btn-open-start-menu');
  await sleep(700);
  await page.waitForSelector('#start-menu-overlay', { state: 'visible' });
}

async function saveDownload(page, dir, name) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120000 }),
    page.click('#btn-bookexport-run'),
  ]);
  const out = path.join(dir, name);
  await download.saveAs(out);
  return out;
}

(async () => {
  const srv = await serve();
  const tmp = fs.mkdtempSync('/tmp/mundus_v083_');
  const browser = await chromium.launch();

  /* ============ A + B: desktop flows ============ */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
    await seedPage(page, seedData());

    // Enter the world, then open Mundus View
    await page.click(`#mundus-card-${PID}`);
    await sleep(1200);
    await openMundusView(page);

    // --- A1: default order (no manual reorder yet) ---
    const collectSectionHeads = () => page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('#start-menu-overlay h2'));
      return heads.map((h) => h.textContent.trim()).filter((t) => t && t !== 'Mundus View' && t !== 'Unfiled / Loose Notes');
    });
    const order0 = await collectSectionHeads();
    check('default folder order = creation order', JSON.stringify(order0) === JSON.stringify(['Alpha Folder', 'Beta Folder']), JSON.stringify(order0));
    const f1Docs0 = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#start-menu-overlay [data-startmenu-doc-id]'));
      return rows.map((r) => r.getAttribute('data-startmenu-doc-id'));
    });
    check('default doc order = array order (loose last, newest-first loose)', JSON.stringify(f1Docs0) === JSON.stringify(['doc-e2e-f1-2', 'doc-e2e-f1-1', 'doc-e2e-f2-1', 'doc-e2e-loose-2', 'doc-e2e-loose-1']), JSON.stringify(f1Docs0));

    // --- A2: reorder mode ---
    await page.click('#btn-start-reorder');
    await sleep(400);
    check('reorder banner appears', !!(await page.$('#reorder-banner')));
    check('search bar hidden in reorder mode', !(await page.isVisible('#start-menu-overlay input[placeholder="Search titles or text..."]')));

    // Move "Chapter Two" (first in Alpha) DOWN
    const moveBtn = await page.$('[data-startmenu-doc-id="doc-e2e-f1-2"] button[title="Move down in book order"]');
    check('doc has move-down arrow in reorder mode', !!moveBtn);
    await moveBtn.click();
    await sleep(500);
    const f1Docs1 = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#start-menu-overlay [data-startmenu-doc-id]'));
      return rows.map((r) => r.getAttribute('data-startmenu-doc-id'));
    });
    check('doc move down swaps Chapter Two/Chapter One', JSON.stringify(f1Docs1.slice(0, 2)) === JSON.stringify(['doc-e2e-f1-1', 'doc-e2e-f1-2']), JSON.stringify(f1Docs1.slice(0, 2)));

    // Move Beta Folder UP
    const folderUpBtn = await page.$('#start-menu-overlay button[title="Move folder up in book order"]:not([disabled])');
    const folderUpButtons = await page.$$('#start-menu-overlay button[title="Move folder up in book order"]');
    check('two folder up-arrows rendered', folderUpButtons.length === 2);
    await folderUpButtons[1].click(); // Beta Folder (second) → up
    await sleep(500);
    const order1 = await collectSectionHeads();
    check('folder move up swaps Alpha/Beta', JSON.stringify(order1) === JSON.stringify(['Beta Folder', 'Alpha Folder']), JSON.stringify(order1));

    // Loose position toggle → Top
    await page.click('#btn-loose-position-top');
    await sleep(500);
    const order2 = await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('#start-menu-overlay h2'));
      return heads.map((h) => h.textContent.trim()).filter((t) => t && t !== 'Mundus View');
    });
    check('loose files toggle moves loose block to top', JSON.stringify(order2) === JSON.stringify(['Unfiled / Loose Notes', 'Beta Folder', 'Alpha Folder']), JSON.stringify(order2));
    await page.click('#btn-loose-position-bottom');
    await sleep(400);

    // --- A3: persistence ---
    await page.click('#btn-reorder-done');
    await sleep(1600); // documents localStorage save is debounced ~1s
    const stored = await page.evaluate(() => ({
      docs: JSON.parse(localStorage.getItem('mundus_documents') || '[]').filter((d) => d.mundusId === 'mundus-e2e-1').map((d) => ({ id: d.id, i: d.bookOrderIndex })),
      folders: JSON.parse(localStorage.getItem('mundus_folders') || '[]').map((f) => ({ id: f.id, i: f.orderIndex })),
      pos: JSON.parse(localStorage.getItem('mundus_projects') || '[]').find((p) => p.id === 'mundus-e2e-1')?.looseDocsPosition,
    }));
    const f1a = stored.docs.find((d) => d.id === 'doc-e2e-f1-1');
    const f1b = stored.docs.find((d) => d.id === 'doc-e2e-f1-2');
    const f2 = stored.docs.find((d) => d.id === 'doc-e2e-f2-1');
    check('bookOrderIndex persisted to localStorage', f1a?.i === 0 && f1b?.i === 1, JSON.stringify(stored.docs));
    check('untouched scope stays unindexed (resolves by array order)', f2?.i === undefined, `f2 index = ${f2?.i}`);
    check('folder orderIndex persisted (Beta now first)', stored.folders.find((f) => f.id === 'folder-e2e-2')?.i === 0, JSON.stringify(stored.folders));
    check('looseDocsPosition back to bottom', stored.pos !== 'top');

    // Reload → display order persists
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(1200);
    await page.click(`#mundus-card-${PID}`);
    await sleep(1000);
    await openMundusView(page);
    const order3 = await collectSectionHeads();
    check('reordered folders persist after reload', JSON.stringify(order3) === JSON.stringify(['Beta Folder', 'Alpha Folder']), JSON.stringify(order3));
    const f1Docs2 = await page.evaluate(() => {
      const alphaHead = Array.from(document.querySelectorAll('#start-menu-overlay h2')).find((h) => h.textContent.trim() === 'Alpha Folder');
      const card = alphaHead?.closest('div.rounded-xl');
      const rows = card ? Array.from(card.querySelectorAll('[data-startmenu-doc-id]')) : [];
      return rows.map((r) => r.getAttribute('data-startmenu-doc-id'));
    });
    check('reordered docs persist after reload', JSON.stringify(f1Docs2) === JSON.stringify(['doc-e2e-f1-1', 'doc-e2e-f1-2']), JSON.stringify(f1Docs2));

    // --- B: Export Book dialog ---
    await page.click('#btn-start-export-book');
    await sleep(600);
    await page.waitForSelector('#btn-bookexport-run', { state: 'visible' });
    check('export dialog opens', true);

    const chapterRows = await page.$$eval('[data-bookexport-doc-id]', (els) => els.map((e) => e.getAttribute('data-bookexport-doc-id')));
    check('dialog lists all 5 docs in book order', JSON.stringify(chapterRows) === JSON.stringify(['doc-e2e-f2-1', 'doc-e2e-f1-1', 'doc-e2e-f1-2', 'doc-e2e-loose-2', 'doc-e2e-loose-1']), JSON.stringify(chapterRows));

    // Folder group toggle: uncheck Beta folder → its doc excluded
    await page.click('[data-testid="bookexport-group-folder-e2e-2"]');
    await sleep(300);
    let includedNow = await page.$$eval('[data-bookexport-doc-id]', (els) => els.filter((e) => e.querySelector('input:checked')).length);
    check('folder toggle excludes its documents', includedNow === 4);
    const betaDocChecked = await page.$eval('[data-testid="bookexport-doc-doc-e2e-f2-1"]', (el) => el.checked);
    check('Beta folder doc unchecked by group toggle', betaDocChecked === false);
    await page.click('[data-testid="bookexport-group-folder-e2e-2"]'); // back on
    await sleep(300);
    includedNow = await page.$$eval('[data-bookexport-doc-id]', (els) => els.filter((e) => e.querySelector('input:checked')).length);
    check('folder toggle re-includes its documents', includedNow === 5);

    // Option toggles exist
    check('title page toggle present', !!(await page.$('[data-testid="bookexport-opt-titlepage"]')));
    check('toc toggle present', !!(await page.$('[data-testid="bookexport-opt-toc"]')));
    check('headings toggle present', !!(await page.$('[data-testid="bookexport-opt-headings"]')));
    await page.fill('#input-bookexport-title', 'The E2E Book');
    await page.fill('#input-bookexport-author', 'Test Author');

    // --- B1: EPUB ---
    await page.click('#btn-bookexport-format-epub');
    await sleep(200);
    const epubPath = await saveDownload(page, tmp, 'book.epub');
    const epubBytes = fs.readFileSync(epubPath);
    check('epub downloads non-empty', epubBytes.length > 1000, `${epubBytes.length} bytes`);
    const epub = await JSZip.loadAsync(epubBytes);
    const epubNames = Object.keys(epub.files);
    check('epub mimetype first entry', epubNames[0] === 'mimetype');
    // EPUB spec: the mimetype entry must be STORED (compression method 0).
    // Read the raw local file header: sig(4) + version(2) + flags(2) + method(2).
    const rawFirst = epubBytes.slice(0, 30);
    check('epub first entry is a local file header', rawFirst.slice(0, 4).toString('latin1') === 'PK\x03\x04');
    check('epub mimetype STORED (method 0)', rawFirst[8] === 0 && rawFirst[9] === 0, `method=${rawFirst[8] | (rawFirst[9] << 8)}`);
    check('epub mimetype content', (await epub.file('mimetype').async('string')) === 'application/epub+zip');
    check('epub container.xml present', !!epub.file('META-INF/container.xml'));
    for (const xhtml of epubNames.filter((n) => n.endsWith('.xhtml'))) {
      const content = await epub.file(xhtml).async('string');
      try {
        assertWellFormedXml(xhtml, content);
        if (xhtml === epubNames.filter((n) => n.endsWith('.xhtml'))[0]) check('xhtml well-formed (first)', true);
      } catch (e) {
        check(`xhtml well-formed (${xhtml})`, false, String(e.message));
      }
    }
    for (const xmlName of ['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/toc.ncx']) {
      const content = await epub.file(xmlName).async('string');
      try { assertWellFormedXml(xmlName, content); check(`${xmlName} well-formed`, true); }
      catch (e) { check(`${xmlName} well-formed`, false, String(e.message)); }
    }
    const opf = await epub.file('OEBPS/content.opf').async('string');
    check('opf has 5 chapter items', (opf.match(/chapter-\d+\.xhtml/g) || []).length === 5);
    check('opf has dc:title The E2E Book', opf.includes('<dc:title>The E2E Book</dc:title>'));
    check('opf has dc:creator Test Author', opf.includes('<dc:creator>Test Author</dc:creator>'));
    check('spine has 5 itemrefs + titlepage', (opf.match(/<itemref/g) || []).length === 6);
    const nav = await epub.file('OEBPS/nav.xhtml').async('string');
    check('nav links all chapters', (nav.match(/href="chapter-/g) || []).length === 5);
    const ch1 = await epub.file('OEBPS/chapter-2.xhtml').async('string');
    check('chapter heading from doc title present', ch1.includes('Chapter One'));
    check('chapter content present', ch1.includes('Content of Chapter One.'));

    // --- B2: DOCX ---
    await page.click('#btn-bookexport-format-docx');
    await sleep(200);
    const docxPath = await saveDownload(page, tmp, 'book.docx');
    const docxBytes = fs.readFileSync(docxPath);
    check('docx downloads non-empty', docxBytes.length > 5000, `${docxBytes.length} bytes`);
    const docx = await JSZip.loadAsync(docxBytes);
    check('docx has word/document.xml', !!docx.file('word/document.xml'));
    const docXml = await docx.file('word/document.xml').async('string');
    check('docx contains all 5 chapter titles', ['Chapter One', 'Chapter Two', 'Epilogue Draft', 'Loose Note A', 'Loose Note B'].every((t) => docXml.includes(t)));
    check('docx contains book title page', docXml.includes('The E2E Book'));
    check('docx has page breaks between chapters', (docXml.match(/w:br w:type="page"/g) || []).length >= 5);

    // --- B3: PDF ---
    await page.click('#btn-bookexport-format-pdf');
    await sleep(200);
    const pdfPath = await saveDownload(page, tmp, 'book.pdf');
    const pdfBytes = fs.readFileSync(pdfPath);
    check('pdf downloads with %PDF header', pdfBytes.slice(0, 5).toString('latin1') === '%PDF-', pdfBytes.slice(0, 8).toString('latin1'));
    check('pdf reasonably sized', pdfBytes.length > 20000, `${pdfBytes.length} bytes`);

    check('no page errors during desktop flows', pageErrors.length === 0, pageErrors.join(' | '));
    await page.close();
  }

  /* ============ C: Android Atlas scroll fix ============ */
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await seedPage(page, seedData({ extraProjects: 8 }));

    // Simulate the native status-bar inset that MainActivity publishes
    await page.evaluate(() => document.documentElement.style.setProperty('--mundus-safe-top', '30px'));
    await sleep(400);

    const headerInfo = await page.evaluate(() => {
      const shell = document.querySelector('.mundus-atlas-shell');
      const header = shell.querySelector('header');
      return {
        headerTop: header.getBoundingClientRect().top,
        docScrollY: window.scrollY,
        shellOverflow: getComputedStyle(shell).overflowY,
        shellHeight: shell.getBoundingClientRect().height,
      };
    });
    check('atlas header sits below status bar (30px)', Math.abs(headerInfo.headerTop - 30) < 1.5, `top=${headerInfo.headerTop}`);
    check('document does not scroll on atlas', headerInfo.docScrollY === 0);
    check('atlas shell is not the scroller (overflow hidden)', headerInfo.shellOverflow === 'hidden', headerInfo.shellOverflow);
    check('atlas shell fills viewport exactly', Math.abs(headerInfo.shellHeight - 844) < 2, `${headerInfo.shellHeight}`);

    // Scroll the content wrapper down; header must stay pinned at 30px
    await page.evaluate(() => {
      const shell = document.querySelector('.mundus-atlas-shell');
      const scroller = shell.querySelector('div.flex-1');
      scroller.scrollTop = 600;
    });
    await sleep(400);
    const afterScroll = await page.evaluate(() => {
      const shell = document.querySelector('.mundus-atlas-shell');
      const header = shell.querySelector('header');
      const scroller = shell.querySelector('div.flex-1');
      return {
        headerTop: header.getBoundingClientRect().top,
        scrollerTop: scroller.scrollTop,
        docScrollY: window.scrollY,
      };
    });
    check('content area scrolls internally', afterScroll.scrollerTop === 600, `${afterScroll.scrollerTop}`);
    check('header stays pinned while content scrolls', Math.abs(afterScroll.headerTop - 30) < 1.5, `top=${afterScroll.headerTop}`);
    check('document still does not scroll', afterScroll.docScrollY === 0);

    // Reorder/export buttons must NOT exist on atlas (atlas-only fix sanity)
    check('atlas has no start-menu overlay', !(await page.$('#start-menu-overlay')));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(`\n=== v0.8.3 e2e: ${passed} passed, ${failed} failed ===`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed > 0 ? 2 : 0);
})().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(3);
});
