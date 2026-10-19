import type { PageFormat, PageFormatConfig } from '../types';

// v0.7.93: A4 is listed FIRST everywhere (New Mundus modal, edit modal,
// export pickers) — it is also the default format for new worlds.
export const PAGE_FORMATS: Record<PageFormat, PageFormatConfig> = {
  a4: {
    id: 'a4',
    name: 'A4',
    dimensions: '8.27" × 11.69"',
    metric: '210 × 297 mm',
    description: 'International standard document & publication format',
    width: 794,
    height: 1123,
    topMargin: 64,
    bottomMargin: 48,
    gap: 40,
  },
  us_letter: {
    id: 'us_letter',
    name: 'US Letter',
    dimensions: '8.5" × 11"',
    metric: '216 × 279 mm',
    description: 'Standard manuscript and document format (US/Canada)',
    width: 816,
    height: 1056,
    topMargin: 64,
    bottomMargin: 64,
    gap: 40,
  },
  trade_paperback: {
    id: 'trade_paperback',
    name: 'Trade Paperback',
    dimensions: '6" × 9"',
    metric: '152 × 229 mm',
    description: 'Standard published fiction, novel & trade paperback size',
    width: 576,
    height: 864,
    topMargin: 52,
    bottomMargin: 56,
    gap: 36,
  },
  a5: {
    id: 'a5',
    name: 'A5',
    dimensions: '5.83" × 8.27"',
    metric: '148 × 210 mm',
    description: 'Compact book, novella, journal & European digest',
    width: 560,
    height: 794,
    topMargin: 48,
    bottomMargin: 50,
    gap: 36,
  },
  pocket_paperback: {
    id: 'pocket_paperback',
    name: 'Pocket Book',
    dimensions: '5.5" × 8.5"',
    metric: '140 × 216 mm',
    description: 'Classic mass-market paperback & compact novel format',
    width: 528,
    height: 816,
    topMargin: 48,
    bottomMargin: 50,
    gap: 36,
  },
};

export const DEFAULT_PAGE_FORMAT: PageFormat = 'a4';

export const getPageFormatConfig = (format?: string): PageFormatConfig => {
  if (format && format in PAGE_FORMATS) {
    return PAGE_FORMATS[format as PageFormat];
  }
  return PAGE_FORMATS[DEFAULT_PAGE_FORMAT];
};
