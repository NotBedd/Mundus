import { CURATED_GOOGLE_FONTS } from '../data/googleFonts';

export const resolveFontCss = (fontKey: string, customFonts: { id: string; name: string }[]): string => {
  if (fontKey === 'sans') return "'Inter', system-ui, sans-serif";
  if (fontKey === 'mono') return "'JetBrains Mono', Courier, monospace";
  if (fontKey.startsWith('gfont_')) {
    const gId = fontKey.replace('gfont_', '');
    const matched = CURATED_GOOGLE_FONTS.find(gf => gf.id === gId);
    if (matched) {
      // Need to load it if not loaded? The TextEditor will load it if it's applied, but maybe we should load it here?
      // For now just return the font family
      return matched.fontFamily;
    }
    return `"${gId}", serif`;
  }
  const custom = customFonts.find(cf => cf.id === fontKey);
  if (custom) return `"${custom.name}", system-ui, sans-serif`;
  return "'Lora', Georgia, Cambria, 'Times New Roman', Times, serif";
};
