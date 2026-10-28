import type { NovelDocument } from '../types';
import { showExportToast, base64ToUtf8 } from './exportUtils';
import { extractPlainTextFromHtml } from './editorTextUtils';

export type SupportedImportFormat = 'mundus' | 'html' | 'pdf' | 'docx' | 'md';

export async function parseDocxFile(file: File): Promise<{ title: string; content: string; plainText: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value || '<p><br></p>';

  const div = document.createElement('div');
  div.innerHTML = html;
  const plainText = extractPlainTextFromHtml(html);

  const firstH = div.querySelector('h1, h2');
  const cleanTitle = firstH?.textContent?.trim() || file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

  return {
    title: cleanTitle,
    content: html,
    plainText,
  };
}

/* ------------------------------------------------------------------ */
/* Native Mundus payload helpers                                       */
/* ------------------------------------------------------------------ */

/**
 * Normalizes raw parsed Mundus data into a Partial<NovelDocument>.
 */
function normalizeMundusDocData(parsed: any, fallbackTitle: string): Partial<NovelDocument> {
  let docData: any = parsed;
  if (parsed && typeof parsed === 'object' && parsed.format === 'mundus_document' && parsed.document) {
    docData = parsed.document;
  }

  return {
    ...docData,
    title: docData?.title || fallbackTitle,
    folderId: undefined, // Always placed in loose files folder
  };
}

/** Marker prefix embedded into the PDF /Subject metadata by Mundus exports. */
const MUNDUS_PDF_MARKER = 'MUNDUS1:';

/**
 * Scans raw PDF bytes for the native Mundus payload embedded in the
 * /Subject metadata of PDFs exported by Mundus. Base64 payloads contain no
 * parentheses, so the string ends at the first ')'.
 */
function scanMundusPayloadFromBytes(bytes: Uint8Array): any | null {
  const marker = MUNDUS_PDF_MARKER;
  const markerLen = marker.length;
  const limit = bytes.length - markerLen;

  let i = 0;
  while (i < limit) {
    let j = 0;
    while (j < markerLen && bytes[i + j] === marker.charCodeAt(j)) j++;
    if (j === markerLen) {
      // Found marker start at i
      let end = i + markerLen;
      while (end < bytes.length && bytes[end] !== 0x29 /* ')' */) end++;
      try {
        let b64 = '';
        const chunk = 0x8000;
        for (let s = i + markerLen; s < end; s += chunk) {
          b64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(s, Math.min(s + chunk, end))) as unknown as number[]);
        }
        const json = base64ToUtf8(b64);
        const parsed = JSON.parse(json);
        if (parsed && (parsed.format === 'mundus_document' || parsed.document)) {
          return parsed;
        }
      } catch (e) {
        return null;
      }
      return null;
    }
    i += j + 1; // skip ahead past the first mismatching byte
  }
  return null;
}

export async function parseMundusFile(file: File): Promise<Partial<NovelDocument>> {
  const text = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    throw new Error('This file is not a valid Mundus document (.mundus / JSON).');
  }

  const fallbackTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  return normalizeMundusDocData(parsed, fallbackTitle);
}

/* ------------------------------------------------------------------ */
/* PDF import                                                          */
/* ------------------------------------------------------------------ */

let pdfWorkerReady = false;

async function ensurePdfWorker(pdfjsLib: any) {
  if (pdfWorkerReady && pdfjsLib.GlobalWorkerOptions.workerSrc) return;
  // Prefer the bundled same-origin worker (works inside sandboxed iframes);
  // fall back to the CDN copy if the bundled asset is unavailable.
  try {
    const mod: any = await import('pdfjs-dist/build/pdf.worker.min.js?url');
    if (mod?.default) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = mod.default;
    }
  } catch (e) {
    console.warn('Bundled pdf worker unavailable, falling back to CDN', e);
  }
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
  }
  pdfWorkerReady = true;
}

interface PdfImportRun {
  text: string;
  bold: boolean;
  italic: boolean;
  sizePx: number;
  color: string;
}

