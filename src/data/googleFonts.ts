export interface GoogleFontItem {
  id: string;
  name: string;
  category: 'serif' | 'sans-serif' | 'monospace' | 'display' | 'handwriting';
  googleFamily: string; // for Google Fonts URL e.g. "Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400"
  fontFamily: string;   // CSS font-family string
}

// Curated selection of prominent, high-craft Google Fonts beloved by novelists & authors
export const CURATED_GOOGLE_FONTS: GoogleFontItem[] = [
  // Literary Serifs
  {
    id: 'gf-merriweather',
    name: 'Merriweather',
    category: 'serif',
    googleFamily: 'Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700',
    fontFamily: "'Merriweather', Georgia, serif"
  },
  {
    id: 'gf-eb-garamond',
    name: 'EB Garamond',
    category: 'serif',
    googleFamily: 'EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600',
    fontFamily: "'EB Garamond', Garamond, 'Times New Roman', serif"
  },
  {
    id: 'gf-cormorant-garamond',
    name: 'Cormorant Garamond',
    category: 'serif',
    googleFamily: 'Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600',
    fontFamily: "'Cormorant Garamond', Garamond, serif"
  },
  {
    id: 'gf-playfair-display',
    name: 'Playfair Display',
    category: 'serif',
    googleFamily: 'Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600',
    fontFamily: "'Playfair Display', Georgia, serif"
  },
  {
    id: 'gf-cinzel',
    name: 'Cinzel (Classical)',
    category: 'display',
    googleFamily: 'Cinzel:wght@400;600;700',
    fontFamily: "'Cinzel', 'Times New Roman', serif"
  },
  {
    id: 'gf-libre-baskerville',
    name: 'Libre Baskerville',
    category: 'serif',
    googleFamily: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400',
    fontFamily: "'Libre Baskerville', Baskerville, serif"
  },
  {
    id: 'gf-spectral',
    name: 'Spectral',
    category: 'serif',
    googleFamily: 'Spectral:ital,wght@0,400;0,600;1,400;1,600',
    fontFamily: "'Spectral', Georgia, serif"
  },
  {
    id: 'gf-alegreya',
    name: 'Alegreya',
    category: 'serif',
    googleFamily: 'Alegreya:ital,wght@0,400;0,500;0,700;1,400;1,700',
    fontFamily: "'Alegreya', Georgia, serif"
  },
  {
    id: 'gf-crimson-pro',
    name: 'Crimson Pro',
    category: 'serif',
    googleFamily: 'Crimson+Pro:ital,wght@0,400;0,600;1,400;1,600',
    fontFamily: "'Crimson Pro', Garamond, serif"
  },
  {
    id: 'gf-pt-serif',
    name: 'PT Serif',
    category: 'serif',
    googleFamily: 'PT+Serif:ital,wght@0,400;0,700;1,400;1,700',
    fontFamily: "'PT Serif', Georgia, serif"
  },

  // Modern Clean Sans
  {
    id: 'gf-roboto',
    name: 'Roboto',
    category: 'sans-serif',
    googleFamily: 'Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400',
    fontFamily: "'Roboto', system-ui, sans-serif"
  },
  {
    id: 'gf-open-sans',
    name: 'Open Sans',
    category: 'sans-serif',
    googleFamily: 'Open+Sans:ital,wght@0,400;0,600;0,700;1,400',
    fontFamily: "'Open Sans', system-ui, sans-serif"
  },
  {
    id: 'gf-lato',
    name: 'Lato',
    category: 'sans-serif',
    googleFamily: 'Lato:ital,wght@0,300;0,400;0,700;1,400',
    fontFamily: "'Lato', system-ui, sans-serif"
  },
  {
    id: 'gf-montserrat',
    name: 'Montserrat',
    category: 'sans-serif',
    googleFamily: 'Montserrat:ital,wght@0,400;0,500;0,700;1,400',
    fontFamily: "'Montserrat', system-ui, sans-serif"
  },
  {
    id: 'gf-poppins',
    name: 'Poppins',
    category: 'sans-serif',
    googleFamily: 'Poppins:ital,wght@0,400;0,500;0,600;1,400',
    fontFamily: "'Poppins', system-ui, sans-serif"
  },
  {
    id: 'gf-source-sans',
    name: 'Source Sans 3',
    category: 'sans-serif',
    googleFamily: 'Source+Sans+3:ital,wght@0,400;0,600;1,400',
    fontFamily: "'Source Sans 3', system-ui, sans-serif"
  },

  // Author Monospaces & Typewriters
  {
    id: 'gf-fira-code',
    name: 'Fira Code',
    category: 'monospace',
    googleFamily: 'Fira+Code:wght@400;500;600',
    fontFamily: "'Fira Code', monospace"
  },
  {
    id: 'gf-source-code-pro',
    name: 'Source Code Pro',
    category: 'monospace',
    googleFamily: 'Source+Code+Pro:ital,wght@0,400;0,600;1,400',
    fontFamily: "'Source Code Pro', monospace"
  },
  {
    id: 'gf-space-mono',
    name: 'Space Mono',
    category: 'monospace',
    googleFamily: 'Space+Mono:ital,wght@0,400;0,700;1,400',
    fontFamily: "'Space Mono', monospace"
  },

  // Literary & Atmospheric Scripts
  {
    id: 'gf-caveat',
    name: 'Caveat (Handwriting)',
    category: 'handwriting',
    googleFamily: 'Caveat:wght@400;600;700',
    fontFamily: "'Caveat', cursive"
  },
  {
    id: 'gf-dancing-script',
    name: 'Dancing Script',
    category: 'handwriting',
    googleFamily: 'Dancing+Script:wght@400;600;700',
    fontFamily: "'Dancing Script', cursive"
  },
  {
    id: 'gf-medievalsharp',
    name: 'MedievalSharp (Fantasy)',
    category: 'display',
    googleFamily: 'MedievalSharp',
    fontFamily: "'MedievalSharp', cursive, serif"
  }
];

