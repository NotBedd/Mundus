import { appStorage } from './storage';

/**
 * Helper to compress and convert image files to optimized Data URLs for local browser storage.
 * - If running in Electron native desktop app, storage is saved directly to disk files;
 *   no compression is applied and the original full-resolution image data is preserved.
 * - When ImgBB cloud hosting is used, the raw uncompressed File is uploaded directly to ImgBB.
 * - Only used as a fallback in the browser environment when no ImgBB API key is configured,
 *   preventing localStorage QuotaExceeded errors (~5MB browser limit).
 */
export async function fileToOptimizedDataUrl(
  file: File,
  maxDimension = 800,
  quality = 0.82
): Promise<string> {
  // If running in Electron native desktop app, files are stored on disk without browser localStorage quota limits.
  // Preserve 100% original full-resolution image data without compression.
  if (appStorage.isElectron()) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise<string>((resolve, reject) => {
    // If SVG or gif (animated), keep data URL as-is
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        resolve('');
        return;
      }

      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        // Fill with white background in case of transparent PNG converted to JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high-efficiency JPEG
        try {
          const optimized = canvas.toDataURL('image/jpeg', quality);
          resolve(optimized);
        } catch {
          resolve(rawDataUrl);
        }
      };

      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