interface PdfImportItem {
  str: string;
  x: number;
  baselineTop: number; // px from top of page (CSS-like coordinates)
  width: number;
  sizePx: number;
  bold: boolean;
  italic: boolean;
}

interface PdfImportLine {
  top: number;
  left: number;
  right: number;
  sizePx: number;
  bold: boolean;
  italic: boolean;
  color: string;
  text: string;
}

interface PdfImportImage {
  top: number;
  left: number;
  width: number;
  height: number;
  dataUrl: string;
}

interface PdfPageStructure {
  width: number;
  height: number;
  lines: PdfImportLine[];
  images: PdfImportImage[];
}

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Luminance of an rgb triple (0-255 each). */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Samples the dominant text color inside a line's bounding box from the
 * rasterized page. Background (near-white) pixels are ignored; the darkest
 * color bucket with enough pixels wins (core glyph pixels beat the
 * anti-aliased halo that would otherwise wash the color out).
 */
function sampleTextColor(imageData: ImageData, x0: number, y0: number, x1: number, y1: number): string {
  const { width, height, data } = imageData;
  const sx0 = Math.max(0, Math.floor(x0));
  const sy0 = Math.max(0, Math.floor(y0));
  const sx1 = Math.min(width - 1, Math.ceil(x1));
  const sy1 = Math.min(height - 1, Math.ceil(y1));
  if (sx1 <= sx0 || sy1 <= sy0) return '#171717';

  const buckets = new Map<number, { count: number; r: number; g: number; b: number; lum: number }>();
  for (let y = sy0; y <= sy1; y++) {
    for (let x = sx0; x <= sx1; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = luminance(r, g, b);
      if (lum > 235) continue; // background
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, lum: 0 };
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.lum += lum;
      buckets.set(key, bucket);
    }
  }

  let best: { count: number; r: number; g: number; b: number; lum: number } | null = null;
  buckets.forEach((bucket) => {
    if (bucket.count < 3) return; // ignore stray artifact pixels
    if (!best) { best = bucket; return; }
    const winner = best as { count: number; r: number; g: number; b: number; lum: number };
    // Darkest average wins — glyph cores carry the true ink color
    if (bucket.lum / bucket.count < winner.lum / winner.count) best = bucket;
  });
  if (!best) return '#171717';
  const winner = best as { count: number; r: number; g: number; b: number; lum: number };
  const r = Math.round(winner.r / winner.count);
  const g = Math.round(winner.g / winner.count);
  const b = Math.round(winner.b / winner.count);
  return `rgb(${r}, ${g}, ${b})`;
}

/** True when a sampled color is just the default near-black ink. */
function isDefaultInkColor(color: string): boolean {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color || '');
  if (!m) return color === '#171717' || color === '#000000';
  const r = +m[1], g = +m[2], b = +m[3];
  return r < 40 && g < 40 && b < 40 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8;
}

function imageDataToDataUrl(img: { width: number; height: number; kind?: number; data?: Uint8ClampedArray | Uint8Array | null; bitmap?: ImageBitmap | null }): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (img.bitmap) {
      ctx.drawImage(img.bitmap, 0, 0);
      return canvas.toDataURL('image/png');
    }
    if (!img.data) return null;

    const out = ctx.createImageData(img.width, img.height);
    const dst = out.data;
    const src = img.data as Uint8Array;

    if (img.kind === 3) {
      // RGBA_32BPP
      dst.set(src.subarray(0, Math.min(src.length, dst.length)));
    } else if (img.kind === 2) {
      // RGB_24BPP
      let di = 0;
      for (let si = 0; si + 2 < src.length && di < dst.length; si += 3) {
        dst[di++] = src[si];
        dst[di++] = src[si + 1];
        dst[di++] = src[si + 2];
        dst[di++] = 255;
      }
    } else if (img.kind === 1) {
      // GRAYSCALE_1BPP (packed bits, row padded to byte)
      const rowLen = (img.width + 7) >> 3;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const byte = src[y * rowLen + (x >> 3)];
          const bit = (byte >> (7 - (x & 7))) & 1;
          const v = bit ? 255 : 0;
          const di = (y * img.width + x) * 4;
          dst[di] = v;
          dst[di + 1] = v;
          dst[di + 2] = v;
          dst[di + 3] = 255;
        }
      }
    } else {
      return null;
    }

    ctx.putImageData(out, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('Failed to decode embedded PDF image', e);
    return null;
  }
}

