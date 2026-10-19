import type { PageFormatConfig } from '../types';
import type { DocumentVisualImage } from '../types';

/**
 * Standalone pagination engine — a faithful port of the Writing Mode
 * `normalizeDocumentPages` algorithm that can run on ANY attached container
 * (used by the PDF exporter to reproduce the exact same page layout
 * the author sees in the editor).
 *
 * Virtual Page-Gap Pagination (Option 1 Architecture):
 * - No physical spacer divs. Page transitions are created by applying an
 *   inline `margin-top` (the "virtual page gap") to the first block of each page.
 * - Legacy manual page breaks (`[data-manual-page-break]`, pre-v0.7.73) are
 *   still honored as hard breaks for backward compatibility. The current
 *   Ctrl+Enter element is the `.mundus-spacer` gap block, which flows as a
 *   normal block occupying its own height (extra breathing room, no new page).
 *
 * Returns the computed total page count.
 */
export function applyEditorPagination(
  container: HTMLElement,
  pageConfig: PageFormatConfig,
  visualImages?: DocumentVisualImage[]
): number {
  if (!container || !container.isConnected) return 1;

  const PAGE_SHEET_HEIGHT = pageConfig.height;
  const PAGE_GAP = pageConfig.gap;
  const PAGE_CYCLE = pageConfig.height + pageConfig.gap;
  const TOP_MARGIN = pageConfig.topMargin;
  const BOTTOM_MARGIN = pageConfig.bottomMargin;
  const PRINTABLE_MAX = PAGE_SHEET_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;

  // 1. Strip any legacy automatic page-break divs (only explicit manual page breaks remain)
  const autoBreaks = Array.from(container.querySelectorAll('.mundus-page-break:not([data-manual-page-break])')) as HTMLElement[];
  autoBreaks.forEach((pb) => pb.remove());

  const rawText = (container.textContent || '').replace(/[\n\r\t\s\u00a0]+/g, '');
  if (!rawText && !(visualImages && visualImages.length > 0)) {
    const allChildren = Array.from(container.children) as HTMLElement[];
    allChildren.forEach((child) => {
      child.style.removeProperty('margin-top');
      child.classList.remove('is-page-start', 'mundus-page-start');
    });
    return 1;
  }

  // 2. Iterate through top-level block children and apply virtual page-gap margins
  const children = Array.from(container.children) as HTMLElement[];

  // PRE-PASS: strip stale pagination markers + inline virtual-gap margins so
  // getComputedStyle returns the block's real CSS margin-top (not the previous
  // page-gap inline value) and so no stale margins consume layout space.
  children.forEach((child) => {
    if (child.classList.contains('is-page-start') || child.classList.contains('mundus-page-start')) {
      child.style.removeProperty('margin-top');
      child.classList.remove('is-page-start', 'mundus-page-start');
    }
  });

  let currentPage = 0;
  let currentPageHeight = 0;
  // Trailing (collapsed) margin of the last block placed on the current page.
  // CSS margin collapsing absorbs this trailing margin into the next block's
  // page-gap margin-top (max() rule). Without compensating for it, every new
  // page starts one paragraph-margin higher than intended - and the error
  // accumulates page after page until the text drifts above the physical sheet.
  let trailingMargin = 0;

  // Fractional height measurement: offsetHeight rounds to integers, which
  // accumulates ~0.5px of drift per block. getBoundingClientRect returns
  // fractional values, so divide out any transform scale to get true layout px.
  const containerRect = container.getBoundingClientRect();
  const containerScale = container.offsetWidth > 0 && containerRect.width > 0
    ? containerRect.width / container.offsetWidth
    : 1;
  const measureHeight = (el: HTMLElement): number => {
    const rectH = el.getBoundingClientRect().height;
    return rectH > 0 ? rectH / containerScale : el.offsetHeight;
  };

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child.isConnected) continue;

    // Legacy Manual Page Break (pre-spacer documents; Ctrl+Enter now inserts .mundus-spacer blocks instead)
    if (child.classList.contains('mundus-manual-page-break') || child.hasAttribute('data-manual-page-break')) {
      const leftoverOnPrevPage = Math.max(0, PRINTABLE_MAX - currentPageHeight);
      const gap = leftoverOnPrevPage + BOTTOM_MARGIN + PAGE_GAP + TOP_MARGIN + trailingMargin;
      child.style.marginTop = `${gap}px`;
      child.classList.add('is-page-start', 'mundus-page-start');
      currentPage++;
      // The break divider renders at the top of the new sheet, so count it as
      // the first occupied block on the new page to keep every following
      // page-start aligned with its sheet.
      const breakH = measureHeight(child);
      const breakMB = parseFloat(window.getComputedStyle(child).marginBottom) || 0;
      currentPageHeight = breakH + breakMB;
      trailingMargin = breakMB;
      continue;
    }

    // Measure substantive block height
    const childHeight = measureHeight(child);
    const style = window.getComputedStyle(child);
    const marginBottom = parseFloat(style.marginBottom) || 0;
    // CSS margin-top (stale inline page-gaps were stripped in the pre-pass above)
    const cssMarginTop = parseFloat(style.marginTop) || 0;
    let blockOccupiedHeight = childHeight + marginBottom;

    // If this child is a visual image portal node, ensure realistic occupied
    // height so it never lands in the page gap
    if (child.hasAttribute('data-visual-image-id') || child.classList.contains('visual-image-portal-node')) {
      const vImgId = child.getAttribute('data-visual-image-id');
      const matchedImg = (visualImages || []).find((v) => v.id === vImgId);
      const imgTag = child.querySelector('img');
      const renderedH = imgTag && imgTag.offsetHeight > 50
        ? imgTag.offsetHeight
        : imgTag && imgTag.naturalHeight && imgTag.naturalWidth
        ? Math.round((imgTag.naturalHeight / imgTag.naturalWidth) * (child.offsetWidth || matchedImg?.width || 280))
        : 240;
      blockOccupiedHeight = Math.max(childHeight + marginBottom, renderedH + marginBottom, 240);
    }

    // Skip unattached zero-height empty nodes
    if (blockOccupiedHeight <= 0 && !child.querySelector('img, [data-visual-image-id]')) {
      continue;
    }

    // Space consumed between the previous block and this one due to CSS margin
    // collapsing (adjacent sibling margins collapse to max(), they do NOT add
    // up). The previous block's margin-bottom is already counted inside
    // currentPageHeight, so only the EXTRA margin-top beyond it consumes space.
    const extraMarginTop = Math.max(0, cssMarginTop - trailingMargin);
    const consumedHeight = extraMarginTop + blockOccupiedHeight;

    // Check if block fits on the current page
    if (currentPageHeight + consumedHeight <= PRINTABLE_MAX) {
      // Fits cleanly on current page
      if (child.style.marginTop) {
        child.style.removeProperty('margin-top');
      }
      if (child.classList.contains('is-page-start')) {
        child.classList.remove('is-page-start', 'mundus-page-start');
      }
      currentPageHeight += consumedHeight;
      trailingMargin = marginBottom;
    } else {
      // Block overflows current page!
      if (currentPageHeight > 0) {
        // Push to next page: jump remaining space of current page + bottom
        // margin + sheet gap + top margin. trailingMargin is added because the
        // big page-gap margin-top collapses with (absorbs) the previous
        // block's margin-bottom.
        const leftoverOnPrevPage = Math.max(0, PRINTABLE_MAX - currentPageHeight);
        const gap = leftoverOnPrevPage + BOTTOM_MARGIN + PAGE_GAP + TOP_MARGIN + trailingMargin;
        const gapStr = `${gap}px`;

        if (child.style.marginTop !== gapStr) {
          child.style.marginTop = gapStr;
        }
        if (!child.classList.contains('is-page-start')) {
          child.classList.add('is-page-start', 'mundus-page-start');
        }
        currentPage++;
        // The inline page-gap margin-top replaces the block's own CSS margin-top
        currentPageHeight = blockOccupiedHeight;
        trailingMargin = marginBottom;
      } else {
        // Already at the top of a page, but block itself exceeds PRINTABLE_MAX
        // (e.g. huge image or table)
        if (child.style.marginTop) {
          child.style.removeProperty('margin-top');
        }
        if (child.classList.contains('is-page-start')) {
          child.classList.remove('is-page-start', 'mundus-page-start');
        }
        // Track exactly how many full sheet cycles the block spans so the flow
        // position stays true (prevents cumulative drift after oversized blocks)
        const pagesSpanned = Math.floor(consumedHeight / PAGE_CYCLE);
        currentPage += pagesSpanned;
        currentPageHeight = consumedHeight - pagesSpanned * PAGE_CYCLE;
        trailingMargin = marginBottom;
      }
    }
  }

  // 3. Compute final total pages
  return Math.max(1, currentPage + 1);
}
