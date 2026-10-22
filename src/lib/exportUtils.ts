import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, ImageRun, PageBreak, ShadingType, type ParagraphChild } from 'docx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { NovelDocument, CustomFont, GoogleFontItem, DocumentVisualImage, PageFormatConfig } from '../types';
import { CURATED_GOOGLE_FONTS } from '../data/googleFonts';
import { APP_VERSION } from '../constants';
import { applyEditorPagination } from './paginationEngine';
import { getPageFormatConfig } from './pageFormats';

// Ensure html2canvas is accessible synchronously to jsPDF
if (typeof window !== 'undefined') {
  (window as any).html2canvas = html2canvas;
}

export interface ExportPdfOptions {
  pageFormat?: string;
  customFonts?: CustomFont[];
  addedGoogleFonts?: GoogleFontItem[];
  defaultFontFamily?: string;
  includeMetaHeader?: boolean;
}

/**
 * Lightweight floating toast to provide immediate visual feedback during exports
 */
export function showExportToast(
  message: string, 
  status: 'loading' | 'success' | 'error' | 'info' = 'loading', 
  duration = 3200
) {
  if (typeof document === 'undefined') return;

  let toast = document.getElementById('mundus-export-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mundus-export-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '99999';
    toast.style.padding = '10px 18px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '12px';
    toast.style.fontWeight = '500';
    toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.35)';
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    toast.style.pointerEvents = 'auto';
    document.body.appendChild(toast);
  }

  if (status === 'loading') {
    toast.style.background = '#18181b';
    toast.style.color = '#f4f4f5';
    toast.style.border = '1px solid #3f3f46';
    toast.innerHTML = `
      <svg style="animation: mundus-spin 1s linear infinite; width: 15px; height: 15px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
      <span>${message}</span>
    `;
  } else if (status === 'success') {
    toast.style.background = '#064e3b';
    toast.style.color = '#ecfdf5';
    toast.style.border = '1px solid #059669';
    toast.innerHTML = `
      <svg style="width: 15px; height: 15px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${message}</span>
    `;
  } else if (status === 'info') {
    toast.style.background = '#1e293b';
    toast.style.color = '#f1f5f9';
    toast.style.border = '1px solid #475569';
    toast.innerHTML = `
      <svg style="width: 15px; height: 15px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      <span>${message}</span>
    `;
  } else {
    toast.style.background = '#7f1d1d';
    toast.style.color = '#fef2f2';
    toast.style.border = '1px solid #dc2626';
    toast.innerHTML = `
      <svg style="width: 15px; height: 15px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>${message}</span>
    `;
  }

  // Ensure keyframes exist
  if (!document.getElementById('mundus-spin-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'mundus-spin-style';
    styleEl.textContent = '@keyframes mundus-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(styleEl);
  }

  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  if (status !== 'loading') {
    setTimeout(() => {
      const activeToast = document.getElementById('mundus-export-toast');
      if (activeToast && !activeToast.getAttribute('data-persistent')) {
        activeToast.style.opacity = '0';
        activeToast.style.transform = 'translateY(8px)';
        setTimeout(() => activeToast.remove(), 260);
      }
    }, duration);
  }
}

/**
 * Interactive notification displayed when a PDF file is ready to download or view.
 * Solves browser iframe sandbox security restrictions by offering an explicit 1-click user gesture.
 */
