import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, PageBreak } from 'docx';
import type { MundusProject, NovelDocument } from '../types';
import {
  buildPaperClone,
  appendPaperCloneToPdf,
  buildPrintableHtmlShell,
  buildMundusDocxStyles,
  buildMundusDocxSectionProperties,
  buildDocxPageParagraphs,
  cleanDocumentHtmlForPrint,
  showExportToast,
  showPdfReadyToast,
} from './exportUtils';
import { getPageFormatConfig } from './pageFormats';
// v0.8.61: unified file delivery — Android WebView ignores anchor downloads
// of blob: URLs, so book exports save natively (Downloads folder) there.
import { downloadBlob, canUseNativeSave } from './download';

/* ==================================================================
   v0.8.3 — Export Book: chain many documents (in Mundus View book
   order) into ONE PDF / DOCX / EPUB file.

   Design notes:
   - PDF reuses the exact per-document paper pipeline (buildPaperClone +
     the same pagination engine as Writing Mode), appending every
     chapter's pages into a single jsPDF. Electron uses the native
     printToPDF path with one combined printable HTML.
   - DOCX reuses the v0.8.1 HTML→Word converter (htmlToDocxParagraphs)
     per chapter, with a page break between chapters.
   - EPUB is assembled as EPUB 3 (with an EPUB 2 toc.ncx for older
     readers): reflowable XHTML chapters, embedded data-URL images,
     title page + chapter list when enabled.
   - Book PDFs intentionally do NOT embed the per-document MUNDUS1
     re-import payload (that mechanism is single-document only); books
     are for reading/sharing.
   ================================================================== */

export type BookExportFormat = 'pdf' | 'docx' | 'epub';

export interface BookExportOptions {
  format: BookExportFormat;
  bookTitle: string;
  authorName?: string;
  includeTitlePage: boolean;
  includeChapterHeadings: boolean;
  includeToc: boolean;
  pageFormat?: string | null;
}

const sanitizeFilename = (name: string, ext: string): string => {
  const safe = (name || 'book').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'book';
  return `${safe}.${ext}`;
};