/** Matrix multiply for PDF transform matrices [a, b, c, d, e, f]. */
function mulMatrix(m: number[], n: number[]): number[] {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/**
 * Renders one PDF page into a structured representation: text lines with
 * typography (size, bold, italic, color) and embedded raster images with
 * their flow positions.
 */
async function parsePdfPageStructure(page: any, pdfjsLib: any): Promise<PdfPageStructure> {
  const viewport = page.getViewport({ scale: 1 });
  const W = viewport.width;
  const H = viewport.height;
  const OPS = pdfjsLib.OPS;

  // 1. Operator list — needed for embedded images and to warm the font/image objects
  const opList = await page.getOperatorList();

  // 2. Rasterize the page once at scale 2 for text color sampling
  const sampleScale = 2;
  const sampleViewport = page.getViewport({ scale: sampleScale });
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = Math.max(1, Math.floor(sampleViewport.width));
  sampleCanvas.height = Math.max(1, Math.floor(sampleViewport.height));
  let sampleData: ImageData | null = null;
  try {
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (sampleCtx) {
      const renderTask = page.render({ canvasContext: sampleCtx, viewport: sampleViewport, intent: 'display' });
      await renderTask.promise.catch(() => {});
      sampleData = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    }
  } catch (e) {
    sampleData = null;
  }

  // 3. Extract embedded raster images with their on-page positions
  const images: PdfImportImage[] = [];
  try {
    const pending: Array<{ objId?: string; inline?: any; ctm: number[] }> = [];
    let ctm: number[] = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      if (fn === OPS.save) {
        stack.push(ctm.slice());
      } else if (fn === OPS.restore) {
        ctm = stack.pop() || ctm;
      } else if (fn === OPS.transform) {
        ctm = mulMatrix(ctm, args as number[]);
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageXObjectRepeat) {
        pending.push({ objId: args[0] as string, ctm: ctm.slice() });
      } else if (fn === OPS.paintInlineImageXObject) {
        pending.push({ inline: args[0], ctm: ctm.slice() });
      }
    }

    const getContent = (objId?: string, inline?: any): any => {
      if (inline) return inline;
      if (!objId) return null;
      try {
        if (page.objs && page.objs.has && page.objs.has(objId)) {
          return page.objs.get(objId);
        }
        // pdf.js wraps image entries; direct get may throw when unresolved
        return page.objs?.get ? page.objs.get(objId) : null;
      } catch (e) {
        return null;
      }
    };

    for (const p of pending) {
      // Placement: transform the unit square corners into page space
      const [a, b, c, d, e, f] = p.ctm;
      const corners = [
        [0, 0], [1, 0], [0, 1], [1, 1],
      ].map(([u, v]) => [a * u + c * v + e, b * u + d * v + f]);
      const xs = corners.map((pt) => pt[0]);
      const ys = corners.map((pt) => pt[1]);
      const px = Math.min(...xs);
      const py = Math.min(...ys);
      const pw = Math.max(...xs) - px;
      const ph = Math.max(...ys) - py;
      if (pw < 10 || ph < 10) continue;

      const raw = getContent(p.objId, p.inline);
      if (!raw) continue;
      const width = raw.width || Math.round(pw);
      const height = raw.height || Math.round(ph);
      if (!width || !height) continue;

      let dataUrl: string | null = null;
      if (typeof ImageBitmap !== 'undefined' && raw.bitmap instanceof ImageBitmap) {
        dataUrl = imageDataToDataUrl({ width, height, bitmap: raw.bitmap });
      } else if (raw.data) {
        dataUrl = imageDataToDataUrl({ width, height, kind: raw.kind, data: raw.data });
      }
      if (!dataUrl) continue;

      images.push({
        top: Math.max(0, H - py - ph),
        left: Math.max(0, px),
        width: pw,
        height: ph,
        dataUrl,
      });
    }
  } catch (e) {
    console.warn('PDF image extraction failed on a page:', e);
  }

  // 4. Text content with typography
  const textContent = await page.getTextContent();
  const styles = textContent.styles || {};

  const fontFlagCache = new Map<string, { bold: boolean; italic: boolean }>();
  const getFontFlags = (fontName: string): { bold: boolean; italic: boolean } => {
    const cached = fontFlagCache.get(fontName);
    if (cached) return cached;
    let flags = { bold: false, italic: false };
    try {
      const fontObj = page.commonObjs?.get ? page.commonObjs.get(fontName) : null;
      const fontData = fontObj?.data ? fontObj.data : fontObj;
      if (fontData) {
        const nameStr = String(fontData.name || '');
        flags = {
          bold: Boolean(fontData.bold) || /bold|black|heavy|semib/i.test(nameStr),
          italic: Boolean(fontData.italic) || /italic|oblique/i.test(nameStr),
        };
      }
    } catch (e) {
      // Font object not resolvable — fall back to regular
    }
    fontFlagCache.set(fontName, flags);
    return flags;
  };

  const items: PdfImportItem[] = [];
  for (const item of textContent.items as any[]) {
    if (!('str' in item)) continue;
    const str: string = item.str || '';
    if (!str.trim()) continue;
    const tr = item.transform as number[];
    const sizePx = Math.hypot(tr[2], tr[3]) || (item.height as number) || 12;
    const flags = getFontFlags(item.fontName);
    items.push({
      str,
      x: tr[4],
      baselineTop: H - tr[5],
      width: item.width || 0,
      sizePx,
      bold: flags.bold,
      italic: flags.italic,
    });
  }

  // 5. Group items into visual lines (top-down, left-right)
  items.sort((p, q) => (p.baselineTop - q.baselineTop) || (p.x - q.x));
  const rawLines: PdfImportItem[][] = [];
  let currentLine: PdfImportItem[] = [];
  let currentTop = Number.NaN;
  for (const item of items) {
    if (!Number.isFinite(currentTop) || Math.abs(item.baselineTop - currentTop) <= Math.max(2.5, item.sizePx * 0.55)) {
      currentLine.push(item);
      currentTop = Number.isFinite(currentTop)
        ? (currentTop * (currentLine.length - 1) + item.baselineTop) / currentLine.length
        : item.baselineTop;
    } else {
      if (currentLine.length) rawLines.push(currentLine);
      currentLine = [item];
      currentTop = item.baselineTop;
    }
  }
  if (currentLine.length) rawLines.push(currentLine);

  const lines: PdfImportLine[] = rawLines.map((lineItems) => {
    lineItems.sort((p, q) => p.x - q.x);
    const runs: PdfImportRun[] = [];
    let prev: PdfImportItem | null = null;
    for (const item of lineItems) {
      if (prev) {
        const gap = item.x - (prev.x + prev.width);
        if (gap > Math.max(1, prev.sizePx * 0.18) && !/\s$/.test(prev.str) && !/^\s/.test(item.str)) {
          runs.push({ text: ' ', bold: false, italic: false, sizePx: item.sizePx, color: '#171717' });
        }
      }
      let color = '#171717';
      if (sampleData) {
        color = sampleTextColor(
          sampleData,
          item.x * sampleScale,
          (item.baselineTop - item.sizePx * 0.95) * sampleScale,
          (item.x + Math.max(item.width, item.str.length * item.sizePx * 0.25)) * sampleScale,
          (item.baselineTop + item.sizePx * 0.28) * sampleScale
        );
      }
      runs.push({ text: item.str, bold: item.bold, italic: item.italic, sizePx: item.sizePx, color });
      prev = item;
    }

    // Merge adjacent runs with identical styling
    const merged: PdfImportRun[] = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.bold === run.bold &&
        last.italic === run.italic &&
        Math.abs(last.sizePx - run.sizePx) < 0.4 &&
        last.color === run.color
      ) {
        last.text += run.text;
      } else {
        merged.push({ ...run });
      }
    }

    // Line-level dominant typography
    const charCount = (r: PdfImportRun) => r.text.trim().length || 1;
    let totalChars = 0, boldChars = 0, italicChars = 0;
    const sizeBuckets = new Map<number, number>();
    const colorBuckets = new Map<string, number>();
    merged.forEach((r) => {
      const c = charCount(r);
      totalChars += c;
      if (r.bold) boldChars += c;
      if (r.italic) italicChars += c;
      const sizeKey = Math.round(r.sizePx * 2) / 2;
      sizeBuckets.set(sizeKey, (sizeBuckets.get(sizeKey) || 0) + c);
      colorBuckets.set(r.color, (colorBuckets.get(r.color) || 0) + c);
    });
    let domSize = 12, domSizeCount = -1;
    sizeBuckets.forEach((count, size) => {
      if (count > domSizeCount) { domSize = size; domSizeCount = count; }
    });
    let domColor = '#171717', domColorCount = -1;
    colorBuckets.forEach((count, color) => {
      if (count > domColorCount) { domColor = color; domColorCount = count; }
    });

    const left = lineItems[0].x;
    const lastItem = lineItems[lineItems.length - 1];
    const right = lastItem.x + lastItem.width;

    return {
      top: lineItems[0].baselineTop,
      left,
      right,
      sizePx: domSize,
      bold: boldChars / Math.max(1, totalChars) > 0.6,
      italic: italicChars / Math.max(1, totalChars) > 0.6,
      color: domColor,
      text: merged.map((r) => r.text).join(''),
    } as PdfImportLine;
  });

  return {
    width: W,
    height: H,
    lines,
    images: images.sort((p, q) => p.top - q.top),
  };
}