export function showPdfReadyToast(options: {
  fileName: string;
  blobUrl: string;
  docTitle: string;
}) {
  const existing = document.getElementById('mundus-export-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'mundus-export-toast';
  toast.setAttribute('data-persistent', 'true');
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.zIndex = '99999';
  toast.style.padding = '14px 18px';
  toast.style.borderRadius = '10px';
  toast.style.fontSize = '13px';
  toast.style.fontWeight = '500';
  toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  toast.style.display = 'flex';
  toast.style.flexDirection = 'column';
  toast.style.gap = '10px';
  toast.style.background = '#18181b';
  toast.style.color = '#f4f4f5';
  toast.style.border = '1px solid #3f3f46';
  toast.style.boxShadow = '0 12px 35px rgba(0, 0, 0, 0.55)';
  toast.style.maxWidth = '360px';
  toast.style.pointerEvents = 'auto';
  toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';

  toast.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: #10b981;">
        <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>PDF Ready</span>
      </div>
      <button id="mundus-toast-close" style="background: none; border: none; color: #71717a; cursor: pointer; padding: 2px 4px; font-size: 14px; line-height: 1;" title="Dismiss">✕</button>
    </div>
    <div style="font-size: 12px; color: #a1a1aa; word-break: break-word;">
      <strong>"${options.fileName}"</strong> is compiled. Click below to save or view:
    </div>
    <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
      <a id="mundus-toast-download-btn" href="${options.blobUrl}" download="${options.fileName}" style="flex: 1; text-align: center; background: #2563eb; color: #ffffff; text-decoration: none; padding: 7px 12px; border-radius: 6px; font-weight: 600; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;">
        <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download PDF
      </a>
      <a id="mundus-toast-view-btn" href="${options.blobUrl}" target="_blank" rel="noopener noreferrer" style="background: #27272a; color: #d4d4d8; text-decoration: none; padding: 7px 12px; border-radius: 6px; font-weight: 500; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; border: 1px solid #3f3f46;">
        View
      </a>
    </div>
  `;

  document.body.appendChild(toast);

  const closeBtn = document.getElementById('mundus-toast-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      toast.remove();
      URL.revokeObjectURL(options.blobUrl);
    };
  }

  const downloadBtn = document.getElementById('mundus-toast-download-btn');
  if (downloadBtn) {
    downloadBtn.onclick = () => {
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 3500);
    };
  }

  // Auto-dismiss after 45 seconds if unclicked
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
      URL.revokeObjectURL(options.blobUrl);
    }
  }, 45000);
}

/**
 * Prepares document HTML for export while preserving ALL rich formatting —
 * text colors, highlighter backgrounds, fonts, sizes, bold, italics, alignments,
 * quotes, images and their captions stay exactly as the author wrote them.
 * Only editor-chrome artifacts (temporary selection highlights, legacy auto
 * page-break spacers) are removed.
 */
export function cleanDocumentHtmlForPrint(rawHtml: string, visualImages?: DocumentVisualImage[]): string {
  if (!rawHtml || !rawHtml.trim()) return '';
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(rawHtml, 'text/html');

  // 1. Populate visual images portal figures if present
  if (visualImages && visualImages.length > 0) {
    const visualMap = new Map<string, DocumentVisualImage>(visualImages.map((img) => [img.id, img]));
    const figures = parsedDoc.querySelectorAll('[data-visual-image-id]');
    figures.forEach((fig) => {
      const imgId = fig.getAttribute('data-visual-image-id');
      const imgData = imgId ? visualMap.get(imgId) : null;
      if (imgData && imgData.url) {
        const widthStyle = imgData.width ? `max-width: min(${imgData.width}px, 100%);` : 'max-width: 100%;';
        const alignSelf = imgData.alignment === 'left' ? 'flex-start' : imgData.alignment === 'right' ? 'flex-end' : 'center';

        fig.innerHTML = `
          <div style="display: inline-flex; flex-direction: column; align-items: center; ${widthStyle} width: fit-content; text-align: center;">
            <img src="${imgData.url}" alt="${imgData.caption || ''}" style="max-width: 100%; height: auto; display: block; border-radius: 4px;" />
            ${imgData.caption ? `<figcaption style="font-size: 9pt; color: #555; margin-top: 6px; font-style: italic; text-align: center; display: block; width: 100%; word-break: break-word;">${imgData.caption}</figcaption>` : ''}
          </div>
        `;
        (fig as HTMLElement).style.cssText = `margin: 1.5em 0; display: flex; flex-direction: column; align-items: ${alignSelf}; clear: both; width: 100%;`;
      }
    });
  }

  // 2. Remove all editor-specific temporary selection highlights
  parsedDoc.querySelectorAll('.mundus-temp-selection-highlight, .mundus-word-correction-highlight').forEach((span) => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  });

  // 3. Strip legacy automatic page-break spacer divs (manual breaks are kept as
  //    invisible markers — the physical page transition in the PDF IS the break)
  parsedDoc.querySelectorAll('.mundus-page-break:not([data-manual-page-break])').forEach((el) => el.remove());

  return parsedDoc.body.innerHTML;
}

export function htmlToMarkdown(html: string, fallbackText: string): string {
  if (!html || !html.trim()) {
    return fallbackText || '';
  }
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    function processNode(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const children = Array.from(el.childNodes).map(processNode).join('');

      switch (tag) {
        case 'h1': return `\n# ${children.trim()}\n\n`;
        case 'h2': return `\n## ${children.trim()}\n\n`;
        case 'h3': return `\n### ${children.trim()}\n\n`;
        case 'h4': return `\n#### ${children.trim()}\n\n`;
        case 'h5': return `\n##### ${children.trim()}\n\n`;
        case 'h6': return `\n###### ${children.trim()}\n\n`;
        case 'p': return `${children.trim()}\n\n`;
        case 'strong':
        case 'b': return `**${children.trim()}**`;
        case 'em':
        case 'i': return `*${children.trim()}*`;
        case 'u': return `_${children.trim()}_`;
        case 's':
        case 'del':
        case 'strike': return `~~${children.trim()}~~`;
        case 'blockquote': return `\n> ${children.trim().replace(/\n/g, '\n> ')}\n\n`;
        case 'code': return `\`${children}\``;
        case 'pre': return `\n\`\`\`\n${children.trim()}\n\`\`\`\n\n`;
        case 'ul': return `\n${children}\n`;
        case 'ol': return `\n${children}\n`;
        case 'li': return `- ${children.trim()}\n`;
        case 'hr': return `\n---\n\n`;
        case 'img': {
          const src = el.getAttribute('src') || '';
          const alt = el.getAttribute('alt') || 'Illustration';
          return `\n![${alt}](${src})\n\n`;
        }
        case 'br': return `\n`;
        default: return children;
      }
    }

    const md = processNode(doc.body).replace(/\n{3,}/g, '\n\n').trim();
    return md || fallbackText || '';
  } catch (e) {
    console.error('Error parsing HTML to Markdown:', e);
    return fallbackText || '';
  }
}