const escapeHtml = (str: string): string =>
  (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const xmlEscape = escapeHtml;

/** Trigger a download for a generated blob — v0.8.61: shared native-aware helper. */
function deliverBlob(blob: Blob, filename: string, mime?: string): void {
  void downloadBlob(blob, filename, mime);
}

/* ------------------------------------------------------------------ */
/* Title page / chapter-list content builders                          */
/* ------------------------------------------------------------------ */

function buildTitlePageHtml(bookTitle: string, authorName?: string): string {
  const titleHtml = escapeHtml(bookTitle || 'Untitled Book');
  const authorHtml = authorName?.trim()
    ? `<div style="margin-top: 1.6em; font-size: 13pt; color: #333;">${escapeHtml(authorName.trim())}</div>`
    : '';
  return `
<div style="text-align: center; padding-top: 30%;">
  <div style="font-size: 26pt; font-weight: 700; line-height: 1.3; color: #000;">${titleHtml}</div>
  ${authorHtml}
</div>`;
}

function buildTocPageHtml(chapters: NovelDocument[]): string {
  const items = chapters
    .map((doc) => `<li style="margin-bottom: 0.5em;">${escapeHtml(doc.title || 'Untitled Document')}</li>`)
    .join('');
  return `
<div style="padding-top: 18%;">
  <div style="font-size: 18pt; font-weight: 700; text-align: center; margin-bottom: 1.4em; color: #000;">Contents</div>
  <ol style="margin-left: 1.6em; font-size: 12pt; line-height: 1.7;">${items}</ol>
</div>`;
}

/** Minimal NovelDocument shim so buildPaperClone can render ad-hoc page HTML. */
function syntheticPaperDoc(contentHtml: string): NovelDocument {
  return {
    id: 'book-page',
    userId: 'book',
    title: 'Book Page',
    content: contentHtml,
    plainText: '',
    wordCount: 0,
    characterCount: 0,
    readingTimeMinutes: 0,
    status: 'draft',
    category: 'Manuscript',
    isFavorite: false,
    fontFamily: 'serif',
    fontSize: 16,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

/** Electron: one combined flowing HTML → native printToPDF + save dialog. */
function buildBookPrintableHtml(chapters: NovelDocument[], options: BookExportOptions): string {
  const sections: string[] = [];

  // v0.8.4: title page and chapter list are ALWAYS their own pages.
  if (options.includeTitlePage) {
    sections.push(`<section style="page-break-after: always; break-after: page;">${buildTitlePageHtml(options.bookTitle, options.authorName)}</section>`);
  }
  if (options.includeToc && chapters.length > 0) {
    sections.push(`<section style="page-break-after: always; break-after: page;">${buildTocPageHtml(chapters)}</section>`);
  }

  chapters.forEach((doc, index) => {
    const chapterTitle = escapeHtml(doc.title || 'Untitled Document');
    const heading = options.includeChapterHeadings
      ? `<h1 style="font-size: 20pt; font-weight: 700; text-align: center; margin: 0 0 1.2em 0; page-break-after: avoid; break-after: avoid;">${chapterTitle}</h1>`
      : '';
    const isLast = index === chapters.length - 1;
    const breakStyle = isLast ? '' : ' style="page-break-after: always; break-after: page;"';
    // v0.8.4: run each chapter through the SAME print-cleaning pipeline as
    // single-document PDF exports — it populates the visual-image portals
    // (saved empty in content) with image + caption and strips editor
    // chrome, so book PDFs carry images and match manual exports 1:1.
    const chapterHtml = cleanDocumentHtmlForPrint(doc.content || '', doc.visualImages) || `<p>${doc.plainText || ''}</p>`;
    sections.push(`<section${breakStyle}>${heading}${chapterHtml}</section>`);
  });

  return buildPrintableHtmlShell(sections.join('\n'), options.bookTitle, options.pageFormat);
}

async function exportBookToPdf(chapters: NovelDocument[], options: BookExportOptions): Promise<boolean> {
  const bookTitle = (options.bookTitle || 'Untitled Book').trim();

  // 1. Electron: native printToPDF with native save dialog
  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.exportPdf === 'function') {
    showExportToast('Preparing book PDF...', 'loading', 600000);
    try {
      const fullHtml = buildBookPrintableHtml(chapters, options);
      const res = await window.electronAPI.exportPdf({
        title: bookTitle,
        html: fullHtml,
        pageFormat: options.pageFormat || undefined,
      });
      if (res.success) {
        showExportToast(`Saved "${bookTitle}.pdf" successfully!`, 'success');
        return true;
      } else if (res.canceled) {
        showExportToast('Book export cancelled', 'info');
        return false;
      } else {
        showExportToast(`Export failed: ${res.error || 'Unknown error'}`, 'error');
        return false;
      }
    } catch (err: any) {
      console.error('Electron book PDF export failed:', err);
      showExportToast(`Export failed: ${err?.message || 'Error'}`, 'error');
      return false;
    }
  }

  // 2. Web / Android: per-chapter paper clone → one jsPDF
  showExportToast('Preparing book PDF...', 'loading', 600000);

  const pageConfig = getPageFormatConfig(options.pageFormat || null);
  const pdfWpt = pageConfig.width * 0.75;
  const pdfHpt = pageConfig.height * 0.75;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [pdfWpt, pdfHpt],
    compress: true,
  });

  try {
    const units: NovelDocument[] = [];
    if (options.includeTitlePage) units.push(syntheticPaperDoc(buildTitlePageHtml(bookTitle, options.authorName)));
    if (options.includeToc && chapters.length > 0) units.push(syntheticPaperDoc(buildTocPageHtml(chapters)));
    units.push(...chapters);

    let pageAdded = false; // v0.8.4: only the VERY first page reuses jsPDF's initial page
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const label = unit.title && unit.title !== 'Book Page' ? `"${unit.title}"` : `section ${i + 1} of ${units.length}`;
      showExportToast(`Rendering ${label}...`, 'loading', 600000);
      const clone = await buildPaperClone(unit, pageConfig);
      await appendPaperCloneToPdf(pdf, clone, undefined, { firstPageAlreadyPresent: pageAdded });
      pageAdded = true;
      clone.dispose();
    }

    try {
      pdf.setProperties({
        title: bookTitle,
        author: options.authorName?.trim() || 'Mundus Writing Studio',
        creator: 'Mundus Writing Studio',
      });
    } catch (e) {}

    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);

    // v0.8.61: on Android the WebView ignores anchor downloads — the PDF-Ready
    // card below performs the native save/view. Web keeps instant download.
    if (!canUseNativeSave()) {
      try {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = sanitizeFilename(bookTitle, 'pdf');
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 1000);
      } catch (e) {}
    }

    showPdfReadyToast({
      fileName: sanitizeFilename(bookTitle, 'pdf'),
      blobUrl,
      docTitle: bookTitle,
      // v0.8.61: blob for native delivery from the card buttons.
      blob: pdfBlob,
      mime: 'application/pdf',
    });
    return true;
  } catch (err: any) {
    console.error('Book PDF export error:', err);
    showExportToast(`Failed to export book PDF: ${err?.message || 'Unknown error'}`, 'error');
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */

async function exportBookToDocx(chapters: NovelDocument[], options: BookExportOptions): Promise<boolean> {
  const bookTitle = (options.bookTitle || 'Untitled Book').trim();
  showExportToast('Building book DOCX...', 'loading', 600000);

  try {
    const paragraphs: Paragraph[] = [];

    if (options.includeTitlePage) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: bookTitle, bold: true, size: 52 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: options.authorName?.trim() ? 240 : 0 },
        })
      );
      if (options.authorName?.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: options.authorName.trim(), size: 26 })],
            alignment: AlignmentType.CENTER,
          })
        );
      }
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    }

    if (options.includeToc && chapters.length > 0) {
      paragraphs.push(
        new Paragraph({
          text: 'Contents',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
        })
      );
      chapters.forEach((doc, i) => {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: `${i + 1}.  ${doc.title || 'Untitled Document'}` })],
            spacing: { line: 360, after: 120 },
          })
        );
      });
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    }

    for (let index = 0; index < chapters.length; index++) {
      const doc = chapters[index];
      if (options.includeChapterHeadings) {
        paragraphs.push(
          new Paragraph({
            text: doc.title || 'Untitled Document',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          })
        );
      }
      // v0.8.5: paginated converter — every virtual page boundary of the
      // chapter becomes an explicit Word page break (same paper-clone
      // pagination as the PDF path), portals populated from visualImages,
      // remote images fetched and embedded, headings black.
      const chapterParagraphs = await buildDocxPageParagraphs(doc, options.pageFormat ?? null);
      paragraphs.push(...chapterParagraphs);
      if (index < chapters.length - 1) {
        paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
      }
    }

    const docxFile = new Document({
      title: bookTitle,
      creator: options.authorName?.trim() || 'Mundus Writing Studio',
      styles: buildMundusDocxStyles(),
      // v0.8.61: REAL page size + margins matching the app's paper pages.
      sections: [{ properties: buildMundusDocxSectionProperties(options.pageFormat ?? null), children: paragraphs }],
    });

    const blob = await Packer.toBlob(docxFile);
    deliverBlob(blob, sanitizeFilename(bookTitle, 'docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    showExportToast(`Saved "${sanitizeFilename(bookTitle, 'docx')}" successfully!`, 'success');
    return true;
  } catch (err: any) {
    console.error('Book DOCX export error:', err);
    showExportToast(`Failed to export book DOCX: ${err?.message || 'Unknown error'}`, 'error');
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* EPUB                                                                */
/* ------------------------------------------------------------------ */

const EPUB_CSS = `body { font-family: 'Georgia', 'Times New Roman', serif; line-height: 1.6; margin: 5% 6%; color: #111; }
h1, h2, h3 { line-height: 1.3; }
h1.mundus-chapter-title { text-align: center; font-size: 1.5em; margin: 1.2em 0 1.4em 0; }
p { margin: 0 0 0.8em 0; }
blockquote { margin: 1.2em 1.5em; padding-left: 0.8em; border-left: 3px solid #666; font-style: italic; }
img { max-width: 100%; height: auto; }
figure { margin: 1.5em 0; text-align: center; }
figcaption { font-size: 0.85em; color: #555; font-style: italic; margin-top: 6px; }
.mundus-page-break-marker { height: 0; margin: 0; }
.mundus-spacer { height: 0.9em; margin: 0; }
.mundus-titlepage { text-align: center; margin-top: 30%; }
.mundus-titlepage .book-title { font-size: 2em; font-weight: 700; }
.mundus-titlepage .book-author { font-size: 1.1em; margin-top: 1.6em; }
.mundus-toc-list { list-style: none; padding: 0; margin: 1.5em 0; }
.mundus-toc-list li { margin-bottom: 0.6em; }
`;

/**
 * Serializes cleaned HTML content into an XHTML body fragment using the
 * browser's XMLSerializer (an XML serializer always emits well-formed
 * markup from a DOM, which is what EPUB requires).
 */
function htmlFragmentToXhtml(html: string): string {
  if (!html || !html.trim()) return '<p></p>';
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const body = parsed.body;

  // contenteditable artifacts are meaningless in a book
  body.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));

  // Manual page breaks: keep as an invisible marker (reflowable books do
  // not have pages, but the author's intent survives as a spacer)
  body.querySelectorAll('.mundus-manual-page-break, [data-manual-page-break]').forEach((el) => {
    const div = parsed.createElement('div');
    div.setAttribute('class', 'mundus-page-break-marker');
    el.parentNode?.replaceChild(div, el);
  });

  const serialized = new XMLSerializer().serializeToString(body);
  return serialized
    .replace(/^<body[^>]*>/, '')
    .replace(/<\/body>$/, '')
    .trim() || '<p></p>';
}

