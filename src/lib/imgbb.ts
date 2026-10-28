/**
 * ImgBB Image Hosting Service for Mundus
 * Handles image uploading to ImgBB via their REST API.
 * Provides client-side validation, error handling, and key verification.
 */

export interface ImgBBUploadResponse {
  success: boolean;
  url: string;
  displayUrl: string;
  deleteUrl?: string;
  width?: number;
  height?: number;
}

export const MAX_IMGBB_FILE_SIZE_BYTES = 32 * 1024 * 1024; // 32MB max on ImgBB

/**
 * Validates whether an API key has the typical 32-character hexadecimal format of ImgBB.
 */
export function isValidImgBBApiKeyFormat(key: string): boolean {
  if (!key) return false;
  const clean = key.trim();
  return /^[a-f0-9]{32}$/i.test(clean);
}

/**
 * Uploads an image file to ImgBB.
 * 
 * @param file The image file selected by the user.
 * @param apiKey The user's ImgBB API key stored in settings / Firestore.
 * @returns Object with direct image URL and metadata.
 * @throws Detailed Error if the upload cannot be completed.
 */
export async function uploadImageToImgBB(
  file: File,
  apiKey: string
): Promise<ImgBBUploadResponse> {
  const trimmedKey = (apiKey || '').trim();

  // 1. Validate API Key Presence
  if (!trimmedKey) {
    throw new Error('ImgBB API Key is not configured. Please add your free ImgBB API key in Mundus Settings > Image Hosting.');
  }

  // 2. Validate File Type
  if (!file || !file.type.startsWith('image/')) {
    const detectedType = file?.type || 'unknown format';
    throw new Error(`The selected file is not a supported image (${detectedType}). Please select a JPG, PNG, WebP, or GIF file.`);
  }

  // 3. Validate File Size (32MB limit)
  if (file.size > MAX_IMGBB_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`File is too large (${sizeMb} MB). ImgBB supports images up to 32 MB.`);
  }

  // 4. Construct FormData
  const formData = new FormData();
  formData.append('image', file);

  // 5. Send POST request to ImgBB API v1
  let response: Response;
  try {
    response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(trimmedKey)}`, {
      method: 'POST',
      body: formData,
    });
  } catch (networkError: any) {
    throw new Error(
      `Network error: Could not reach ImgBB servers (${networkError?.message || 'Check your internet connection'}). Please try again.`
    );
  }

  // 6. Parse JSON Response
  let responseData: any;
  try {
    responseData = await response.json();
  } catch (jsonErr) {
    throw new Error(`ImgBB returned an unreadable response (HTTP status ${response.status}). Please try again later.`);
  }

  // 7. Check for API errors
  if (!response.ok || !responseData.success) {
    const serverMessage = responseData?.error?.message || responseData?.status_txt || 'Unknown error occurred';
    const errorCode = responseData?.error?.code;

    if (response.status === 400 && (errorCode === 100 || serverMessage.toLowerCase().includes('key'))) {
      throw new Error('Invalid ImgBB API Key. Please verify your API key in Mundus Settings > Image Hosting.');
    }

    if (serverMessage.toLowerCase().includes('limit') || serverMessage.toLowerCase().includes('quota')) {
      throw new Error(`ImgBB rate limit reached: ${serverMessage}`);
    }

    throw new Error(`ImgBB upload failed: ${serverMessage}`);
  }

  // 8. Extract direct image URL
  const directUrl = responseData.data?.display_url || responseData.data?.url;
  if (!directUrl || typeof directUrl !== 'string') {
    throw new Error('ImgBB processed the image, but did not return a valid direct URL.');
  }

  return {
    success: true,
    url: directUrl,
    displayUrl: responseData.data?.display_url || directUrl,
    deleteUrl: responseData.data?.delete_url,
    width: responseData.data?.width ? Number(responseData.data.width) : undefined,
    height: responseData.data?.height ? Number(responseData.data.height) : undefined,
  };
}