export function exportToMarkdown(doc: NovelDocument) {
  const cleanTitle = doc.title || 'Untitled Document';
  const mdBody = htmlToMarkdown(doc.content, doc.plainText);
  const fullContent = `# ${cleanTitle}\n\n${mdBody}`;
  
  const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports the document in native Mundus format (.mundus) preserving every byte of
 * rich text content, colors, highlighters, visual images, custom styles, synopsis, and metadata.
 */
export async function exportToMundus(doc: NovelDocument): Promise<boolean> {
  const cleanTitle = (doc.title || 'Untitled Document').trim();
  const safeFilename = `${cleanTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'document'}.mundus`;

  const payload = {
    version: APP_VERSION,
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    appName: 'Mundus Writing Studio',
    format: 'mundus_document',
    pageFormatHint: typeof activePageFormatGlobal === 'string' ? activePageFormatGlobal : undefined,
    document: {
      ...doc,
    }
  };

  const jsonStr = JSON.stringify(payload, null, 2);

  // If in Electron and dialog save is available
  if (typeof window !== 'undefined' && window.electronAPI?.saveFile) {
    try {
      const saved = await window.electronAPI.saveFile(safeFilename, jsonStr);
      if (saved) {
        showExportToast(`Exported "${safeFilename}"`, 'success');
        return true;
      }
    } catch (e) {
      console.warn('Electron saveFile error:', e);
    }
  }

  // File System Access API picker if supported in modern browser
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: safeFilename,
        types: [{
          description: 'Mundus Native Document (.mundus)',
          accept: { 'application/json': ['.mundus', '.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      showExportToast(`Exported "${safeFilename}"`, 'success');
      return true;
    } catch (e: any) {
      if (e.name === 'AbortError') return false;
    }
  }

  // Standard fallback browser download
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);

  showExportToast(`Exported native document "${safeFilename}"`, 'success');
  return true;
}

/**
 * Builds a standalone HTML document that renders the document exactly as it is in Mundus:
 * keeping all custom fonts, Google Fonts, full font sizes, bold/italics, quotes, alignments,
 * embedded visual images, and crucially PRESERVING all text colors and highlighters.
 */
export function buildNativeFormattedHtml(doc: NovelDocument, optionsOrFormat?: ExportPdfOptions | string): string {
  const options: ExportPdfOptions = typeof optionsOrFormat === 'string'
    ? { pageFormat: optionsOrFormat }
    : (optionsOrFormat || {});

  const cleanTitle = (doc.title || 'Untitled Document').trim();
  const rawHtml = doc.content || `<p>${doc.plainText || ''}</p>`;

  // Resolve custom fonts
  let customFontsList: CustomFont[] = options.customFonts || [];
  if (customFontsList.length === 0) {
    try {
      const raw = localStorage.getItem('mundus_custom_fonts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) customFontsList = parsed;
      }
    } catch (e) {}
  }

  let customFontsCss = '';
  if (customFontsList.length > 0) {
    customFontsList.forEach((font) => {
      if (font.name && font.dataUrl) {
        customFontsCss += `
@font-face {
  font-family: '${font.name}';
  src: url('${font.dataUrl}');
  font-weight: normal;
  font-style: normal;
}
`;
      }
    });
  }

  // Resolve Google Fonts
  let googleFontsList: GoogleFontItem[] = options.addedGoogleFonts || [];
  if (googleFontsList.length === 0) {
    try {
      const raw = localStorage.getItem('mundus_google_fonts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) googleFontsList = parsed;
      }
    } catch (e) {}
  }

  const googleFamilies = new Set<string>([
    'Cinzel:wght@500;700',
    'Inter:wght@300;400;500;600;700',
    'JetBrains+Mono:wght@400;500',
    'Lora:ital,wght@0,400;0,500;0,600;1,400;1,600',
    'Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,600'
  ]);

  CURATED_GOOGLE_FONTS.forEach((gf) => {
    if (gf.googleFamily) googleFamilies.add(gf.googleFamily);
  });
  googleFontsList.forEach((gf) => {
    if (gf.googleFamily) googleFamilies.add(gf.googleFamily);
  });

  const googleFontLinkTags = Array.from(googleFamilies)
    .map((fam) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fam}&display=swap">`)
    .join('\n  ');

  const defaultBodyFont = options.defaultFontFamily || "'Lora', Georgia, 'Times New Roman', serif";

  let visualImagesHtml = '';
  if (doc.visualImages && doc.visualImages.length > 0) {
    doc.visualImages.forEach((img) => {
      if (img.url && !rawHtml.includes(img.url)) {
        const alignSelf = img.alignment === 'left' ? 'flex-start' : img.alignment === 'right' ? 'flex-end' : 'center';
        const widthStyle = img.width ? `max-width: min(${img.width}px, 100%);` : 'max-width: 100%;';
        visualImagesHtml += `
<figure class="mundus-visual-figure" style="margin: 24px 0; display: flex; flex-direction: column; align-items: ${alignSelf}; clear: both; width: 100%;">
  <div style="display: inline-flex; flex-direction: column; align-items: center; ${widthStyle} width: fit-content; text-align: center;">
    <img src="${img.url}" alt="${img.caption || 'Document visual'}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,0.15);" />
    ${img.caption ? `<figcaption style="font-size: 13px; color: #71717a; margin-top: 8px; font-style: italic; text-align: center; display: block; width: 100%;">${img.caption}</figcaption>` : ''}
  </div>
</figure>
`;
      }
    });
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cleanTitle} - Mundus</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${googleFontLinkTags}
  <style>
    ${customFontsCss}

    :root {
      --mundus-bg: #ffffff;
      --mundus-text: #18181b;
      --mundus-border: #e4e4e7;
      --mundus-muted: #71717a;
      --mundus-quote: #3f3f46;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --mundus-bg: #09090b;
        --mundus-text: #f4f4f5;
        --mundus-border: #27272a;
        --mundus-muted: #a1a1aa;
        --mundus-quote: #71717a;
      }
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background-color: var(--mundus-bg);
      color: var(--mundus-text);
      font-family: ${defaultBodyFont};
      font-size: 17px;
      line-height: 1.8;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      transition: background-color 0.2s ease, color 0.2s ease;
    }

    .mundus-container {
      max-width: 760px;
      margin: 0 auto;
      padding: 48px 24px 96px 24px;
    }

    header.mundus-doc-header {
      margin-bottom: 36px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--mundus-border);
      text-align: center;
    }

    h1.mundus-doc-title {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.25;
      margin: 0 0 10px 0;
      letter-spacing: -0.02em;
    }

    .mundus-doc-meta {
      font-size: 12px;
      color: var(--mundus-muted);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }

    main.mundus-doc-content {
      width: 100%;
    }

    p {
      margin-top: 0;
      margin-bottom: 1.2em;
    }

    /* Ctrl+Enter spacer blocks: preserved as extra whitespace (~half a line) */
    .mundus-spacer {
      height: 0.9em;
      margin: 0;
      padding: 0;
    }

    blockquote {
      margin: 1.6em 0;
      padding: 8px 24px;
      border-left: 3px solid var(--mundus-quote);
      font-style: italic;
    }

    img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      display: block;
      margin: 1.6em auto;
    }

    figure {
      margin: 1.8em 0;
    }

    figcaption {
      font-size: 13px;
      color: var(--mundus-muted);
      font-style: italic;
      margin-top: 6px;
    }

    hr {
      border: 0;
      border-top: 1px solid var(--mundus-border);
      margin: 2.8em auto;
      width: 40%;
    }

    mark {
      border-radius: 2px;
      padding: 1px 3px;
    }

    code, pre {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
    }

    pre {
      padding: 14px 18px;
      background: rgba(120, 120, 120, 0.08);
      border: 1px solid var(--mundus-border);
      border-radius: 6px;
      overflow-x: auto;
    }

    @media print {
      body {
        background: #fff !important;
        color: #111 !important;
      }
      .mundus-container {
        padding: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="mundus-container">
    <header class="mundus-doc-header">
      <h1 class="mundus-doc-title">${cleanTitle}</h1>
      <div class="mundus-doc-meta">
        <span>${doc.wordCount || 0} words</span>
        <span>•</span>
        <span>Mundus Formatted Document</span>
      </div>
    </header>
    <main class="mundus-doc-content">
      ${rawHtml}
      ${visualImagesHtml}
    </main>
  </div>
</body>
</html>`;
}

/**
 * Exports the document exactly as it is (with all colors, highlighters, fonts,
 * visual images, and formatting intact) as a standalone HTML page (.html).
 */
export function exportToHtml(doc: NovelDocument, options?: ExportPdfOptions): boolean {
  const cleanTitle = (doc.title || 'Untitled Document').trim();
  const safeFilename = `${cleanTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'document'}.html`;
  
  const fullHtml = buildNativeFormattedHtml(doc, options);

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);

  showExportToast(`Exported formatted document "${safeFilename}"`, 'success');
  return true;
}

/**
 * Builds a pristine, standalone printable HTML document with embedded fonts,
 * clean typography, page dimensions, and stripped highlighters/colors.
 */
export function buildFullPrintableHtml(doc: NovelDocument, optionsOrFormat?: ExportPdfOptions | string): string {
  const rawHtml = doc.content || `<p>${doc.plainText || ''}</p>`;
  const cleanedHtml = cleanDocumentHtmlForPrint(rawHtml, doc.visualImages);
  return buildPrintableHtmlShell(cleanedHtml, doc.title || 'Untitled Document', optionsOrFormat);
}

/**
 * v0.8.3: shared printable-HTML shell (page CSS, fonts, paper adaptation)
 * extracted verbatim from buildFullPrintableHtml so Export Book can print
 * many chapters through the exact same Electron printToPDF pipeline.
 */
export function buildPrintableHtmlShell(bodyHtml: string, title: string, optionsOrFormat?: ExportPdfOptions | string): string {
  const options: ExportPdfOptions = typeof optionsOrFormat === 'string'
    ? { pageFormat: optionsOrFormat }
    : (optionsOrFormat || {});

  const cleanTitle = (title || 'Untitled Document').trim();
  const cleanedHtml = bodyHtml;

  let pageSizeCss = 'letter';
  let pageMargin = '20mm 18mm';
  const format = (options.pageFormat || '').toLowerCase();
  if (format === 'a4') {
    pageSizeCss = 'A4';
    pageMargin = '20mm 18mm';
  } else if (format === 'a5') {
    pageSizeCss = 'A5';
    pageMargin = '15mm 12mm';
  } else if (format === 'trade_paperback') {
    pageSizeCss = '6in 9in';
    pageMargin = '18mm 15mm';
  } else if (format === 'pocket_paperback') {
    pageSizeCss = '5.5in 8.5in';
    pageMargin = '15mm 12mm';
  }

  let customFontsList: CustomFont[] = options.customFonts || [];
  if (customFontsList.length === 0) {
    try {
      const raw = localStorage.getItem('mundus_custom_fonts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) customFontsList = parsed;
      }
    } catch (e) {}
  }

  let customFontsCss = '';
  if (customFontsList.length > 0) {
    customFontsList.forEach((font) => {
      if (font.name && font.dataUrl) {
        customFontsCss += `
@font-face {
  font-family: '${font.name}';
  src: url('${font.dataUrl}');
  font-weight: normal;
  font-style: normal;
}
`;
      }
    });
  }

  let googleFontsList: GoogleFontItem[] = options.addedGoogleFonts || [];
  if (googleFontsList.length === 0) {
    try {
      const raw = localStorage.getItem('mundus_google_fonts');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) googleFontsList = parsed;
      }
    } catch (e) {}
  }

  const googleFamilies = new Set<string>([
    'Cinzel:wght@500;700',
    'Inter:wght@300;400;500;600;700',
    'JetBrains+Mono:wght@400;500',
    'Lora:ital,wght@0,400;0,500;0,600;1,400;1,600',
    'Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,600'
  ]);

  CURATED_GOOGLE_FONTS.forEach((gf) => {
    if (gf.googleFamily) googleFamilies.add(gf.googleFamily);
  });
  googleFontsList.forEach((gf) => {
    if (gf.googleFamily) googleFamilies.add(gf.googleFamily);
  });

  const googleFontLinkTags = Array.from(googleFamilies)
    .map((fam) => `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fam}&display=swap">`)
    .join('\n  ');

  const defaultBodyFont = options.defaultFontFamily || "'Lora', Georgia, 'Times New Roman', serif";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${cleanTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${googleFontLinkTags}
  <style>
    ${customFontsCss}

    @page {
      size: ${pageSizeCss};
      margin: ${pageMargin};
    }

    @media print {
      html, body {
        width: 100%;
        margin: 0;
        padding: 0;
        background: #fff !important;
      }
      img {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      figure {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      blockquote {
        page-break-inside: avoid;
        break-inside: avoid;
        border-left: 3px solid #555 !important;
      }
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid;
        break-after: avoid;
      }
      p {
        orphans: 3;
        widows: 3;
      }
    }

    /* Light-paper adaptation: text explicitly authored as white/near-white
       (for dark themes) is darkened so it stays legible on white paper —
       mirroring the app's own light-mode rendering. Every other explicit
       color, highlighter, font size and style is printed exactly as authored. */
    .doc-body [style*="color: rgb(255, 255, 255)"],
    .doc-body [style*="color: #ffffff"],
    .doc-body [style*="color: white"],
    .doc-body [style*="color: rgb(244, 244, 245)"],
    .doc-body [style*="color: rgb(245, 245, 245)"],
    .doc-body [style*="color: #f4f4f5"],
    .doc-body [style*="color: #f5f5f5"],
    .doc-body font[color="#ffffff"],
    .doc-body font[color="#f4f4f5"],
    .doc-body font[color="#f5f5f5"],
    .doc-body font[color="white"] {
      color: #171717 !important;
    }

    body {
      font-family: ${defaultBodyFont};
      font-size: 11pt;
      line-height: 1.75;
      color: #111;
      background: #fff;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      box-sizing: border-box;
    }

    .doc-header {
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 1px solid #ccc;
      text-align: center;
    }

    .doc-title {
      font-size: 22pt;
      font-weight: 700;
      line-height: 1.25;
      margin: 0 0 6px 0;
      color: #000;
    }

    .doc-meta {
      font-size: 8.5pt;
      color: #666;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    p {
      margin-top: 0;
      margin-bottom: 0.8em;
      line-height: 1.75;
    }

    p[style*="text-align: center"],
    p[style*="text-align:center"] {
      text-align: center !important;
    }
    p[style*="text-align: right"],
    p[style*="text-align:right"] {
      text-align: right !important;
    }
    p[style*="text-align: justify"],
    p[style*="text-align:justify"] {
      text-align: justify !important;
    }
    p[style*="text-align: left"],
    p[style*="text-align:left"] {
      text-align: left !important;
    }

    blockquote {
      margin: 1.2em 1.5em;
      padding: 6px 16px;
      border-left: 3px solid #666;
      font-style: italic;
    }

    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1.2em auto;
      border-radius: 3px;
    }

    figure {
      margin: 1.5em 0;
      text-align: center;
    }

    figcaption {
      font-size: 9pt;
      color: #555;
      font-style: italic;
      margin-top: 6px;
    }

    hr {
      border: 0;
      border-top: 1px solid #ccc;
      margin: 2em auto;
      width: 50%;
    }

    ul, ol {
      margin: 0.8em 0 0.8em 1.6em;
      padding: 0;
    }
    li {
      margin-bottom: 0.3em;
    }

    code, pre {
      font-family: 'JetBrains Mono', Courier, monospace;
      font-size: 9.5pt;
    }
    pre {
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 4px;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 1em 0;
    }

    /* Ctrl+Enter spacer blocks: print as pure extra whitespace (~half a line) */
    .mundus-spacer {
      height: 0.9em;
      margin: 0;
      padding: 0;
    }
  </style>
</head>
<body>
  <main class="doc-body">
    ${cleanedHtml}
  </main>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* PDF — page-faithful export                                          */
/* ------------------------------------------------------------------ */

// CSS px (96dpi) -> PDF pt (72dpi)
const PX_TO_PT = 0.75;
const PAPER_TEXT_COLOR = '#171717';
// Offscreen placement of the paper clone (html2canvas crop coordinates are
// relative to the element's document bounds, so captures compensate for this)
const PAPER_CLONE_OFFSET = 99999;

// Active page format fallback (kept in sync by App when the active Mundus
// project changes; used when exportToPdf is called without an explicit format,
// e.g. from the Start Menu)
let activePageFormatGlobal: string | undefined;
export function setActivePageFormatGlobal(format?: string | null) {
  activePageFormatGlobal = format || undefined;
}

export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * CSS injected for the offscreen paper clone. It reproduces, inside the clone,
 * exactly how the app renders text in LIGHT mode (printed paper):
 * - text explicitly authored as white/near-white (for dark themes) is darkened,
 * - the dark-mode flip of black-authored text is neutralized back to ink,
 * - every other explicit color the author chose is preserved as-is.
 */
const PAPER_ADAPTATION_CSS = `
  .mundus-pdf-clone [style*="color: rgb(255, 255, 255)"],
  .mundus-pdf-clone [style*="color: #ffffff"],
  .mundus-pdf-clone [style*="color: white"],
  .mundus-pdf-clone [style*="color: rgb(244, 244, 245)"],
  .mundus-pdf-clone [style*="color: rgb(245, 245, 245)"],
  .mundus-pdf-clone [style*="color: #f4f4f5"],
  .mundus-pdf-clone [style*="color: #f5f5f5"],
  .mundus-pdf-clone font[color="#ffffff"],
  .mundus-pdf-clone font[color="#f4f4f5"],
  .mundus-pdf-clone font[color="#f5f5f5"],
  .mundus-pdf-clone font[color="white"] {
    color: #171717 !important;
  }

  html.dark .mundus-pdf-clone [style*="color: rgb(0, 0, 0)"],
  html.dark .mundus-pdf-clone [style*="color: #000000"],
  html.dark .mundus-pdf-clone [style*="color: black"],
  html.dark .mundus-pdf-clone [style*="color: rgb(9, 9, 11)"],
  html.dark .mundus-pdf-clone [style*="color: #09090b"],
  html.dark .mundus-pdf-clone [style*="color: rgb(24, 24, 27)"],
  html.dark .mundus-pdf-clone [style*="color: rgb(23, 23, 23)"],
  html.dark .mundus-pdf-clone [style*="color: #171717"],
  html.dark .mundus-pdf-clone [style*="color: inherit"],
  html.dark .mundus-pdf-clone font[color="#000000"],
  html.dark .mundus-pdf-clone font[color="#09090b"],
  html.dark .mundus-pdf-clone font[color="#171717"],
  html.dark .mundus-pdf-clone font[color="black"],
  html.dark .mundus-pdf-clone font[color="inherit"] {
    color: #171717 !important;
  }
`;

function escapeHtmlAttr(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the clone's inner HTML from the saved document content:
 * - unwraps editor temporary highlights,
 * - removes legacy automatic page-break spacers,
 * - converts manual page breaks into invisible zero-height markers
 *   (the physical PDF page transition IS the break),
 * - keeps Ctrl+Enter spacer blocks as real whitespace gaps (the .mundus-spacer
 *   height rule applies to the clone via the global stylesheet),
 * - re-renders visual image portal figures with image + caption at their
 *   saved width and alignment (mirroring the editor's overlay rendering).
 */
function buildContentCloneHtml(doc: NovelDocument): string {
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(doc.content || '', 'text/html');
  const body = parsedDoc.body;

  // Unwrap temporary selection/correction highlights
  body.querySelectorAll('.mundus-temp-selection-highlight, .mundus-word-correction-highlight').forEach((span) => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
  });

  // Remove legacy automatic page-break spacer divs
  body.querySelectorAll('.mundus-page-break:not([data-manual-page-break])').forEach((el) => el.remove());

  // Strip stale pagination markers / inline virtual-gap margins
  body.querySelectorAll('.is-page-start, .mundus-page-start').forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.classList.remove('is-page-start', 'mundus-page-start');
    htmlEl.style.removeProperty('margin-top');
    if (htmlEl.getAttribute('class') === '') htmlEl.removeAttribute('class');
    if (htmlEl.getAttribute('style') === '') htmlEl.removeAttribute('style');
  });

  // Manual page breaks → invisible zero-height markers. The pagination engine
  // still honors them as hard breaks; nothing pill-shaped is printed.
  body.querySelectorAll('.mundus-manual-page-break, [data-manual-page-break]').forEach((el) => {
    el.innerHTML = '';
    el.className = 'mundus-manual-page-break';
    el.setAttribute('data-manual-page-break', 'true');
    el.setAttribute('contenteditable', 'false');
    el.setAttribute('style', 'height: 0; min-height: 0; margin: 0; padding: 0;');
  });

  // Populate visual image portal figures (they are saved empty)
  const visualImages = doc.visualImages || [];
  if (visualImages.length > 0) {
    const visualMap = new Map<string, DocumentVisualImage>(visualImages.map((img) => [img.id, img]));

    const renderFigure = (imgData: DocumentVisualImage): string => {
      const width = Math.max(60, Math.min(imgData.width || 280, 760));
      const alignment = imgData.alignment || 'center';
      const itemMargin =
        alignment === 'left' ? '0 auto 0 0' :
        alignment === 'right' ? '0 0 0 auto' : '0 auto';

      return `
        <div class="visual-image-item" style="display: block; margin: ${itemMargin}; width: ${width}px; max-width: 100%;">
          <div style="position: relative; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
            <img src="${escapeHtmlAttr(imgData.url)}" alt="${escapeHtmlAttr(imgData.caption || 'Illustration')}" style="width: 100%; height: auto; display: block; border-radius: 12px;" />
          </div>
          ${imgData.caption ? `
          <div style="margin-top: 8px; text-align: center;">
            <figcaption style="font-size: 12px; font-style: italic; color: #737373; font-family: 'Lora', Georgia, serif; line-height: 1.45; word-break: break-word;">${escapeHtmlAttr(imgData.caption)}</figcaption>
          </div>` : ''}
        </div>
      `;
    };

    body.querySelectorAll('[data-visual-image-id]').forEach((fig) => {
      const imgId = fig.getAttribute('data-visual-image-id');
      const imgData = imgId ? visualMap.get(imgId) : null;
      if (!imgData || !imgData.url) return;

      fig.innerHTML = renderFigure(imgData);
      (fig as HTMLElement).style.minHeight = '0';
      (fig as HTMLElement).style.height = 'auto';
    });

    // Portal nodes can be missing from saved content (the editor re-creates
    // them on load via VisualImageOverlay.syncPortals) — mirror that here so
    // every visual image reaches the PDF, appended at the end of the flow.
    visualImages.forEach((imgData) => {
      if (!imgData.url) return;
      if (body.querySelector(`[data-visual-image-id="${imgData.id}"]`)) return;

      const fig = parsedDoc.createElement('figure');
      fig.setAttribute('data-visual-image-id', imgData.id);
      fig.setAttribute('contenteditable', 'false');
      fig.className = 'visual-image-portal-node my-6 block select-none cursor-default relative';
      fig.innerHTML = renderFigure(imgData);
      body.appendChild(fig);
    });
  }

  const html = body.innerHTML.trim();
  return html || '<p><br></p>';
}

export interface PaperClone {
  content: HTMLDivElement;
  totalPages: number;
  pageConfig: PageFormatConfig;
  dispose: () => void;
}

/**
 * Builds an offscreen, light-mode "paper" replica of the document at the
 * exact page width used by the editor, then runs the SAME pagination engine
 * as Writing Mode so every block lands on the same page as the author sees.
 */
export async function buildPaperClone(doc: NovelDocument, pageConfig: PageFormatConfig): Promise<PaperClone> {
  // Inject the paper adaptation CSS once
  let styleEl = document.getElementById('mundus-pdf-paper-style') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'mundus-pdf-paper-style';
    styleEl.textContent = PAPER_ADAPTATION_CSS;
    document.head.appendChild(styleEl);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'mundus-pdf-clone';
  wrapper.setAttribute('style', [
    'position: absolute',
    `top: -${PAPER_CLONE_OFFSET}px`,
    `left: -${PAPER_CLONE_OFFSET}px`,
    'z-index: -2147483647',
    `width: ${pageConfig.width}px`,
    'background: #ffffff',
    'pointer-events: none',
    'user-select: none',
  ].join('; ') + ';');

  const content = document.createElement('div');
  content.className = 'novel-editor';
  content.setAttribute('style', [
    'width: 100%',
    'box-sizing: border-box',
    `padding: ${pageConfig.topMargin}px 56px ${pageConfig.bottomMargin}px 56px`,
    'font-size: 16px',
    `color: ${PAPER_TEXT_COLOR}`,
    'background: transparent',
  ].join('; ') + ';');
  content.innerHTML = buildContentCloneHtml(doc);

  wrapper.appendChild(content);
  document.body.appendChild(wrapper);

  const dispose = () => {
    wrapper.remove();
  };

  // Wait for web fonts to be ready so text metrics match the editor
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {}

  // Wait for every image (data URLs resolve instantly; hosted need network)
  const images = Array.from(wrapper.querySelectorAll('img'));
  if (images.length > 0) {
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      })
    );
  }

  // Allow one layout pass before measuring
  await new Promise((r) => setTimeout(r, 60));

  // Run the SAME pagination algorithm as the Writing Mode editor
  const totalPages = applyEditorPagination(content, pageConfig, doc.visualImages);
  const PAGE_CYCLE = pageConfig.height + pageConfig.gap;
  content.style.minHeight = `${totalPages * PAGE_CYCLE - pageConfig.gap}px`;

  return { content, totalPages, pageConfig, dispose };
}