interface EpubImageAsset {
  id: string;
  href: string;
  mediaType: string;
  bytes: Uint8Array;
}

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

/**
 * v0.8.4: extracts data-URL AND remote http(s) images into EPUB image
 * assets, rewriting src attributes to the packaged relative href. Remote
 * images are fetched and embedded — EPUB readers do not reliably load
 * external URLs (most are offline/sandboxed), so packaging the bytes is
 * the only way images actually show up. On fetch failure the remote src
 * is kept as-is; unreadable data URLs drop the img (unchanged behavior).
 */
async function collectEpubImages(html: string, chapterIndex: number): Promise<{ html: string; assets: EpubImageAsset[] }> {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const assets: EpubImageAsset[] = [];
  let imgSeq = 0;

  const imgEls = Array.from(parsed.body.querySelectorAll('img'));
  for (const img of imgEls) {
    const src = img.getAttribute('src') || '';
    let bytes: Uint8Array | null = null;
    let ext = '';
    const dataMatch = src.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s);

    if (dataMatch) {
      try {
        ext = dataMatch[1].toLowerCase();
        bytes = Uint8Array.from(atob(dataMatch[2]), (ch) => ch.charCodeAt(0));
      } catch (e) {
        bytes = null;
      }
      if (!bytes || bytes.length === 0) {
        img.remove(); // unreadable data URL — drop the img rather than corrupt the chapter
        continue;
      }
    } else if (/^https?:\/\//i.test(src)) {
      try {
        const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
        if (res.ok) {
          const blob = await res.blob();
          bytes = new Uint8Array(await blob.arrayBuffer());
          const mime = (blob.type || '').toLowerCase();
          ext = mime.startsWith('image/') ? mime.slice(6).split(';')[0] : '';
          if (!ext) {
            const m = src.match(/\.(png|jpe?g|gif|bmp|svg|webp)(?:[?#]|$)/i);
            ext = m ? m[1].toLowerCase() : 'png';
          }
        }
      } catch (e) {
        bytes = null;
      }
      if (!bytes || bytes.length === 0) continue; // keep the remote src as a graceful fallback
    } else if (/^blob:/i.test(src)) {
      // v0.8.61: same-session blob: URLs (images inserted this session) are
      // fetchable — embed them like the DOCX pipeline does instead of
      // dropping them. Dead blob: URLs still fail and keep the src as-is.
      try {
        const res = await fetch(src);
        if (res.ok) {
          const blob = await res.blob();
          bytes = new Uint8Array(await blob.arrayBuffer());
          const mime = (blob.type || '').toLowerCase();
          ext = mime.startsWith('image/') ? mime.slice(6).split(';')[0] : '';
          if (!ext) {
            const m = src.match(/\.(png|jpe?g|gif|bmp|svg|webp)(?:[?#]|$)/i);
            ext = m ? m[1].toLowerCase() : 'png';
          }
        }
      } catch (e) {
        bytes = null;
      }
      if (!bytes || bytes.length === 0) continue;
    } else {
      continue; // file: sources are session-bound; leave untouched
    }

    const extRaw = ext || 'png';
    const extNorm = extRaw === 'jpeg' ? 'jpg' : extRaw;
    const mediaType = IMAGE_EXT_TO_MIME[extNorm] || `image/${extRaw}`;
    imgSeq += 1;
    const href = `images/ch${chapterIndex + 1}_img${imgSeq}.${extNorm}`;
    img.setAttribute('src', href);
    assets.push({ id: `img-ch${chapterIndex + 1}-${imgSeq}`, href, mediaType, bytes });
  }

  return { html: parsed.body.innerHTML, assets };
}

async function exportBookToEpub(chapters: NovelDocument[], options: BookExportOptions): Promise<boolean> {
  const bookTitle = (options.bookTitle || 'Untitled Book').trim();
  showExportToast('Building book EPUB...', 'loading', 600000);

  try {
    const zip = new JSZip();
    // EPUB spec: mimetype must be the FIRST entry and UNCOMPRESSED
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.folder('META-INF')!.file(
      'container.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>\n`
    );

    const oebps = zip.folder('OEBPS')!;
    oebps.file('style.css', EPUB_CSS);

    const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `urn:uuid:${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    // Chapters → XHTML files (+ embedded images)
    const chapterFiles: { id: string; href: string; title: string }[] = [];
    const allAssets: EpubImageAsset[] = [];

    for (let i = 0; i < chapters.length; i++) {
      const doc = chapters[i];
      const title = doc.title || 'Untitled Document';
      // v0.8.4: run the chapter through the same print-cleaning pipeline as
      // PDF exports — populates the saved-empty visual-image portals with
      // image + caption and strips editor chrome before packaging.
      const cleaned = cleanDocumentHtmlForPrint(doc.content || '', doc.visualImages) || `<p>${doc.plainText || ''}</p>`;
      const { html: withAssets, assets } = await collectEpubImages(cleaned, i);
      allAssets.push(...assets);
      const xhtmlBody = htmlFragmentToXhtml(withAssets);
      const chapterId = `chapter-${i + 1}`;
      const heading = options.includeChapterHeadings
        ? `<h1 class="mundus-chapter-title">${xmlEscape(title)}</h1>`
        : '';
      oebps.file(
        `${chapterId}.xhtml`,
        `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head>\n  <title>${xmlEscape(title)}</title>\n  <link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n${heading}\n${xhtmlBody}\n</body>\n</html>\n`
      );
      chapterFiles.push({ id: chapterId, href: `${chapterId}.xhtml`, title });
    }

    allAssets.forEach((asset) => {
      oebps.folder('images')!.file(asset.href.replace(/^images\//, ''), asset.bytes);
    });

    // Title page (optional)
    const hasTitlePage = options.includeTitlePage;
    if (hasTitlePage) {
      const authorHtml = options.authorName?.trim()
        ? `\n    <div class="book-author">${xmlEscape(options.authorName.trim())}</div>`
        : '';
      oebps.file(
        'titlepage.xhtml',
        `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml">\n<head>\n  <title>${xmlEscape(bookTitle)}</title>\n  <link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n<body>\n  <div class="mundus-titlepage">\n    <div class="book-title">${xmlEscape(bookTitle)}</div>${authorHtml}\n  </div>\n</body>\n</html>\n`
      );
    }

    // EPUB 3 navigation document
    const navItems = chapterFiles
      .map((c) => `      <li><a href="${c.href}">${xmlEscape(c.title)}</a></li>`)
      .join('\n');
    oebps.file(
      'nav.xhtml',
      `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n<head>\n  <title>Contents</title>\n</head>\n<body>\n  <nav epub:type="toc" id="toc">\n    <h1>Contents</h1>\n    <ol>\n${navItems}\n    </ol>\n  </nav>\n</body>\n</html>\n`
    );

    // EPUB 2 NCX for older readers
    const navPoints = chapterFiles
      .map(
        (c, i) =>
          `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">\n      <navLabel><text>${xmlEscape(c.title)}</text></navLabel>\n      <content src="${c.href}"/>\n    </navPoint>`
      )
      .join('\n');
    oebps.file(
      'toc.ncx',
      `<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n  <head>\n    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>\n    <meta name="dtb:depth" content="1"/>\n    <meta name="dtb:totalPageCount" content="0"/>\n    <meta name="dtb:maxPageNumber" content="0"/>\n  </head>\n  <docTitle><text>${xmlEscape(bookTitle)}</text></docTitle>\n  <navMap>\n${navPoints}\n  </navMap>\n</ncx>\n`
    );

    // OPF package
    const manifestImages = allAssets
      .map((a) => `    <item id="${a.id}" href="${a.href}" media-type="${a.mediaType}"/>`)
      .join('\n');
    const manifestChapters = chapterFiles
      .map((c) => `    <item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
      .join('\n');
    const spineItems = [
      ...(hasTitlePage ? ['    <itemref idref="titlepage"/>'] : []),
      ...chapterFiles.map((c) => `    <itemref idref="${c.id}"/>`),
    ].join('\n');

    oebps.file(
      'content.opf',
      `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:identifier id="book-id">urn:uuid:${uuid}</dc:identifier>\n    <dc:title>${xmlEscape(bookTitle)}</dc:title>\n${options.authorName?.trim() ? `    <dc:creator>${xmlEscape(options.authorName.trim())}</dc:creator>\n` : ''}    <dc:language>en</dc:language>\n    <meta property="dcterms:modified">${modified}</meta>\n  </metadata>\n  <manifest>\n    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n    <item id="css" href="style.css" media-type="text/css"/>\n${hasTitlePage ? '    <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>\n' : ''}${manifestChapters}\n${manifestImages}\n  </manifest>\n  <spine toc="ncx">\n${spineItems}\n  </spine>\n</package>\n`
    );

    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    deliverBlob(blob, sanitizeFilename(bookTitle, 'epub'), 'application/epub+zip');
    showExportToast(`Saved "${sanitizeFilename(bookTitle, 'epub')}" successfully!`, 'success');
    return true;
  } catch (err: any) {
    console.error('Book EPUB export error:', err);
    showExportToast(`Failed to export book EPUB: ${err?.message || 'Unknown error'}`, 'error');
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function exportBook(chapters: NovelDocument[], options: BookExportOptions): Promise<boolean> {
  if (!chapters || chapters.length === 0) {
    showExportToast('No documents selected — nothing to export', 'info');
    return false;
  }
  switch (options.format) {
    case 'pdf':
      return exportBookToPdf(chapters, options);
    case 'docx':
      return exportBookToDocx(chapters, options);
    case 'epub':
      return exportBookToEpub(chapters, options);
    default:
      return false;
  }
}

/** Convenience: project page format falls back to the app default. */
export function bookPageFormat(project?: MundusProject | null): string | null {
  return project?.pageFormat || null;
}