// Set of loaded font links to avoid duplicate network calls
const loadedGoogleFonts = new Set<string>();

/**
 * Dynamically injects a Google Fonts <link> stylesheet into <head> if not already loaded
 */
export function loadGoogleFont(font: GoogleFontItem): Promise<boolean> {
  if (loadedGoogleFonts.has(font.id)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    // Check if element already exists in document
    const linkId = `google-font-${font.id}`;
    if (document.getElementById(linkId)) {
      loadedGoogleFonts.add(font.id);
      resolve(true);
      return;
    }

    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${font.googleFamily}&display=swap`;
    link.onload = () => {
      loadedGoogleFonts.add(font.id);
      resolve(true);
    };
    link.onerror = () => {
      console.warn(`Could not load Google Font ${font.name}`);
      resolve(false);
    };

    document.head.appendChild(link);
  });
}

export function isValidGoogleFontItem(font: any): font is GoogleFontItem {
  if (!font || typeof font !== 'object') return false;
  const name = typeof font.name === 'string' ? font.name.trim() : '';
  const id = typeof font.id === 'string' ? font.id.trim() : '';
  if (!name || name.length < 2) return false;
  if (name.startsWith('&') || id.startsWith('&') || name.startsWith('"') || name.startsWith("'") || name.startsWith('&#')) return false;
  const lowerName = name.toLowerCase();
  const lowerId = id.toLowerCase();
  if (lowerName === 'quot' || lowerName.includes('quot') || lowerId.includes('quot')) return false;
  if (lowerName === 'amp' || lowerName.includes('amp') || lowerId.includes('amp')) return false;
  if (lowerName === 'apos' || lowerName.includes('apos') || lowerId.includes('apos')) return false;
  if (lowerName.startsWith('temp_font') || lowerId.startsWith('temp_font')) return false;
  if (['serif', 'sans-serif', 'monospace', 'inherit', 'initial', 'unset', 'undefined', 'null'].includes(lowerName)) return false;
  return true;
}

/**
 * Load a Google Font by arbitrary family name, e.g. when entered by user or detected in document HTML
 */
export function loadArbitraryGoogleFont(rawFamilyName: string): Promise<GoogleFontItem | null> {
  const cleanName = rawFamilyName.trim().replace(/^['"&;]+|['"&;]+$/g, '').trim();
  if (!cleanName || cleanName.length < 2 || cleanName.toLowerCase() === 'quot' || cleanName.toLowerCase().includes('&quot')) {
    return Promise.resolve(null);
  }

  const formattedUrlParam = cleanName.replace(/\s+/g, '+') + ':ital,wght@0,400;0,700;1,400';
  const fontId = `gf-custom-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  const item: GoogleFontItem = {
    id: fontId,
    name: cleanName,
    category: 'serif',
    googleFamily: formattedUrlParam,
    fontFamily: `"${cleanName}", Georgia, serif`
  };

  if (!isValidGoogleFontItem(item)) {
    return Promise.resolve(null);
  }

  return loadGoogleFont(item).then((success) => (success ? item : null));
}

/**
 * Automatically inspects document HTML for any Google Font family declarations
 * and dynamically fetches/injects their stylesheets without requiring Firebase.
 */
export async function detectAndLoadFontsFromHtml(
  htmlContent: string, 
  onNewFontDiscovered?: (font: GoogleFontItem) => void
): Promise<void> {
  if (!htmlContent) return;

  // Sanitize and decode HTML entities commonly found in style attributes
  const sanitizedHtml = htmlContent
    .replace(/&quot;?/gi, '"')
    .replace(/&#34;?/gi, '"')
    .replace(/&#x22;?/gi, '"')
    .replace(/&apos;?/gi, "'")
    .replace(/&#39;?/gi, "'")
    .replace(/&amp;?/gi, '&');

  // Regex to extract font-family values from style attributes
  const fontRegex = /font-family:\s*([^;"]+)/gi;
  const standardFonts = new Set([
    'lora', 'georgia', 'cambria', 'times new roman', 'times', 'serif',
    'inter', 'system-ui', '-apple-system', 'sans-serif', 'arial', 'helvetica',
    'jetbrains mono', 'courier', 'monospace', 'inherit', 'initial', 'unset',
    'quot', '&quot', 'amp', '&amp', 'apos', '&apos'
  ]);

  const discoveredFonts = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = fontRegex.exec(sanitizedHtml)) !== null) {
    const rawVal = match[1];
    // Split by comma in case of font fallbacks (e.g. "'MedievalSharp', cursive, serif")
    const primaryFont = rawVal.split(',')[0].trim().replace(/^['"]+|['"]+$/g, '').trim();
    if (
      primaryFont && 
      primaryFont.length >= 2 && 
      !primaryFont.startsWith('&') && 
      !primaryFont.toLowerCase().includes('quot') &&
      !standardFonts.has(primaryFont.toLowerCase())
    ) {
      discoveredFonts.add(primaryFont);
    }
  }

  // Also check <font face="..."> elements
  const faceRegex = /<font[^>]+face=["']([^"']+)["']/gi;
  while ((match = faceRegex.exec(sanitizedHtml)) !== null) {
    const primaryFont = match[1].split(',')[0].trim().replace(/^['"]+|['"]+$/g, '').trim();
    if (
      primaryFont && 
      primaryFont.length >= 2 && 
      !primaryFont.startsWith('&') && 
      !primaryFont.toLowerCase().includes('quot') &&
      !standardFonts.has(primaryFont.toLowerCase()) && 
      !primaryFont.startsWith('TEMP_FONT')
    ) {
      discoveredFonts.add(primaryFont);
    }
  }

  for (const fontName of discoveredFonts) {
    // Check if it's already in curated fonts list
    const curated = CURATED_GOOGLE_FONTS.find(
      (f) => f.name.toLowerCase() === fontName.toLowerCase() || f.id.toLowerCase() === fontName.toLowerCase()
    );
    if (curated) {
      if (isValidGoogleFontItem(curated)) {
        await loadGoogleFont(curated);
        onNewFontDiscovered?.(curated);
      }
    } else {
      // Fetch dynamically as arbitrary Google Font
      const loaded = await loadArbitraryGoogleFont(fontName);
      if (loaded && isValidGoogleFontItem(loaded)) {
        onNewFontDiscovered?.(loaded);
      }
    }
  }
}

