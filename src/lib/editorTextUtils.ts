// High-fidelity plain text extraction and word statistics engine for Mundus
// Prevents words across headings, paragraphs, and block tags from ever fusing together.

/**
 * Extracts clean, human-readable plain text from an active editor DOM element,
 * guaranteeing that block-level boundaries and <br> elements create newline separation.
 */
export function extractPlainTextFromEditor(editor: HTMLElement | null): string {
  if (!editor) return '';

  // In discrete page card mode (Method A), extract text from each page body
  const pageBodies = editor.querySelectorAll('.mundus-page-body');
  if (pageBodies.length > 0) {
    const texts: string[] = [];
    pageBodies.forEach((body) => {
      const t = (body as HTMLElement).innerText || body.textContent || '';
      if (t.trim()) texts.push(t.trim());
    });
    return texts.join('\n\n').replace(/\u00a0/g, ' ');
  }

  // Iterate top-level block children to guarantee that paragraphs, headings, and blockquotes
  // always have strict newline separation and words across lines NEVER fuse together.
  // Note: Avoid clone.innerText because in browsers, detached cloned elements do NOT compute layout and drop newlines!
  const blockChildren = Array.from(editor.children) as HTMLElement[];
  if (blockChildren.length > 0) {
    const lines: string[] = [];
    for (const child of blockChildren) {
      if (child.classList.contains('mundus-page-break') || 
          child.classList.contains('mundus-manual-page-break') || 
          child.classList.contains('mundus-spacer') ||
          child.classList.contains('visual-image-portal-node')) {
        continue;
      }
      const text = extractPlainTextFromHtml(child.innerHTML);
      if (text.length > 0) {
        lines.push(text);
      }
    }
    if (lines.length > 0) {
      return lines.join('\n\n').replace(/\u00a0/g, ' ');
    }
  }

  // Fallback for direct HTML content or editor without child blocks
  return extractPlainTextFromHtml(editor.innerHTML);
}

/**
 * Converts an HTML string or element into plain text with preserved newlines between
 * block elements, so adjacent paragraphs never collapse into a single run-on token.
 */
export function extractPlainTextFromHtml(htmlOrElement: string | Element | HTMLElement | null): string {
  if (!htmlOrElement) return '';

  let html = '';
  if (typeof htmlOrElement === 'string') {
    html = htmlOrElement;
  } else if (htmlOrElement.innerHTML) {
    html = htmlOrElement.innerHTML;
  } else {
    return (htmlOrElement.textContent || '').replace(/\u00a0/g, ' ').trim();
  }

  if (!html.trim()) return '';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // Server-side / fallback regex
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article|header|footer)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+\n/g, '\n\n')
      .trim();
  }

  const container = document.createElement('div');
  container.innerHTML = html;

  // Replace all <br> elements with newline text nodes
  container.querySelectorAll('br').forEach((br) => {
    br.replaceWith(document.createTextNode('\n'));
  });

  // Ensure every block-level element has newlines prepended and appended
  const blockSelectors = [
    'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
    'li', 'blockquote', 'tr', 'header', 'footer', 'section', 'article'
  ];
  container.querySelectorAll(blockSelectors.join(',')).forEach((block) => {
    block.prepend(document.createTextNode('\n'));
    block.append(document.createTextNode('\n'));
  });

  return (container.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Accurately counts words from plain text, splitting on any whitespace sequence.
 */
export function countWordsFromText(text: string | null | undefined): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
