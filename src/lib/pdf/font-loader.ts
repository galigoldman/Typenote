import type { jsPDF } from 'jspdf';

interface FontConfig {
  filename: string;
  family: string;
  style: string;
}

const FONTS: FontConfig[] = [
  { filename: 'GeistSans-Regular.ttf', family: 'GeistSans', style: 'normal' },
  { filename: 'GeistSans-Bold.ttf', family: 'GeistSans', style: 'bold' },
  { filename: 'GeistSans-Italic.ttf', family: 'GeistSans', style: 'italic' },
  { filename: 'GeistMono-Regular.ttf', family: 'GeistMono', style: 'normal' },
];

/**
 * Converts an ArrayBuffer to a base64-encoded string.
 *
 * jsPDF's virtual file system expects font data as base64, so we need to
 * transform the raw binary fetched from the network into that format.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Fetches Geist TTF font files from the public `/fonts/` directory,
 * converts them to base64, and registers them with a jsPDF instance.
 *
 * After loading, the default font is set to GeistSans (normal style).
 * If an individual font fails to load, a warning is logged and the
 * remaining fonts continue to load.
 */
export async function loadFonts(doc: jsPDF): Promise<void> {
  const results = await Promise.allSettled(
    FONTS.map(async (font) => {
      const response = await fetch(`/fonts/${font.filename}`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${font.filename}: ${response.status} ${response.statusText}`,
        );
      }

      const buffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      doc.addFileToVFS(font.filename, base64);
      doc.addFont(font.filename, font.family, font.style);
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      console.warn(
        `[font-loader] Could not load font "${FONTS[i].filename}": ${result.reason}`,
      );
    }
  }

  doc.setFont('GeistSans', 'normal');
}
