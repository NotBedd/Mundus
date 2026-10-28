import type { CustomFont } from '../types';
import { saveUserCustomFont, deleteUserCustomFont } from './firebase';

const STORAGE_KEY = 'mundus_custom_fonts';

/**
 * Load all saved custom fonts from localStorage into the browser's document.fonts
 */
export async function initializeCustomFonts(): Promise<CustomFont[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const fonts: CustomFont[] = JSON.parse(raw);
    if (!Array.isArray(fonts)) return [];

    for (const font of fonts) {
      await registerFontFace(font.name, font.dataUrl);
    }
    return fonts;
  } catch (err) {
    console.error('Failed to initialize custom fonts:', err);
    return [];
  }
}

/**
 * Registers a FontFace in document.fonts
 */
export async function registerFontFace(name: string, dataUrl: string): Promise<boolean> {
  try {
    if (!name || !dataUrl) return false;
    const fontFace = new FontFace(name, `url(${dataUrl})`);
    const loadedFace = await fontFace.load();
    document.fonts.add(loadedFace);
    return true;
  } catch (error) {
    console.error(`Failed loading font face "${name}":`, error);
    return false;
  }
}

/**
 * Syncs cloud custom fonts with local fonts, registers any new font faces in document.fonts,
 * and updates local cache.
 */
export async function syncAndRegisterCustomFonts(cloudFonts: CustomFont[]): Promise<CustomFont[]> {
  if (!Array.isArray(cloudFonts)) return [];

  for (const font of cloudFonts) {
    if (font.name && font.dataUrl) {
      await registerFontFace(font.name, font.dataUrl);
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudFonts));
  } catch (storageErr) {
    console.warn('Could not update custom fonts in localStorage:', storageErr);
  }

  return cloudFonts;
}

/**
 * Read font File, register it, save to localStorage, save to Firebase if userId is provided, and return CustomFont object
 */
export async function uploadCustomFontFile(file: File, userId?: string): Promise<CustomFont> {
  const allowedExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
  const fileName = file.name;
  const isAllowed = allowedExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  if (!isAllowed) {
    throw new Error('Unsupported font format. Please upload a .ttf, .otf, .woff, or .woff2 file.');
  }

  // Generate a clean font family name from the file name
  const cleanName = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim() || `CustomFont_${Date.now()}`;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read font file'));
    reader.readAsDataURL(file);
  });

  const success = await registerFontFace(cleanName, dataUrl);
  if (!success) {
    throw new Error('Browser could not parse the font file.');
  }

  const customFont: CustomFont = {
    id: `font-${Date.now()}`,
    name: cleanName,
    fontFamily: `"${cleanName}", system-ui, sans-serif`,
    dataUrl
  };

  // Persist to localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: CustomFont[] = raw ? JSON.parse(raw) : [];
    const updated = [...existing.filter(f => f.name !== cleanName), customFont];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (storageErr) {
    console.warn('Could not persist font to localStorage (may exceed quota):', storageErr);
  }

  // Persist to Firebase if userId is provided
  if (userId) {
    await saveUserCustomFont(userId, customFont).catch(err => {
      console.warn('Failed to upload custom font to Firebase:', err);
    });
  }

  return customFont;
}

/**
 * Remove a custom font
 */
export function removeCustomFont(fontId: string, userId?: string): CustomFont[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: CustomFont[] = raw ? JSON.parse(raw) : [];
    const updated = existing.filter(f => f.id !== fontId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (userId) {
      deleteUserCustomFont(userId, fontId).catch(err => {
        console.warn('Failed to delete custom font from Firebase:', err);
      });
    }

    return updated;
  } catch {
    return [];
  }
}