/**
 * v0.8.3: renders every paginated page of a paper clone into `pdf` as a
 * full-bleed image page (extracted from exportToPdf so Export Book can
 * append many chapters into ONE jsPDF document). Behavior identical to the
 * original in exportToPdf.
 */
export async function appendPaperCloneToPdf(
  pdf: jsPDF,
  clone: PaperClone,
  onProgress?: (pageIndex: number, totalPages: number) => void
): Promise<void> {
  const PAGE_CYCLE = clone.pageConfig.height + clone.pageConfig.gap;
  const pdfWpt = clone.pageConfig.width * PX_TO_PT;
  const pdfHpt = clone.pageConfig.height * PX_TO_PT;

  for (let pageIndex = 0; pageIndex < clone.totalPages; pageIndex++) {
    onProgress?.(pageIndex, clone.totalPages);

    if (pageIndex > 0) {
      pdf.addPage([pdfWpt, pdfHpt], 'portrait');
    }

    const canvas = await html2canvas(clone.content, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      // html2canvas adds the element's document bounds to these offsets
      // automatically, so they are element-relative regardless of where the
      // offscreen clone physically sits.
      x: 0,
      y: pageIndex * PAGE_CYCLE,
      width: clone.pageConfig.width,
      height: clone.pageConfig.height,
      scrollX: 0,
      scrollY: 0,
      imageTimeout: 15000,
    });

    pdf.addImage(canvas, 'PNG', 0, 0, pdfWpt, pdfHpt, undefined, 'FAST');
  }
}