/**
 * Turns a parsed page structure into flow HTML: paragraphs with inline
 * typography runs and figures for embedded images, ordered top-down.
 */
function pdfPageToHtml(page: PdfPageStructure, bodySizePx: number): string {
  type FlowNode = { top: number; html: string; kind: 'p' | 'img' };
  const nodes: FlowNode[] = [];

  const contentLeft = page.lines.length ? Math.min(...page.lines.map((l) => l.left)) : 0;
  const contentRight = page.lines.length ? Math.max(...page.lines.map((l) => l.right)) : page.width;
  const contentWidth = Math.max(40, contentRight - contentLeft);

  // Group lines into paragraphs
  type PendingPara = { lines: PdfImportLine[] };
  const paraGroups: PendingPara[] = [];
  let current: PendingPara | null = null;
  page.lines.forEach((line) => {
    const prev = current?.lines[current.lines.length - 1];
    const sizeJump = prev ? Math.abs(line.sizePx - prev.sizePx) / Math.max(prev.sizePx, 1) > 0.22 : false;
    const gapJump = prev ? line.top - prev.top > Math.max(line.sizePx, prev.sizePx) * 1.75 : false;
    if (!current || gapJump || sizeJump) {
      current = { lines: [line] };
      paraGroups.push(current);
    } else {
      current.lines.push(line);
    }
  });

  paraGroups.forEach((group) => {
    const lines = group.lines;
    const first = lines[0];
    const last = lines[lines.length - 1];

    // Paragraph-level dominant style
    const sizeBuckets = new Map<number, number>();
    const colorBuckets = new Map<string, number>();
    let boldChars = 0, italicChars = 0, totalChars = 0;
    lines.forEach((line) => {
      const key = Math.round(line.sizePx * 2) / 2;
      sizeBuckets.set(key, (sizeBuckets.get(key) || 0) + line.text.length);
      colorBuckets.set(line.color, (colorBuckets.get(line.color) || 0) + line.text.length);
      totalChars += line.text.length;
      if (line.bold) boldChars += line.text.length;
      if (line.italic) italicChars += line.text.length;
    });
    let paraSize = first.sizePx, sizeCount = -1;
    sizeBuckets.forEach((count, size) => { if (count > sizeCount) { paraSize = size; sizeCount = count; } });
    let paraColor = first.color, colorCount = -1;
    colorBuckets.forEach((count, color) => { if (count > colorCount) { paraColor = color; colorCount = count; } });
    const paraBold = boldChars / Math.max(1, totalChars) > 0.6;
    const paraItalic = italicChars / Math.max(1, totalChars) > 0.6;

    // Alignment detection
    const isHeadingSize = paraSize >= bodySizePx * 1.25;
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    const lineWidth = lastLine.right - lastLine.left;
    const lineCenter = (lastLine.left + lastLine.right) / 2;
    const pageCenter = page.width / 2;
    let textAlign = 'left';
    const shortLine = lineWidth < contentWidth * 0.85;
    if (shortLine && Math.abs(lineCenter - pageCenter) < page.width * 0.05) {
      textAlign = 'center';
    } else if (
      shortLine &&
      lines.length === 1 &&
      Math.abs(lastLine.right - contentRight) < 8 &&
      lastLine.left > contentLeft + 24
    ) {
      textAlign = 'right';
    }

    // Heading level by size
    let tag = 'p';
    if (paraSize >= bodySizePx * 1.7) tag = 'h1';
    else if (paraSize >= bodySizePx * 1.32) tag = 'h2';
    else if (paraSize >= bodySizePx * 1.14 && paraBold) tag = 'h3';

    // Build inline HTML with per-line runs when styling differs from paragraph style
    const inlineRuns: string[] = [];
    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) inlineRuns.push(' ');
      // Re-derive runs: we merged them per line, but for the paragraph HTML we
      // render the whole line with line-level styles relative to paragraph style
      const lineColor = line.color === paraColor || (isDefaultInkColor(line.color) && isDefaultInkColor(paraColor))
        ? ''
        : ` color: ${line.color};`;
      const relSize = line.sizePx !== paraSize ? ` font-size: ${line.sizePx.toFixed(1)}px;` : '';
      const styleBits = `${lineColor}${relSize}`;
      let text = escapeHtml(line.text);
      if (paraBold && !line.bold) text = `<span style="font-weight: normal;">${text}</span>`;
      if (!paraBold && line.bold) text = `<b>${text}</b>`;
      if (paraItalic && !line.italic) text = `<span style="font-style: normal;">${text}</span>`;
      if (!paraItalic && line.italic) text = `<i>${text}</i>`;
      inlineRuns.push(styleBits ? `<span style="${styleBits.trim()}">${text}</span>` : text);
    });

    const colorStyle = !isDefaultInkColor(paraColor) ? ` color: ${paraColor};` : '';
    const boldStyle = paraBold ? ' font-weight: 700;' : '';
    const italicStyle = paraItalic ? ' font-style: italic;' : '';
    const sizeStyle = tag === 'p' ? ` font-size: ${paraSize.toFixed(1)}px;` : '';
    const alignStyle = textAlign !== 'left' ? ` text-align: ${textAlign};` : '';
    const styleAttr = ` style="${`${colorStyle}${boldStyle}${italicStyle}${sizeStyle}${alignStyle}`.trim()}"`;

    nodes.push({
      top: first.top,
      kind: 'p',
      html: `<${tag}${styleAttr}>${inlineRuns.join('')}</${tag}>`,
    });
  });

  // Images → figures at their flow position (skip full-page background scans
  // when the page has real extractable text)
  const hasText = page.lines.length > 6;
  page.images.forEach((img) => {
    const isFullPage = img.width >= page.width * 0.95 && img.height >= page.height * 0.95;
    if (isFullPage && hasText) return;
    const imgWidthPct = Math.min(100, Math.round((img.width / page.width) * 100));
    nodes.push({
      top: img.top,
      kind: 'img',
      html: `<p style="text-align: center; margin: 1.4em 0;"><img src="${img.dataUrl}" alt="Imported illustration" style="max-width: ${imgWidthPct}%; height: auto; display: inline-block; border-radius: 4px;" /></p>`,
    });
  });

  nodes.sort((p, q) => p.top - q.top);
  return nodes.map((n) => n.html).join('');
}

