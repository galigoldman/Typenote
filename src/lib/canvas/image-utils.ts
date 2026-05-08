const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

export interface ProcessedImage {
  /** Base64 data URL (JPEG or PNG) */
  src: string;
  /** Pixel width (after resize) */
  width: number;
  /** Pixel height (after resize) */
  height: number;
  /** Original width / height ratio */
  aspectRatio: number;
}

/**
 * Process a clipboard image blob: resize if too large, compress, and return as base64 data URL.
 * - If longest dimension > 1200px, resize proportionally
 * - Uses JPEG at 80% quality (PNG if transparency detected)
 */
export async function processClipboardImage(
  blob: Blob,
): Promise<ProcessedImage> {
  const img = await loadImage(blob);
  const { width: origW, height: origH } = img;
  const aspectRatio = origW / origH;

  let targetW = origW;
  let targetH = origH;

  if (Math.max(origW, origH) > MAX_DIMENSION) {
    if (origW >= origH) {
      targetW = MAX_DIMENSION;
      targetH = Math.round(MAX_DIMENSION / aspectRatio);
    } else {
      targetH = MAX_DIMENSION;
      targetW = Math.round(MAX_DIMENSION * aspectRatio);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const usePng =
    blob.type === 'image/png' && hasTransparency(ctx, targetW, targetH);
  const mimeType = usePng ? 'image/png' : 'image/jpeg';
  const src = canvas.toDataURL(mimeType, usePng ? undefined : JPEG_QUALITY);

  return { src, width: targetW, height: targetH, aspectRatio };
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image from clipboard'));
    };
    img.src = URL.createObjectURL(blob);
  });
}

function hasTransparency(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  // Sample a grid of pixels to check for transparency (faster than scanning all pixels)
  const step = Math.max(1, Math.floor(Math.min(width, height) / 20));
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 255) return true;
    }
  }
  return false;
}