export async function exportToPdf(doc: NovelDocument, optionsOrFormat?: ExportPdfOptions | string): Promise<boolean> {
  const options: ExportPdfOptions = typeof optionsOrFormat === 'string'
    ? { pageFormat: optionsOrFormat }
    : (optionsOrFormat || {});

  const cleanTitle = (doc.title || 'Untitled Document').trim();
  const sanitizedFileName = cleanTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'document';
  const pageConfig = getPageFormatConfig(options.pageFormat || activePageFormatGlobal);

  // 1. If running in Electron: use native Electron printToPDF and native Save dialog!
  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.exportPdf === 'function') {
    showExportToast(`Preparing PDF for "${cleanTitle}"...`, 'loading');
    try {
      const fullHtml = buildFullPrintableHtml(doc, options);
      const res = await window.electronAPI.exportPdf({
        title: cleanTitle,
        html: fullHtml,
        pageFormat: options.pageFormat,
      });

      if (res.success) {
        const savedName = res.filePath ? res.filePath.split(/[\\/]/).pop() : `${sanitizedFileName}.pdf`;
        showExportToast(`Saved "${savedName}" successfully!`, 'success');
        return true;
      } else if (res.canceled) {
        showExportToast('PDF export cancelled', 'info');
        return false;
      } else {
        showExportToast(`Export failed: ${res.error || 'Unknown error'}`, 'error');
        return false;
      }
    } catch (electronErr: any) {
      console.error('Electron PDF export failed:', electronErr);
      showExportToast(`Export failed: ${electronErr?.message || 'Error'}`, 'error');
      return false;
    }
  }

  // 2. Web browser / Preview path: page-faithful rendering.
  //    Each editor page is rendered at high resolution and placed on a PDF page
  //    of the exact same size, so pages, text positioning, fonts, sizes,
  //    bold/italics, colors, highlighters, images and captions all survive
  //    pixel-perfect. The full native document is additionally embedded in the
  //    PDF metadata so a later import restores the document losslessly.
  showExportToast(`Preparing PDF for "${cleanTitle}"...`, 'loading', 600000);

  let clone: PaperClone | null = null;
  try {
    clone = await buildPaperClone(doc, pageConfig);

    const pdfWpt = pageConfig.width * PX_TO_PT;
    const pdfHpt = pageConfig.height * PX_TO_PT;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: [pdfWpt, pdfHpt],
      compress: true,
    });

    await appendPaperCloneToPdf(pdf, clone, (pageIndex, totalPages) => {
      showExportToast(
        `Compiling PDF — rendering page ${pageIndex + 1} of ${totalPages}...`,
        'loading',
        600000
      );
    });

    // Embed the full native document into the PDF metadata so that importing
    // this PDF back into Mundus restores it losslessly (pages, colors, images,
    // captions, visual images, fonts — everything).
    try {
      const payload = JSON.stringify({
        version: APP_VERSION,
        formatVersion: 2,
        exportedAt: new Date().toISOString(),
        appName: 'Mundus Writing Studio',
        format: 'mundus_document',
        document: { ...doc },
      });

      if (payload.length <= 12_000_000) {
        pdf.setProperties({
          title: cleanTitle,
          subject: `MUNDUS1:${utf8ToBase64(payload)}`,
          keywords: 'mundus-native-document',
          creator: `Mundus Writing Studio ${APP_VERSION}`,
        });
      } else {
        pdf.setProperties({
          title: cleanTitle,
          keywords: 'mundus-document',
          creator: `Mundus Writing Studio ${APP_VERSION}`,
        });
      }
    } catch (metaErr) {
      console.warn('Failed to embed native payload into PDF metadata:', metaErr);
      try {
        pdf.setProperties({ title: cleanTitle, creator: `Mundus Writing Studio ${APP_VERSION}` });
      } catch (e) {}
    }

    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);

    // 1. Attempt immediate direct download
    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sanitizedFileName}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 1000);
    } catch (autoErr) {
      console.warn('Programmatic download attempt:', autoErr);
    }

    // 2. Display interactive PDF Ready card with 1-click Download and View buttons
    showPdfReadyToast({
      fileName: `${sanitizedFileName}.pdf`,
      blobUrl,
      docTitle: cleanTitle,
    });

    return true;
  } catch (err: any) {
    console.error('PDF export error:', err);
    showExportToast(`Failed to export PDF: ${err?.message || 'Unknown error'}`, 'error');
    return false;
  } finally {
    if (clone) clone.dispose();
  }
}