/** The exact manual page-break markup used by the Writing Mode editor. */
function manualPageBreakHtml(): string {
  return `<div class="mundus-manual-page-break my-6 py-2 select-none flex items-center justify-center" data-manual-page-break="true" contenteditable="false"><div class="w-full flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity"><div class="flex-1 border-t border-dashed border-neutral-400 dark:border-neutral-600"></div><span class="text-[10px] font-mono uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-700">Page Break</span><div class="flex-1 border-t border-dashed border-neutral-400 dark:border-neutral-600"></div></div></div>`;
}

/**
 * Fallback for image-only PDFs (scans or image-based exports): each PDF page
 * is rasterized and inserted as a full-width image, one Mundus page per PDF
 * page, separated by manual page breaks.
 */
async function parsePdfAsImagePages(pdfDoc: any, pdfjsLib: any): Promise<{ content: string; plainText: string }> {
  const chunks: string[] = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    if (pageNum > 1) chunks.push(manualPageBreakHtml());
    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(1.2, 1100 / baseViewport.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await page.render({ canvasContext: ctx, viewport, intent: 'display' }).promise;
      chunks.push(`<p style="text-align: center; margin: 0;"><img src="${canvas.toDataURL('image/jpeg', 0.86)}" alt="PDF page ${pageNum}" style="max-width: 100%; height: auto; display: inline-block;" /></p>`);
    } catch (e) {
      console.warn(`Failed to rasterize PDF page ${pageNum}`, e);
    }
  }
  return { content: chunks.join('') || '<p><br></p>', plainText: '' };
}

