/** Client-side image prep: EXIF-aware decode, resize, WebP encode under the server's size limits. */

export const MAIN_MAX_PX = 2000;
export const THUMB_MAX_PX = 480;
export const MAIN_MAX_BYTES = 3 * 1024 * 1024;
export const THUMB_MAX_BYTES = 300 * 1024;
export const QUALITY_LADDER: readonly number[] = [0.8, 0.7, 0.6];

/** Scale (w,h) down so the longest side is at most `max`; never upscales. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const s = max / longest;
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

export interface EncodedImage { blob: Blob; width: number; height: number; quality: number }
export interface PreparedImage { main: EncodedImage; thumb: EncodedImage }

async function canvasToWebp(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return c.convertToBlob({ type: 'image/webp', quality });
  }
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/webp', quality));
}

/** Encode at 0.8, then 0.7, then 0.6 until the blob fits `maxBytes`. Throws when even 0.6 is too big. */
export async function encodeUnderLimit(bitmap: ImageBitmap, maxPx: number, maxBytes: number, label: string): Promise<EncodedImage> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxPx);
  for (const quality of QUALITY_LADDER) {
    const blob = await canvasToWebp(bitmap, width, height, quality);
    if (blob.type !== 'image/webp') throw new Error('This browser cannot create WebP images. Try Chrome, Edge or Firefox.');
    if (blob.size <= maxBytes) return { blob, width, height, quality };
  }
  throw new Error(`${label} is still larger than ${Math.round(maxBytes / 1024)} KB after compression. Try a smaller photo.`);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Not an image file');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Could not read this image (unsupported format?)');
  }
  try {
    const main = await encodeUnderLimit(bitmap, MAIN_MAX_PX, MAIN_MAX_BYTES, 'Photo');
    const thumb = await encodeUnderLimit(bitmap, THUMB_MAX_PX, THUMB_MAX_BYTES, 'Thumbnail');
    return { main, thumb };
  } finally {
    bitmap.close();
  }
}

/** PUT a blob straight to the presigned URL. XHR for upload progress; no cookies, no CSRF header. */
export function putWithProgress(url: string, blob: Blob, headers: Record<string, string> | undefined, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.withCredentials = false;
    for (const [k, v] of Object.entries(headers ?? {})) {
      if (k.toLowerCase() !== 'host' && k.toLowerCase() !== 'content-length') xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) { onProgress(blob.size); resolve(); } else reject(new Error(`Upload failed (${xhr.status})`)); };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(blob);
  });
}
