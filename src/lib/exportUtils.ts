import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, ImageRun, PageBreak, ShadingType, LineRuleType, type ParagraphChild } from 'docx';
// v0.8.61: unified file delivery — on Android, blob: anchor downloads are
// silently ignored by the WebView, so every export now routes through
// downloadBlob (native MediaStore save) and openGeneratedFile (viewer intent).
import { downloadBlob, openGeneratedFile, canUseNativeSave } from './download';
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
  /** v0.8.61: the generated blob — enables native save/view on Android. */
  blob?: Blob;
  mime?: string;
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

  // v0.8.61 ANDROID: anchor downloads and target=_blank blob: links are both
  // silently ignored inside the WebView. When the blob is available and the
  // native bridge exists, the buttons deliver through MundusNative instead:
  // Download → MediaStore Downloads, View → FileProvider viewer intent.
  const nativeReady = canUseNativeSave() && !!options.blob;
  const downloadBtn = document.getElementById('mundus-toast-download-btn');
  if (downloadBtn) {
    downloadBtn.onclick = (ev) => {
      if (nativeReady && options.blob) {
        ev.preventDefault();
        void downloadBlob(options.blob, options.fileName, options.mime || 'application/pdf').then((res) => {
          if (res.ok) {
            showExportToast(`Saved "${options.fileName}" to Downloads`, 'success');
          } else {
            showExportToast(`Could not save: ${res.error || 'unknown error'}`, 'error');
          }
        });
      }
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 3500);
    };
  }

  // v0.8.61: View — native viewer intent on Android, new tab elsewhere.
  const viewBtn = document.getElementById('mundus-toast-view-btn');
  if (viewBtn) {
    viewBtn.onclick = (ev) => {
      if (nativeReady && options.blob) {
        ev.preventDefault();
        void openGeneratedFile(options.blob, options.fileName, options.mime || 'application/pdf');
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
        }, 1500);
      }
      // Non-native: the anchor default (target=_blank blob: URL) fires as before.
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
    const portalIdsSeen = new Set<string>();
    const figures = parsedDoc.querySelectorAll('[data-visual-image-id]');
    figures.forEach((fig) => {
      const imgId = fig.getAttribute('data-visual-image-id');
      const imgData = imgId ? visualMap.get(imgId) : null;
      if (imgData && imgData.url) {
        portalIdsSeen.add(imgData.id);
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

    // v0.8.4: portal nodes can be missing from saved content (the editor
    // re-creates them on load via VisualImageOverlay.syncPortals) — mirror
    // the paper-clone pipeline here so EVERY visual image reaches the
    // printed/PDF/EPUB output, appended at the end of the flow.
    visualImages.forEach((imgData) => {
      if (!imgData || !imgData.url || portalIdsSeen.has(imgData.id)) return;
      const widthStyle = imgData.width ? `max-width: min(${imgData.width}px, 100%);` : 'max-width: 100%;';
      const alignSelf = imgData.alignment === 'left' ? 'flex-start' : imgData.alignment === 'right' ? 'flex-end' : 'center';
      const fig = parsedDoc.createElement('figure');
      fig.setAttribute('data-visual-image-id', imgData.id);
      fig.innerHTML = `
        <div style="display: inline-flex; flex-direction: column; align-items: center; ${widthStyle} width: fit-content; text-align: center;">
          <img src="${imgData.url}" alt="${imgData.caption || ''}" style="max-width: 100%; height: auto; display: block; border-radius: 4px;" />
          ${imgData.caption ? `<figcaption style="font-size: 9pt; color: #555; margin-top: 6px; font-style: italic; text-align: center; display: block; width: 100%; word-break: break-word;">${imgData.caption}</figcaption>` : ''}
        </div>
      `;
      fig.setAttribute('style', `margin: 1.5em 0; display: flex; flex-direction: column; align-items: ${alignSelf}; clear: both; width: 100%;`);
      parsedDoc.body.appendChild(fig);
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
  const fileName = `${cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
  // v0.8.61: shared delivery (Android WebView ignores anchor downloads).
  // v0.8.62: delivery failures are surfaced, not swallowed.
  void downloadBlob(blob, fileName).then((result) => {
    if (result.ok) {
      showExportToast(result.method === 'native' ? `Saved "${fileName}" to Downloads` : `Exported "${fileName}"`, 'success');
    } else {
      showExportToast(`Export failed: ${result.error || 'Could not deliver the file'}`, 'error');
    }
  }).catch((err) => {
    console.error('[Mundus] Markdown export failed:', err);
    showExportToast(`Export failed: ${err?.message || 'Unknown error'}`, 'error');
  });
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
  // v0.8.61: shared delivery — Android saves to the Downloads folder natively.
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const result = await downloadBlob(blob, safeFilename);
  if (result.ok) {
    showExportToast(`Exported "${safeFilename}"`, 'success');
    return true;
  }
  showExportToast(`Export failed: ${result.error || 'Could not deliver the file'}`, 'error');
  return false;
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

  let fullHtml = '';
  try {
    fullHtml = buildNativeFormattedHtml(doc, options);
  } catch (err: any) {
    // v0.8.62: HTML generation must never die silently (unhandled throw =
    // the user sees "Export does nothing").
    console.error('[Mundus] HTML export failed:', err);
    showExportToast(`Export failed: ${err?.message || 'HTML build error'}`, 'error');
    return false;
  }

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  // v0.8.61: shared delivery — Android saves to the Downloads folder natively.
  // v0.8.62: the success toast now waits for the real delivery result.
  void downloadBlob(blob, safeFilename).then((result) => {
    if (result.ok) {
      showExportToast(result.method === 'native' ? `Saved "${safeFilename}" to Downloads` : `Exported formatted document "${safeFilename}"`, 'success');
    } else {
      showExportToast(`Export failed: ${result.error || 'Could not deliver the file'}`, 'error');
    }
  }).catch((err) => {
    console.error('[Mundus] HTML delivery failed:', err);
    showExportToast(`Export failed: ${err?.message || 'Unknown error'}`, 'error');
  });
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
    // v0.8.61: side padding shares the MUNDUS_PAGE_SIDE_PADDING_PX constant
    // with buildMundusDocxSectionProperties so DOCX margins match exactly.
    `padding: ${pageConfig.topMargin}px ${MUNDUS_PAGE_SIDE_PADDING_PX}px ${pageConfig.bottomMargin}px ${MUNDUS_PAGE_SIDE_PADDING_PX}px`,
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
  onProgress?: (pageIndex: number, totalPages: number) => void,
  opts?: { firstPageAlreadyPresent?: boolean }
): Promise<void> {
  const PAGE_CYCLE = clone.pageConfig.height + clone.pageConfig.gap;
  const pdfWpt = clone.pageConfig.width * PX_TO_PT;
  const pdfHpt = clone.pageConfig.height * PX_TO_PT;

  for (let pageIndex = 0; pageIndex < clone.totalPages; pageIndex++) {
    onProgress?.(pageIndex, clone.totalPages);

    // v0.8.4: when appending a SECOND+ clone into the same jsPDF (Export
    // Book), the clone's FIRST page must also add a page — otherwise it
    // overwrites whatever is already on page 1 and the whole book
    // collapses into a single page (web/Android path regression).
    if (pageIndex > 0 || opts?.firstPageAlreadyPresent) {
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

    // v0.8.61: on Android the WebView silently ignores anchor downloads, so
    // the old "direct download" attempt did nothing at all. There the file is
    // NOT auto-saved — the PDF-Ready card below performs the native save (and
    // offers View through the system viewer). Desktop/web keep the old
    // instant-download + card flow.
    if (!canUseNativeSave()) {
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
    }

    // Display interactive PDF Ready card with 1-click Download and View buttons
    showPdfReadyToast({
      fileName: `${sanitizedFileName}.pdf`,
      blobUrl,
      docTitle: cleanTitle,
      // v0.8.61: the blob itself, so the card can deliver through the native
      // bridge (save to Downloads / open in a viewer) on Android.
      blob: pdfBlob,
      mime: 'application/pdf',
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

/* ------------------------------------------------------------------ */
/* v0.8.4 — DOCX export rewrite: real heading colors + image embedding */
/* ------------------------------------------------------------------ */

/**
 * v0.8.61: side padding (CSS px) of the app's paper pages — single source of
 * truth shared by the paper clone (buildPaperClone) and the DOCX section
 * margins (buildMundusDocxSectionProperties) so both stay in sync.
 */
const MUNDUS_PAGE_SIDE_PADDING_PX = 56;

/**
 * v0.8.61: the section properties every Mundus DOCX export uses — REAL page
 * size and margins that mirror the app's paper pages, instead of Word's own
 * defaults. Without this, Word picked Letter/default 1-inch margins and its
 * own line flow, so every page had "a bunch of available lines" at the bottom
 * compared to the same page in the app. All values are CSS px × 15 = twips
 * (1px = 1/96in = 15 twips at the editor's 96dpi geometry).
 */
export function buildMundusDocxSectionProperties(pageFormat?: string | null) {
  const cfg = getPageFormatConfig(pageFormat || activePageFormatGlobal);
  const PX = 15;
  return {
    page: {
      size: {
        width: Math.round(cfg.width * PX),
        height: Math.round(cfg.height * PX),
      },
      margin: {
        top: Math.round(cfg.topMargin * PX),
        // Side padding of the app's paper pages (see buildPaperClone).
        right: Math.round(MUNDUS_PAGE_SIDE_PADDING_PX * PX),
        bottom: Math.round(cfg.bottomMargin * PX),
        left: Math.round(MUNDUS_PAGE_SIDE_PADDING_PX * PX),
      },
    },
  };
}

/**
 * v0.8.61: per-block metrics measured from the paper clone so DOCX line
 * spacing EXACTLY matches what the author sees (line heights and paragraph
 * gaps come from the app's CSS — e.g. Lora 16px × 1.8 = 28.8px per line).
 * Values are CSS px; the DOCX builder converts to twips (× 15).
 */
export interface MundusDocxMetrics {
  bodyLinePx: number;
  bodyGapPx: number;
  h1LinePx: number;
  h2LinePx: number;
  h3LinePx: number;
}

/** Defaults mirroring index.css (.novel-editor p at 16px, line-height 1.8). */
const DEFAULT_DOCX_METRICS: MundusDocxMetrics = {
  bodyLinePx: 28.8,
  bodyGapPx: 17.6,
  h1LinePx: 42,
  h2LinePx: 33.3,
  h3LinePx: 28.1,
};

/**
 * Probes the clone's computed styles for the exact metrics above. Runs while
 * the paper clone is attached (before dispose), so user font/theme settings
 * that reach the clone are honored automatically.
 */
function measureDocxMetrics(cloneRoot: HTMLElement): MundusDocxMetrics {
  const read = (tag: string): { line: number; gap: number; size: number } => {
    try {
      const el = cloneRoot.querySelector(tag) as HTMLElement | null;
      if (el) {
        const cs = getComputedStyle(el);
        return {
          line: parseFloat(cs.lineHeight) || 0,
          gap: parseFloat(cs.marginBottom) || 0,
          size: parseFloat(cs.fontSize) || 0,
        };
      }
    } catch { /* measurement is best-effort */ }
    return { line: 0, gap: 0, size: 0 };
  };
  const p = read('p');
  const h1 = read('h1');
  const h2 = read('h2');
  const h3 = read('h3');
  return {
    bodyLinePx: p.line || DEFAULT_DOCX_METRICS.bodyLinePx,
    bodyGapPx: p.gap || DEFAULT_DOCX_METRICS.bodyGapPx,
    h1LinePx: h1.line || DEFAULT_DOCX_METRICS.h1LinePx,
    h2LinePx: h2.line || DEFAULT_DOCX_METRICS.h2LinePx,
    h3LinePx: h3.line || DEFAULT_DOCX_METRICS.h3LinePx,
  };
}

/**
 * Word's built-in Heading 1-6 styles render Calibri Light BLUE. Mundus
 * documents are books, not corporate memos — these style definitions
 * override the built-ins (via styles.default.headingN, the docx library's
 * supported mechanism — paragraphStyles duplicates would be shadowed by the
 * library's own blue defaults) so every heading prints black, bold and
 * sized like a book chapter while KEEPING the outline structure Word needs
 * for its Navigation pane and TOC fields.
 */
export function buildMundusDocxStyles() {
  const mk = (size: number, before: number, after: number) => ({
    run: { size, bold: true, color: '000000' },
    paragraph: { spacing: { before, after } },
  });
  return {
    default: {
      heading1: mk(36, 320, 160), // 18pt
      heading2: mk(30, 280, 140), // 15pt
      heading3: mk(27, 240, 120), // 13.5pt
      heading4: mk(24, 240, 120), // 12pt
      heading5: mk(23, 200, 100),
      heading6: mk(22, 200, 100),
    },
  };
}

export interface MundusDocxImage {
  bytes: Uint8Array;
  type: 'png' | 'jpg' | 'gif' | 'bmp';
  widthPx: number;
  heightPx: number;
}

/** Display cap (CSS px) for images inside DOCX exports. */
const DOCX_IMAGE_MAX_DISPLAY_PX = 600;
/**
 * v0.8.5: sniff the REAL image format from leading magic bytes. Mime strings
 * and data-URL subtypes routinely lie (empty Content-Type from CDNs, servers
 * serving webp under image/jpeg, …) and a misdeclared type makes Word render
 * a broken-image placeholder — the user-visible "images don't show properly".
 */
function sniffImageFormat(
  bytes: Uint8Array
): 'png' | 'jpg' | 'gif' | 'bmp' | 'webp' | 'avif' | 'heic' | 'svg' | null {
  if (bytes.length >= 12) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) return 'webp';
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      // ISO-BMFF "ftyp" box: brand decides avif vs heic-family
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (brand.startsWith('avi')) return 'avif';
      return 'heic';
    }
  } else if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
  }
  // SVG is textual; allow BOM/xml-decl/comment/whitespace before <svg>
  try {
    const head = new TextDecoder('utf-8', { fatal: false })
      .decode(bytes.subarray(0, Math.min(bytes.length, 512)))
      .trim()
      .toLowerCase();
    if (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--')) {
      if (head.includes('<svg')) return 'svg';
    }
  } catch (e) {}
  return null;
}

const DOCX_REENCODE_MAX_DIM = 1600;

/**
 * v0.8.5: decode ANY browser-supported image (webp, avif, svg, …) and
 * re-encode it as PNG so Word can embed it. Previously such images were
 * silently dropped — the "images are not included" half of the v0.8.5
 * report (ImgBB keeps the original upload format, so webp uploads were
 * the norm for some authors). Downscaled to DOCX_REENCODE_MAX_DIM on the
 * long edge to bound the DOCX size; the display size was already capped
 * at 600px, so this loses no visible quality.
 */
async function reencodeImageToPng(
  bytes: Uint8Array
): Promise<{ bytes: Uint8Array; widthPx: number; heightPx: number } | null> {
  try {
    if (typeof document === 'undefined') return null;
    const blob = new Blob([new Uint8Array(bytes)]);
    let natW = 0;
    let natH = 0;
    let bitmap: ImageBitmap | null = null;
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(blob);
        natW = bitmap.width || 0;
        natH = bitmap.height || 0;
      } catch (e) {
        bitmap = null;
      }
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      try { bitmap?.close(); } catch (e) {}
      return null;
    }
    if (bitmap) {
      const baseW = natW || 800;
      const baseH = natH || 600;
      const scale = Math.min(1, DOCX_REENCODE_MAX_DIM / Math.max(baseW, baseH));
      canvas.width = Math.max(1, Math.round(baseW * scale));
      canvas.height = Math.max(1, Math.round(baseH * scale));
      ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      try { bitmap.close(); } catch (e) {}
    } else {
      // <img> fallback (SVG and engines without createImageBitmap)
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => reject(new Error('image-decode-failed'));
          im.src = url;
        });
        const baseW = img.naturalWidth || 800;
        const baseH = img.naturalHeight || 600;
        const scale = Math.min(1, DOCX_REENCODE_MAX_DIM / Math.max(baseW, baseH));
        canvas.width = Math.max(1, Math.round(baseW * scale));
        canvas.height = Math.max(1, Math.round(baseH * scale));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const outBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    if (!outBlob) return null;
    const out = new Uint8Array(await outBlob.arrayBuffer());
    if (!out.length) return null;
    return { bytes: out, widthPx: canvas.width, heightPx: canvas.height };
  } catch (e) {
    return null;
  }
}

/** Image types Word can actually render via ImageRun. */
const DOCX_SUPPORTED_IMAGE_MIMES = ['png', 'jpeg', 'jpg', 'gif', 'bmp'];

function docxImageTypeFromMime(mime: string): 'png' | 'jpg' | 'gif' | 'bmp' {
  const m = (mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('gif')) return 'gif';
  if (m.includes('bmp')) return 'bmp';
  return 'jpg';
}

async function decodeImageDimensions(bytes: Uint8Array): Promise<{ w: number; h: number }> {
  try {
    if (typeof createImageBitmap === 'function') {
      const copy = new Uint8Array(bytes); // decoding may detach the source buffer
      const bitmap = await createImageBitmap(new Blob([copy]));
      const dims = { w: bitmap.width || 0, h: bitmap.height || 0 };
      try { bitmap.close(); } catch (e) {}
      if (dims.w && dims.h) return dims;
    }
  } catch (e) {}
  // Fallback: decode via an <img> element from a base64 data URL
  try {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
    }
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = `data:image;base64,${btoa(binary)}`;
    });
    if (dims.w && dims.h) return dims;
  } catch (e) {}
  return { w: 0, h: 0 };
}

async function fetchRemoteImage(src: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    return { bytes: new Uint8Array(buf), mime: blob.type || '' };
  } catch (e) {
    return null;
  }
}

/**
 * Resolves an image source (data URL or remote http(s) URL) into docx-ready
 * bytes + pixel dimensions. Returns null when the image cannot be used
 * (network failure, truly undecodable bytes).
 *
 * v0.8.5: the declared mime / data-URL subtype is only a HINT — the real
 * format comes from magic-byte sniffing, and anything Word cannot embed
 * natively (webp, avif, heic, svg, unknown-but-decodable) is re-encoded to
 * PNG via canvas instead of being dropped. This is what actually fixes
 * "DOCX has no images" for ImgBB-hosted webp uploads and "broken image"
 * placeholders for mislabeled responses.
 * Width/height hints (from attributes or saved visual-image sizes) win over
 * natural dimensions so the author's chosen size is respected.
 */
export async function resolveDocxImageAsset(
  src: string,
  widthHint?: number,
  heightHint?: number
): Promise<MundusDocxImage | null> {
  if (!src) return null;
  let bytes: Uint8Array | null = null;
  let mime = '';

  const dataMatch = src.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (dataMatch) {
    try {
      mime = `image/${dataMatch[1].toLowerCase()}`;
      bytes = Uint8Array.from(atob(dataMatch[2]), (ch) => ch.charCodeAt(0));
    } catch (e) {
      return null;
    }
  } else if (/^https?:\/\//i.test(src)) {
    const fetched = await fetchRemoteImage(src);
    if (!fetched) return null;
    bytes = fetched.bytes;
    mime = fetched.mime;
  } else if (/^blob:/i.test(src)) {
    // v0.8.61: images the author inserted THIS SESSION are referenced by blob:
    // URLs (file picker / paste). Those URLs are fetchable while the document
    // is open — previously they were rejected wholesale, which is exactly the
    // "images still don't appear in exported docx" report. Dead blob: URLs
    // (document reloaded, URL revoked) still fail the fetch and are skipped.
    const fetched = await fetchRemoteImage(src);
    if (!fetched || !fetched.bytes || fetched.bytes.length === 0) return null;
    bytes = fetched.bytes;
    mime = fetched.mime;
  } else {
    return null; // file: and garbage sources have no place in a saved file
  }

  if (!bytes || bytes.length === 0) return null;

  // Decide the embedding strategy from the BYTES first, mime second.
  const sniffed = sniffImageFormat(bytes);
  const mimeLower = (mime || '').toLowerCase();
  const mimeSupported = DOCX_SUPPORTED_IMAGE_MIMES.some((m) => mimeLower.includes(m));

  const isWordNative = (fmt: string | null): fmt is MundusDocxImage['type'] =>
    fmt === 'png' || fmt === 'jpg' || fmt === 'gif' || fmt === 'bmp';

  let nativeType: MundusDocxImage['type'] | null = null;
  if (isWordNative(sniffed)) {
    nativeType = sniffed;
  } else if (!sniffed && mimeSupported) {
    // Bytes unrecognized but mime claims a Word-native type (rare exotic
    // variants like extended jpg markers) — trust the mime like pre-v0.8.5.
    nativeType = docxImageTypeFromMime(mimeLower);
  }

  if (!nativeType) {
    // webp / avif / heic / svg / unknown → try to convert, drop only if the
    // browser cannot decode the bytes at all.
    const converted = await reencodeImageToPng(bytes);
    if (!converted) {
      console.warn('[Mundus DOCX] image could not be decoded for embedding, skipped:', src.slice(0, 80));
      return null;
    }
    bytes = converted.bytes;
    const hintedW = widthHint && widthHint > 0 ? widthHint : 0;
    const hintedH = heightHint && heightHint > 0 ? heightHint : 0;
    return {
      bytes,
      type: 'png',
      widthPx: hintedW && hintedH ? hintedW : converted.widthPx,
      heightPx: hintedW && hintedH ? hintedH : converted.heightPx,
    };
  }

  const hintedW = widthHint && widthHint > 0 ? widthHint : 0;
  const hintedH = heightHint && heightHint > 0 ? heightHint : 0;
  let w = 0;
  let h = 0;
  if (hintedW && hintedH) {
    w = hintedW;
    h = hintedH;
  } else {
    const natural = await decodeImageDimensions(bytes);
    w = natural.w;
    h = natural.h;
  }
  if (!w || !h) {
    w = hintedW || 400;
    h = hintedH || Math.round(w * 0.6);
  }
  return { bytes, type: nativeType, widthPx: w, heightPx: h };
}

/**
 * Display size for an embedded image, in the shape docx@9's ImageRun expects:
 * `transformation: { width, height }`.
 *
 * v0.8.62 CRITICAL FIX: this used to return `{ w, h }`, which docx silently
 * read as `undefined` — the EMU math produced `<wp:extent cx="NaN" cy="NaN"/>`
 * in every drawing. Word Online refuses to render NaN-extent drawings
 * ("Unable to load: picture") while lenient readers (Moon Reader) fall back
 * to a default square-ish frame — EXACTLY the two-platform report. Same
 * clamp/cap behavior as before, just with the correct property names.
 */
function docxDisplaySize(asset: MundusDocxImage, widthHint: number): { width: number; height: number } {
  const natW = asset.widthPx || 0;
  const natH = asset.heightPx || 0;
  let display = widthHint && widthHint > 0 ? Math.min(widthHint, natW || widthHint) : natW;
  if (!display || display <= 0) display = 400;
  display = Math.min(display, DOCX_IMAGE_MAX_DISPLAY_PX);
  const height = natW && natH ? Math.round(display * (natH / natW)) : Math.round(display * 0.6);
  return { width: Math.max(32, Math.round(display)), height: Math.max(24, height) };
}

/**
 * v0.8.4: async, image-aware DOCX converter (evolution of the v0.8.1
 * sync converter, which only handled data-URL images and silently dropped
 * everything else). Changes in this version:
 *  - Visual-image portals (saved EMPTY in content) are populated from the
 *    document's visualImages array — converted into figure blocks with the
 *    saved width + caption, exactly like the PDF/paper pipeline does.
 *    Portals missing from saved content are appended at the end (mirrors
 *    the editor's VisualImageOverlay.syncPortals behavior).
 *  - ALL images (inline + portal) resolve through resolveDocxImageAsset:
 *    data URLs decode directly, remote http(s) URLs are fetched and
 *    embedded so DOCX exports carry real images instead of dropping them.
 *  - Headings seeded with black + bold so authored colors still override
 *    while Word's blue never leaks through (style overrides alone are not
 *    honored by every Word viewer).
 * Structure otherwise matches the v0.8.1 walker: headings, nested
 * bold/italic/underline/strike, text colors, highlighter shading, lists,
 * manual page breaks. Returns body paragraphs WITHOUT a title block.
 */
export async function htmlToDocxParagraphsAsync(
  html: string,
  visualImages?: DocumentVisualImage[],
  opts?: { skipAppendMissingPortals?: boolean; metrics?: MundusDocxMetrics }
): Promise<Paragraph[]> {
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(html || '', 'text/html');
  const body = htmlDoc.body;

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
    color?: string;
    shading?: string;
  }

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
          const asset = resolvedImages.get(el);
          if (asset) {
            const hint = widthHints.get(el) || 0;
            const size = docxDisplaySize(asset, hint);
            // v0.8.62: transformation uses { width, height } (docx@9 API) and
            // carries an altText so viewers show a meaningful placeholder.
            runs.push(new ImageRun({
              type: asset.type,
              data: asset.bytes,
              transformation: size,
              altText: {
                title: 'Illustration',
                description: 'Illustration',
                name: 'Illustration',
              },
            } as any));
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

  // v0.8.61: line spacing + paragraph gaps mirror the app's paper pages
  // (measured from the paper clone, see measureDocxMetrics) so every DOCX
  // page fills exactly as much vertical space as the same page in the app.
  const metrics = opts?.metrics || DEFAULT_DOCX_METRICS;
  const PX_TO_TWIPS = 15;
  const bodyLineTwips = Math.round(metrics.bodyLinePx * PX_TO_TWIPS);
  const bodyGapTwips = Math.round(metrics.bodyGapPx * PX_TO_TWIPS);
  const headingLineTwips = (level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): number => {
    const px = level === HeadingLevel.HEADING_1 ? metrics.h1LinePx : level === HeadingLevel.HEADING_2 ? metrics.h2LinePx : metrics.h3LinePx;
    return Math.round(px * PX_TO_TWIPS);
  };

  const pushRunsAsParagraph = (runs: ParagraphChild[], base: Partial<{ heading: ReturnType<typeof headingFor>; indentLeft: number; bullet: boolean; center: boolean }> = {}) => {
    if (runs.length === 0) return;
    paragraphs.push(new Paragraph({
      children: runs,
      ...(base.heading ? { heading: base.heading } : {}),
      ...(base.indentLeft ? { indent: { left: base.indentLeft } } : {}),
      ...(base.bullet ? { bullet: { level: 0 } } : {}),
      ...(base.center ? { alignment: AlignmentType.CENTER } : {}),
      spacing: base.heading
        // Headings: measured line height; before/after margins keep coming
        // from the Heading styles (buildMundusDocxStyles) as before.
        ? { line: headingLineTwips(base.heading), lineRule: LineRuleType.AT_LEAST }
        : { line: bodyLineTwips, lineRule: LineRuleType.AT_LEAST, after: base.bullet || base.indentLeft ? 60 : bodyGapTwips },
    }));
  };

  /** Block-level image → centered paragraph; caption → small italic line. */
  const pushImageBlock = (imgEl: Element, caption?: string | null) => {
    const asset = resolvedImages.get(imgEl);
    if (!asset) return;
    const hint = widthHints.get(imgEl) || 0;
    const size = docxDisplaySize(asset, hint);
    const alt = (caption || '').trim() || 'Illustration';
    paragraphs.push(new Paragraph({
      // v0.8.62: transformation uses { width, height } — the { w, h } shape
      // produced NaN extents and Word Online's "Unable to load: picture".
      children: [new ImageRun({ type: asset.type, data: asset.bytes, transformation: size, altText: { title: alt, description: alt, name: alt } } as any)],
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: caption ? 80 : 240 },
    }));
    if (caption && caption.trim()) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: caption.trim(), italics: true, size: 18, color: '555555' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
      }));
    }
  };

  /* ---- 1. Populate visual-image portals (they are saved EMPTY) ------- */
  const visualMap = new Map<string, DocumentVisualImage>();
  (visualImages || []).forEach((img) => {
    if (img && img.id && img.url) visualMap.set(img.id, img);
  });
  const portalIdsSeen = new Set<string>();

  body.querySelectorAll('[data-visual-image-id]').forEach((portal) => {
    const imgData = visualMap.get(portal.getAttribute('data-visual-image-id') || '');
    if (!imgData) {
      portal.remove(); // portal without a matching image — nothing to render
      return;
    }
    portalIdsSeen.add(imgData.id);
    const figure = htmlDoc.createElement('figure');
    figure.setAttribute('data-mundus-docx-figure', '1');
    const img = htmlDoc.createElement('img');
    img.setAttribute('src', imgData.url);
    img.setAttribute('alt', imgData.caption || 'Illustration');
    if (imgData.width && imgData.width > 0) {
      img.setAttribute('data-mundus-width', String(imgData.width));
    }
    figure.appendChild(img);
    if (imgData.caption && imgData.caption.trim()) {
      const cap = htmlDoc.createElement('figcaption');
      cap.textContent = imgData.caption.trim();
      figure.appendChild(cap);
    }
    portal.parentNode?.replaceChild(figure, portal);
  });

  // Portals missing from saved content (the editor re-creates them on load
  // via VisualImageOverlay.syncPortals) — mirror that here, appended in flow.
  // v0.8.5: skipped in per-page (paginated) mode — the paper clone already
  // appended missing portals BEFORE pagination, so appending per fragment
  // would duplicate every portal onto the wrong page.
  if (!opts?.skipAppendMissingPortals) {
    (visualImages || []).forEach((imgData) => {
      if (!imgData || !imgData.url || portalIdsSeen.has(imgData.id)) return;
      const figure = htmlDoc.createElement('figure');
      figure.setAttribute('data-mundus-docx-figure', '1');
      const img = htmlDoc.createElement('img');
      img.setAttribute('src', imgData.url);
      img.setAttribute('alt', imgData.caption || 'Illustration');
      if (imgData.width && imgData.width > 0) {
        img.setAttribute('data-mundus-width', String(imgData.width));
      }
      figure.appendChild(img);
      if (imgData.caption && imgData.caption.trim()) {
        const cap = htmlDoc.createElement('figcaption');
        cap.textContent = imgData.caption.trim();
        figure.appendChild(cap);
      }
      body.appendChild(figure);
    });
  }

  /* ---- 2. Resolve every image up-front (parallel) -------------------- */
  const resolvedImages = new Map<Element, MundusDocxImage>();
  const widthHints = new Map<Element, number>();
  const imgEls = Array.from(body.querySelectorAll('img'));
  await Promise.all(imgEls.map(async (img) => {
    const src = img.getAttribute('src') || '';
    const hintW = parseInt(img.getAttribute('data-mundus-width') || img.getAttribute('width') || '0', 10) || 0;
    const hintH = parseInt(img.getAttribute('height') || '0', 10) || 0;
    const asset = await resolveDocxImageAsset(src, hintW || undefined, hintH || undefined);
    if (asset) {
      resolvedImages.set(img, asset);
      if (hintW > 0) widthHints.set(img, hintW);
    }
    // unresolved images are skipped silently; text flows on
  }));

  /* ---- 3. Walk blocks (same structure as the v0.8.1 walker) ---------- */
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

      // v0.8.5: also honor the legacy attribute-only variants the editor
      // queries for (.mundus-page-break[data-manual-page-break] and
      // [data-page-break]) — the class-only check missed imported/older
      // manual breaks entirely.
      if (
        el.classList?.contains('mundus-manual-page-break') ||
        el.hasAttribute('data-manual-page-break') ||
        el.hasAttribute('data-page-break')
      ) {
        paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
        return;
      }
      // v0.8.5: Ctrl+Enter spacer blocks are intentional gaps — approximate
      // each with an empty paragraph instead of silently vanishing.
      if (el.classList?.contains('mundus-spacer')) {
        paragraphs.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        return;
      }
      if (tag === 'figure') {
        const img = el.querySelector('img');
        if (img) pushImageBlock(img, el.querySelector('figcaption')?.textContent || null);
        return;
      }
      if (tag === 'img') {
        pushImageBlock(el, null);
        return;
      }

      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        const runs = inlineRunsFrom(el, { color: '000000', bold: true });
        if (runs.length) pushRunsAsParagraph(runs, { heading: headingFor(tag) });
        else pushRunsAsParagraph([new TextRun({ text: el.textContent || '', bold: true, color: '000000' })], { heading: headingFor(tag) });
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
      if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main') {
        walkBlocks(el, indentLeft);
        return;
      }
      const text = el.textContent?.trim();
      if (text) pushRunsAsParagraph(inlineRunsFrom(el, {}));
    });
  };

  walkBlocks(body);

  return paragraphs;
}

/**
 * v0.8.5: converts a document into DOCX body paragraphs while PRESERVING the
 * virtual page structure the author sees in Writing Mode. The paper clone
 * (same pipeline as the PDF export) runs the editor's own pagination engine,
 * so its `.is-page-start` markers are the exact page boundaries the author
 * sees; every boundary becomes an explicit Word PageBreak paragraph. Without
 * this, Word repaginates freely and "the top of the next page ends up at the
 * bottom of the previous one".
 *
 * Falls back to the continuous-flow converter when pagination is impossible
 * (no DOM in the current runtime, clone failure) so exports never hard-fail.
 */
export async function buildDocxPageParagraphs(
  doc: NovelDocument,
  pageFormat?: string | null
): Promise<Paragraph[]> {
  const html = doc.content || `<p>${doc.plainText || ''}</p>`;
  try {
    if (typeof document === 'undefined') throw new Error('no-dom');
    const pageConfig = getPageFormatConfig(pageFormat || activePageFormatGlobal);
    const clone = await buildPaperClone(doc, pageConfig);
    // v0.8.61: measure the clone's real line heights/paragraph gaps (while it
    // is attached) so the DOCX mirrors the app's page fill exactly.
    const metrics = measureDocxMetrics(clone.content);
    try {
      const children = Array.from(clone.content.children) as HTMLElement[];
      // Group top-level blocks into pages: every block the pagination engine
      // marked .is-page-start (except the very first) begins a new page.
      const pageGroups: HTMLElement[][] = [];
      let current: HTMLElement[] = [];
      children.forEach((child, i) => {
        const startsPage =
          i > 0 &&
          (child.classList.contains('is-page-start') || child.classList.contains('mundus-page-start'));
        if (startsPage && current.length) {
          pageGroups.push(current);
          current = [];
        }
        current.push(child);
      });
      if (current.length) pageGroups.push(current);
      if (pageGroups.length === 0) throw new Error('empty-clone');

      const paragraphs: Paragraph[] = [];
      for (let p = 0; p < pageGroups.length; p++) {
        if (p > 0) paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
        const frag = document.createElement('div');
        pageGroups[p].forEach((child) => {
          const cloneChild = child.cloneNode(true) as HTMLElement;
          // Manual break markers are redundant here: a manual break always
          // coincides with a page boundary (the engine treats it as a hard
          // break), and the boundary itself already emits the PageBreak —
          // keeping the marker would double-break into blank pages.
          cloneChild.querySelectorAll?.('.mundus-manual-page-break, [data-manual-page-break], [data-page-break]').forEach((m) => m.remove());
          frag.appendChild(cloneChild);
        });
        const pageParas = await htmlToDocxParagraphsAsync(frag.innerHTML, doc.visualImages, {
          skipAppendMissingPortals: true,
          metrics,
        });
        paragraphs.push(...pageParas);
      }
      return paragraphs;
    } finally {
      clone.dispose();
    }
  } catch (e) {
    console.warn('[Mundus DOCX] pagination unavailable, exporting as continuous flow:', e);
    return htmlToDocxParagraphsAsync(html, doc.visualImages);
  }
}

export async function exportToDocx(doc: NovelDocument, optionsOrFormat?: ExportPdfOptions | string) {
  const options: ExportPdfOptions = typeof optionsOrFormat === 'string'
    ? { pageFormat: optionsOrFormat }
    : (optionsOrFormat || {});
  const cleanTitle = doc.title || 'Untitled Document';

  // v0.8.62: the whole DOCX pipeline is now crash-proof. Previously ANY throw
  // here (paper clone, pagination, image decode, Packer…) escaped as an
  // unhandled rejection — no toast, no file, the exact "Export as DOCX does
  // nothing" report from the tablet. Failures are now always surfaced.
  let bodyParagraphs: Paragraph[];
  try {
    bodyParagraphs = await buildDocxPageParagraphs(doc, options.pageFormat ?? null);
  } catch (err) {
    console.error('[Mundus DOCX] page-aware build failed:', err);
    try {
      // Last-resort: continuous-flow conversion without pagination.
      bodyParagraphs = await htmlToDocxParagraphsAsync(doc.content || `<p>${doc.plainText || ''}</p>`, doc.visualImages);
    } catch (err2: any) {
      console.error('[Mundus DOCX] continuous-flow build failed:', err2);
      showExportToast(`Export failed: ${err2?.message || 'DOCX build error'}`, 'error');
      return;
    }
  }

  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: cleanTitle,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
    ...bodyParagraphs,
  ];

  const docxFile = new Document({
    title: cleanTitle,
    creator: 'Mundus Writing Studio',
    styles: buildMundusDocxStyles(),
    // v0.8.61: REAL page size + margins matching the app's paper pages (A4
    // 794×1123px with the app's 64/56/48px padding) instead of Word defaults.
    sections: [{
      properties: buildMundusDocxSectionProperties(options.pageFormat ?? null),
      children: paragraphs,
    }],
  });

  try {
    const blob = await Packer.toBlob(docxFile);
    const safeFilename = `${cleanTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;

    // v0.8.61: shared delivery — on Android this saves into the public
    // Downloads folder via the native bridge (anchor downloads of blob: URLs
    // are silently ignored inside the WebView = the old "export does nothing").
    const result = await downloadBlob(blob, safeFilename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    if (!result.ok) {
      showExportToast(`Export failed: ${result.error || 'Could not deliver the file'}`, 'error');
    } else if (result.method === 'native') {
      showExportToast(`Saved "${safeFilename}" to Downloads`, 'success');
    } else {
      showExportToast(`Exported "${safeFilename}"`, 'success');
    }
  } catch (err: any) {
    console.error('[Mundus DOCX] pack/delivery failed:', err);
    showExportToast(`Export failed: ${err?.message || 'DOCX build error'}`, 'error');
  }
}