export async function parsePdfFile(file: File): Promise<Partial<NovelDocument>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

  // 1. Native roundtrip: PDFs exported by Mundus embed the complete document
  //    in their metadata — restore it losslessly (pages, colors, images,
  //    captions, visual images, fonts).
  const nativePayload = scanMundusPayloadFromBytes(bytes);
  if (nativePayload) {
    const restored = normalizeMundusDocData(nativePayload, cleanTitle);
    if (restored.content) {
      showExportToast('Native Mundus PDF detected — restoring the full document', 'success');
      return {
        title: restored.title || cleanTitle,
        content: restored.content,
        plainText: restored.plainText || extractPlainTextFromHtml(restored.content),
        visualImages: restored.visualImages || [],
        fontFamily: restored.fontFamily,
        fontSize: restored.fontSize,
        category: restored.category,
        status: restored.status,
        timelineInfo: (restored as any).timelineInfo,
      };
    }
  }

  // 2. Structured import of third-party PDFs
  const pdfjsLib: any = await import('pdfjs-dist');
  await ensurePdfWorker(pdfjsLib);

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdfDoc = await loadingTask.promise;

  try {
    const pageStructures: PdfPageStructure[] = [];
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      showExportToast(`Analyzing PDF — page ${pageNum} of ${pdfDoc.numPages}...`, 'loading', 600000);
      const page = await pdfDoc.getPage(pageNum);
      pageStructures.push(await parsePdfPageStructure(page, pdfjsLib));
    }

    const totalText = pageStructures.reduce((acc, p) => acc + p.lines.reduce((a, l) => a + l.text.length, 0), 0);

    // Image-only PDF → rasterized pages fallback
    if (totalText < 8) {
      const fallback = await parsePdfAsImagePages(pdfDoc, pdfjsLib);
      return { title: cleanTitle, content: fallback.content, plainText: fallback.plainText };
    }

    // Body size = most common font size across the document
    const docSizeBuckets = new Map<number, number>();
    pageStructures.forEach((p) => p.lines.forEach((l) => {
      const key = Math.round(l.sizePx * 2) / 2;
      docSizeBuckets.set(key, (docSizeBuckets.get(key) || 0) + Math.max(1, l.text.length));
    }));
    let bodySizePx = 12, bodyCount = -1;
    docSizeBuckets.forEach((count, size) => {
      if (count > bodyCount) { bodySizePx = size; bodyCount = count; }
    });

    const chunks: string[] = [];
    pageStructures.forEach((page, idx) => {
      if (idx > 0) chunks.push(manualPageBreakHtml());
      chunks.push(pdfPageToHtml(page, bodySizePx));
    });

    const content = chunks.join('') || '<p><br></p>';
    const plainText = extractPlainTextFromHtml(content);

    return { title: cleanTitle, content, plainText };
  } finally {
    try {
      await pdfDoc.cleanup();
      await pdfDoc.destroy();
    } catch (e) {}
  }
}

