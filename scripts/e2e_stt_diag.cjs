// STT DIAGNOSTIC E2E — v0.7.91-nightly "no text" bug investigation.
// Drives the REAL built app with a fake mic backed by a real speech WAV and
// instruments: AudioContext (requested vs actual rate, state), ScriptProcessor
// callbacks + RMS, Worker creation, network fetches (wasm/model), pill state,
// editor text growth. Answering: does audio flow? does the worker boot? does
// the model download? does any transcription chunk ever arrive?
// Run: node scripts/e2e_stt_diag.cjs
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = 4188;
const WAV = path.join(__dirname, 'assets', 'stt_speech.wav');
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${WAV}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 250)));
  page.on('console', (m) => {
    const t = m.text();
    if (/whistle|needle|cactus|wasm|worker|microphone|audio|stt/i.test(t)) console.log(`  [console.${m.type()}]`, t.slice(0, 240));
  });
  page.on('request', (r) => {
    const u = r.url();
    if (/needle|whistle|huggingface|hf-mirror|\.wasm/i.test(u)) console.log('  [net]', r.method(), u.slice(0, 140));
  });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (/needle|whistle|huggingface|hf-mirror|\.wasm/i.test(u)) console.log('  [net-FAIL]', r.method(), u.slice(0, 140), '—', r.failure()?.errorText);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (/needle|whistle|huggingface|\.wasm/i.test(u)) console.log('  [net-status]', r.status(), u.slice(0, 140));
  });

  // Instrument the page BEFORE app code runs.
  await page.addInitScript(() => {
    window.__sttDiag = { audioCallbacks: 0, samplesSeen: 0, maxRms: 0, ctxs: [], workers: [], gum: 0, chunkTexts: [] };
    const OrigAC = window.AudioContext;
    window.AudioContext = function (...args) {
      const opts = args[0] || {};
      const ctx = new OrigAC(...args);
      window.__sttDiag.ctxs.push({ requested: opts.sampleRate || null, actual: ctx.sampleRate, state: ctx.state });
      const origState = ctx.state;
      ctx.addEventListener?.('statechange', () => {
        window.__sttDiag.ctxs.push({ requested: opts.sampleRate || null, actual: ctx.sampleRate, state: ctx.state });
      });
      const origCSP = ctx.createScriptProcessor.bind(ctx);
      ctx.createScriptProcessor = function (...spArgs) {
        const node = origCSP(...spArgs);
        let handler = null;
        Object.defineProperty(node, 'onaudioprocess', {
          get: () => handler,
          set: (fn) => {
            handler = fn;
            if (!fn) return;
            node.addEventListener('audioprocess', (evt) => {
              const d = evt.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < d.length; i += 16) sum += d[i] * d[i];
              const rms = Math.sqrt(sum / Math.ceil(d.length / 16));
              window.__sttDiag.audioCallbacks++;
              window.__sttDiag.samplesSeen += d.length;
              if (rms > window.__sttDiag.maxRms) window.__sttDiag.maxRms = rms;
              if (handler) handler(evt); // original setter body
            });
          },
        });
        return node;
      };
      return ctx;
    };
    window.AudioContext.prototype = OrigAC.prototype;
    Object.setPrototypeOf(window.AudioContext, OrigAC);
    const origWorker = window.Worker;
    window.Worker = function (url, ...rest) {
      window.__sttDiag.workers.push(String(url));
      console.log('[diag] new Worker:', String(url));
      return new origWorker(url, ...rest);
    };
    window.Worker.prototype = origWorker.prototype;
    const origGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      window.__sttDiag.gum++;
      console.log('[diag] getUserMedia', JSON.stringify(c));
      return origGum(c);
    };
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await sleep(1500);

  // --- Boot flow: create world, reach editor (same as e2e_nightly) ---
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
  if (!editor) { console.log('FAIL could not reach editor'); process.exit(2); }
  console.log('  [boot] editor reachable');

  // Baseline text, caret at end.
  const baseline = await page.evaluate(() => document.querySelector('#novel-content-editable').innerText.length);
  console.log('  [boot] baseline editor length:', baseline);

  await page.evaluate(() => {
    const ed = document.querySelector('#novel-content-editable');
    ed.innerHTML = '<p> </p>';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
    ed.focus();
    const sel = window.getSelection();
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let last = null, n;
    while ((n = walker.nextNode())) last = n;
    if (last) {
      const r = document.createRange();
      r.setStart(last, last.nodeValue.length);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  });

  // --- Click mic, then observe for up to 150 s ---
  await page.click('#toolbar-stt-btn').catch(() => page.click('#btn-stt-mobile'));
  console.log('  [stt] mic clicked — observing…');
  let sawListening = false, textAppeared = false;
  const t0 = Date.now();
  for (let i = 0; i < 75; i++) {
    await sleep(2000);
    const snap = await page.evaluate(() => ({
      pill: document.querySelector('[data-mundus-stt-pill="true"]')?.innerText || null,
      textLen: document.querySelector('#novel-content-editable').innerText.length,
      text: document.querySelector('#novel-content-editable').innerText,
      diag: window.__sttDiag,
    }));
    const el = Math.round((Date.now() - t0) / 1000);
    const tail = (snap.text || '').trim().slice(-90).replace(/\n/g, ' ');
    if (snap.pill && /listening/i.test(snap.pill) && !sawListening) { sawListening = true; console.log(`  [stt] t=${el}s pill=LISTENING`); }
    if (snap.textLen > 3 && !textAppeared) {
      textAppeared = true;
      console.log(`  [stt] t=${el}s NEW TEXT APPEARED: "${tail}"`);
    }
    if (i % 5 === 0) {
      console.log(`  [t=${el}s] pill=${JSON.stringify(snap.pill)} textLen=${snap.textLen} audioCb=${snap.diag.audioCallbacks} samples=${snap.diag.samplesSeen} maxRms=${snap.diag.maxRms.toFixed(4)} workers=${JSON.stringify(snap.diag.workers)} ctxs=${JSON.stringify(snap.diag.ctxs)}`);
    }
    if (textAppeared && sawListening && el > 20) break; // enough evidence either way
    if (snap.pill && /error/i.test(snap.pill) && !/download/i.test(snap.pill)) {
      console.log(`  [stt] t=${el}s ERROR PILL: ${JSON.stringify(snap.pill)}`);
      break;
    }
  }

  const finalDiag = await page.evaluate(() => window.__sttDiag);
  const finalText = await page.evaluate(() => document.querySelector('#novel-content-editable').innerText);
  console.log('\n=== DIAG SUMMARY ===');
  console.log('listening reached:', sawListening, '| new text:', textAppeared);
  console.log('audio callbacks:', finalDiag.audioCallbacks, '| samples:', finalDiag.samplesSeen, '| maxRms:', finalDiag.maxRms.toFixed(5));
  console.log('contexts:', JSON.stringify(finalDiag.ctxs));
  console.log('workers:', JSON.stringify(finalDiag.workers));
  console.log('editor final text:', JSON.stringify(finalText.slice(0, 200)));

  await browser.close();
  srv.close();
  process.exit(textAppeared ? 0 : 1);
})().catch((e) => { console.error('diag crashed:', e); process.exit(2); });