export async function exportToDocx(doc: NovelDocument) {
  const cleanTitle = doc.title || 'Untitled Document';
  const html = doc.content || `<p>${doc.plainText}</p>`;

  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: cleanTitle,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
    ...htmlToDocxParagraphs(html),
  ];

  const docxFile = new Document({
    sections: [{
      properties: {},
      children: paragraphs,
    }],
  });

  const blob = await Packer.toBlob(docxFile);
  const safeFilename = `${cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * v0.8.3: the v0.8.1 DOCX converter extracted verbatim so Export Book can
 * chain many chapters through the exact same HTML→Word pipeline. Walks the
 * content tree recursively so a Mundus document lands in Word with the same
 * structure: headings, bold/italic/underline/strike (nested to any depth),
 * text colors, highlighter shading, bullet/numbered lists, inline images
 * (data URLs), and manual page breaks. Returns the document body paragraphs
 * WITHOUT a title block.
 */
export function htmlToDocxParagraphs(html: string): Paragraph[] {
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(html, 'text/html');

  /* ------------------------------------------------------------------
   * v0.8.1 DOCX EXPORT REWRITE.
   * The v0.7.x converter only handled flat top-level blocks and
   * single-level inline runs (no nested formatting, no lists, no colors,
   * no highlighters, no images). The rewrite walks the content tree
   * recursively so a Mundus document lands in Word with the same
   * structure: headings, bold/italic/underline/strike (nested to any
   * depth), text colors, highlighter shading, bullet/numbered lists,
   * inline images (data URLs), and manual page breaks.
   * ------------------------------------------------------------------ */

  /** "rgb(21, 128, 61)" / "#15803d" → "15803D" (docx wants hex, no #). */
  const colorToHex = (color: string): string | null => {
    if (!color) return null;
    const c = color.trim();
    if (c.startsWith('#')) {
      const hex = c.slice(1);
      return /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
    }
    const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) {
      const to2 = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
      return `${to2(m[1])}${to2(m[2])}${to2(m[3])}`.toUpperCase();
    }
    return null;
  };

  interface InlineStyle {
    bold?: boolean;
    italics?: boolean;
    underline?: boolean;
    strike?: boolean;
    color?: string;   // docx hex
    shading?: string; // docx hex fill
  }

  /** Merge styles down the inline tree (outer style + inner overrides). */
  const computeInline = (el: Element, inherited: InlineStyle): InlineStyle => {
    const style: InlineStyle = { ...inherited };
    const tag = el.tagName.toLowerCase();
    if (tag === 'strong' || tag === 'b') style.bold = true;
    if (tag === 'em' || tag === 'i') style.italics = true;
    if (tag === 'u') style.underline = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') style.strike = true;
    if (tag === 'font') {
      const c = el.getAttribute('color');
      if (c) style.color = colorToHex(c) || style.color;
    }
    const html = el as HTMLElement;
    if (html.style) {
      const fw = html.style.fontWeight;
      if (fw && (fw === 'bold' || parseInt(fw, 10) >= 600)) style.bold = true;
      if (html.style.fontStyle === 'italic') style.italics = true;
      const td = html.style.textDecorationLine || html.style.textDecoration || '';
      if (/\bunderline\b/i.test(td)) style.underline = true;
      if (/\bline-through\b/i.test(td)) style.strike = true;
      const colorHex = colorToHex(html.style.color || '');
      if (colorHex) style.color = colorHex;
      const bgHex = colorToHex(html.style.backgroundColor || '');
      if (bgHex && bgHex !== 'FFFFFF') style.shading = bgHex;
    }
    if (el.hasAttribute('data-mundus-hl')) {
      const bgHex = colorToHex((el as HTMLElement).style?.backgroundColor || '');
      if (bgHex) style.shading = bgHex;
    }
    return style;
  };

  const inlineRunsFrom = (node: Node, style: InlineStyle): ParagraphChild[] => {
    const runs: ParagraphChild[] = [];
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.nodeValue || '').replace(/\u200B/g, '');
        if (!text) return;
        runs.push(new TextRun({
          text,
          bold: style.bold || undefined,
          italics: style.italics || undefined,
          underline: style.underline ? {} : undefined,
          strike: style.strike || undefined,
          color: style.color || undefined,
          shading: style.shading ? { type: ShadingType.CLEAR, fill: style.shading } : undefined,
        }));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'br') {
          runs.push(new TextRun({ text: '', break: 1 }));
          return;
        }
        if (tag === 'img') {
          const src = el.getAttribute('src') || '';
          const dataUrlMatch = src.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s);
          if (dataUrlMatch) {
            try {
              const mime = dataUrlMatch[1].toLowerCase();
              const docxType = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : mime.includes('bmp') ? 'bmp' : 'jpg';
              const bytes = Uint8Array.from(atob(dataUrlMatch[2]), (ch) => ch.charCodeAt(0));
              const rawW = parseInt(el.getAttribute('width') || '0', 10) || 400;
              const rawH = parseInt(el.getAttribute('height') || '0', 10) || Math.round(rawW * 0.6);
              const scale = Math.min(1, 450 / Math.max(rawW, 1));
              runs.push(new ImageRun({
                type: docxType,
                data: bytes,
                transformation: { width: Math.max(32, Math.round(rawW * scale)), height: Math.max(24, Math.round(rawH * scale)) },
              } as any));
            } catch { /* unreadable image — skip, text flows on */ }
          }
          return;
        }
        const next = computeInline(el, style);
        runs.push(...inlineRunsFrom(el, next));
      }
    });
    return runs;
  };

  const headingFor = (tag: string): (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined => {
    if (tag === 'h1') return HeadingLevel.HEADING_1;
    if (tag === 'h2') return HeadingLevel.HEADING_2;
    if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return HeadingLevel.HEADING_3;
    return undefined;
  };

  const paragraphs: Paragraph[] = [];

  const pushRunsAsParagraph = (runs: ParagraphChild[], base: Partial<{ heading: ReturnType<typeof headingFor>; indentLeft: number; bullet: boolean }> = {}) => {
    if (runs.length === 0) return;
    paragraphs.push(new Paragraph({
      children: runs,
      ...(base.heading ? { heading: base.heading } : {}),
      ...(base.indentLeft ? { indent: { left: base.indentLeft } } : {}),
      ...(base.bullet ? { bullet: { level: 0 } } : {}),
      spacing: { line: 360, after: base.bullet || base.indentLeft ? 60 : 120 },
    }));
  };

  /** Recursively turns block-level nodes into docx paragraphs. */
  const walkBlocks = (parent: Node, indentLeft = 0) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.nodeValue || '').replace(/\u200B/g, '').trim();
        if (text) pushRunsAsParagraph([new TextRun({ text })]);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (el.classList?.contains('mundus-manual-page-break')) {
        paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
        return;
      }
      // Visual-image portals: the saved content keeps them EMPTY
      // (cleanHtmlForSaving strips portal children) — skip silently.
      if (el.hasAttribute?.('data-visual-image-id')) return;

      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        const runs = inlineRunsFrom(el, {});
        if (runs.length) pushRunsAsParagraph(runs, { heading: headingFor(tag) });
        else pushRunsAsParagraph([new TextRun({ text: el.textContent || '' })], { heading: headingFor(tag) });
        return;
      }
      if (tag === 'p') {
        const runs = inlineRunsFrom(el, {});
        if (runs.length) pushRunsAsParagraph(runs);
        return;
      }
      if (tag === 'blockquote') {
        const runs = inlineRunsFrom(el, { italics: true });
        if (runs.length) pushRunsAsParagraph(runs, { indentLeft: 720 });
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        const wasOl = tag === 'ol';
        let idx = 0;
        el.querySelectorAll(':scope > li').forEach((li) => {
          idx += 1;
          const runs = inlineRunsFrom(li, {});
          if (wasOl) {
            const numbered: ParagraphChild[] = [new TextRun({ text: `${idx}. `, bold: false }), ...runs];
            pushRunsAsParagraph(numbered, { indentLeft: 360 });
          } else {
            pushRunsAsParagraph(runs.length ? runs : [new TextRun({ text: li.textContent || '' })], { bullet: true });
          }
        });
        return;
      }
      if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'body') {
        walkBlocks(el, indentLeft);
        return;
      }
      // Unknown inline-ish node with text → its own paragraph.
      const text = el.textContent?.trim();
      if (text) pushRunsAsParagraph(inlineRunsFrom(el, {}));
    });
  };

  walkBlocks(htmlDoc.body);

  return paragraphs;
}