export async function parseHtmlFile(file: File): Promise<{ title: string; content: string; plainText: string }> {
  const text = await file.text();
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(text, 'text/html');

  // Strip scripts and styles
  parsedDoc.querySelectorAll('script, style').forEach((el) => el.remove());

  // Remove any exported metadata header banners from previous exports
  parsedDoc.querySelectorAll('.doc-header, header.mundus-doc-header').forEach((el) => el.remove());

  const title =
    parsedDoc.querySelector('title')?.textContent?.trim()?.replace(/ - Mundus$/, '') ||
    parsedDoc.querySelector('h1')?.textContent?.trim() ||
    file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

  const contentEl =
    parsedDoc.querySelector('main, article, .mundus-doc-content, .doc-body, #mundus-pdf-render-box') || parsedDoc.body;
  const content = contentEl ? contentEl.innerHTML : `<p>${text}</p>`;
  const plainText = contentEl ? extractPlainTextFromHtml(contentEl) : '';

  return {
    title,
    content: content || '<p><br></p>',
    plainText,
  };
}

export async function parseMarkdownFile(file: File): Promise<{ title: string; content: string; plainText: string }> {
  const text = await file.text();
  const lines = text.split(/\r?\n/);

  let title = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  let startIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l) {
      if (l.startsWith('# ')) {
        title = l.replace(/^#\s+/, '').trim();
        startIdx = i + 1;
      }
      break;
    }
  }

  // Preserve all lines as separate paragraphs so custom formatting (like dashed divider lines)
  // retains its exact length and layout without collapsing or mangling
  const contentLines = lines.slice(startIdx);
  const html = contentLines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<p><br></p>';
      if (trimmed.startsWith('# ')) return `<h1>${trimmed.slice(2)}</h1>`;
      if (trimmed.startsWith('## ')) return `<h2>${trimmed.slice(3)}</h2>`;
      if (trimmed.startsWith('### ')) return `<h3>${trimmed.slice(4)}</h3>`;
      if (trimmed.startsWith('> ')) return `<blockquote>${trimmed.slice(2)}</blockquote>`;
      return `<p>${trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
    })
    .join('');

  return {
    title,
    content: html || '<p><br></p>',
    plainText: text,
  };
}

export async function importDocumentFromFile(
  file: File,
  format: SupportedImportFormat
): Promise<Partial<NovelDocument>> {
  showExportToast(`Importing "${file.name}" into Loose Files...`, 'loading');

  try {
    let result: Partial<NovelDocument>;

    if (format === 'mundus') {
      result = await parseMundusFile(file);
    } else if (format === 'html') {
      result = await parseHtmlFile(file);
    } else if (format === 'pdf') {
      result = await parsePdfFile(file);
    } else if (format === 'docx') {
      result = await parseDocxFile(file);
    } else {
      result = await parseMarkdownFile(file);
    }

    result.folderId = undefined; // Force into loose files folder
    showExportToast(`Imported "${result.title || file.name}" into Loose Files`, 'success');
    return result;
  } catch (err: any) {
    console.error('Import error:', err);
    showExportToast(`Failed to import file: ${err?.message || 'Error'}`, 'error');
    throw err;
  }
}
