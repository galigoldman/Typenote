import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFonts } from '../font-loader';
import type { jsPDF } from 'jspdf';

function createMockDoc() {
  return {
    addFileToVFS: vi.fn(),
    addFont: vi.fn(),
    setFont: vi.fn(),
  } as unknown as jsPDF;
}

/** Return a minimal Response that resolves to an ArrayBuffer of the given byte. */
function fakeFontResponse(byte = 0x41): Response {
  const buffer = new Uint8Array([byte]).buffer;
  return {
    ok: true,
    arrayBuffer: () => Promise.resolve(buffer),
  } as unknown as Response;
}

describe('loadFonts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should register all 4 fonts with jsPDF', async () => {
    const doc = createMockDoc();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeFontResponse());

    await loadFonts(doc);

    // fetch called once per font
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenCalledWith('/fonts/GeistSans-Regular.ttf');
    expect(fetch).toHaveBeenCalledWith('/fonts/GeistSans-Bold.ttf');
    expect(fetch).toHaveBeenCalledWith('/fonts/GeistSans-Italic.ttf');
    expect(fetch).toHaveBeenCalledWith('/fonts/GeistMono-Regular.ttf');

    // addFileToVFS called 4 times with filename + base64 data
    expect(doc.addFileToVFS).toHaveBeenCalledTimes(4);
    expect(doc.addFileToVFS).toHaveBeenCalledWith(
      'GeistSans-Regular.ttf',
      expect.any(String),
    );
    expect(doc.addFileToVFS).toHaveBeenCalledWith(
      'GeistSans-Bold.ttf',
      expect.any(String),
    );
    expect(doc.addFileToVFS).toHaveBeenCalledWith(
      'GeistSans-Italic.ttf',
      expect.any(String),
    );
    expect(doc.addFileToVFS).toHaveBeenCalledWith(
      'GeistMono-Regular.ttf',
      expect.any(String),
    );

    // addFont called 4 times with correct family and style
    expect(doc.addFont).toHaveBeenCalledTimes(4);
    expect(doc.addFont).toHaveBeenCalledWith(
      'GeistSans-Regular.ttf',
      'GeistSans',
      'normal',
    );
    expect(doc.addFont).toHaveBeenCalledWith(
      'GeistSans-Bold.ttf',
      'GeistSans',
      'bold',
    );
    expect(doc.addFont).toHaveBeenCalledWith(
      'GeistSans-Italic.ttf',
      'GeistSans',
      'italic',
    );
    expect(doc.addFont).toHaveBeenCalledWith(
      'GeistMono-Regular.ttf',
      'GeistMono',
      'normal',
    );
  });

  it('should set default font to GeistSans', async () => {
    const doc = createMockDoc();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeFontResponse());

    await loadFonts(doc);

    expect(doc.setFont).toHaveBeenCalledWith('GeistSans', 'normal');
  });

  it('should handle font load failure gracefully', async () => {
    const doc = createMockDoc();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('GeistSans-Bold')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response);
      }
      return Promise.resolve(fakeFontResponse());
    });

    await loadFonts(doc);

    // The 3 successful fonts should still be registered
    expect(doc.addFileToVFS).toHaveBeenCalledTimes(3);
    expect(doc.addFont).toHaveBeenCalledTimes(3);

    // A warning should have been logged for the failed font
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('GeistSans-Bold.ttf'),
    );

    // Default font should still be set despite the failure
    expect(doc.setFont).toHaveBeenCalledWith('GeistSans', 'normal');
  });
});
