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

  it('should register all 6 fonts with jsPDF', async () => {
    const doc = createMockDoc();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeFontResponse());

    await loadFonts(doc);

    // fetch called once per font (4 Geist + 2 NotoSansHebrew)
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(fetch).toHaveBeenCalledWith('/fonts/GeistSans-Regular.ttf');
    expect(fetch).toHaveBeenCalledWith('/fonts/GeistSans-Bold.ttf');
    expect(fetch).toHaveBeenCalledWith('/fonts/GeistSans-Italic.ttf');
    expect(fetch).toHaveBeenCalledWith('/fonts/GeistMono-Regular.ttf');
    expect(fetch).toHaveBeenCalledWith('/fonts/NotoSansHebrew-Regular.ttf');
    expect(fetch).toHaveBeenCalledWith('/fonts/NotoSansHebrew-Bold.ttf');

    // addFileToVFS called 6 times with filename + base64 data
    expect(doc.addFileToVFS).toHaveBeenCalledTimes(6);
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
    expect(doc.addFileToVFS).toHaveBeenCalledWith(
      'NotoSansHebrew-Regular.ttf',
      expect.any(String),
    );
    expect(doc.addFileToVFS).toHaveBeenCalledWith(
      'NotoSansHebrew-Bold.ttf',
      expect.any(String),
    );

    // addFont called 6 times with correct family and style
    expect(doc.addFont).toHaveBeenCalledTimes(6);
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
    expect(doc.addFont).toHaveBeenCalledWith(
      'NotoSansHebrew-Regular.ttf',
      'NotoSansHebrew',
      'normal',
    );
    expect(doc.addFont).toHaveBeenCalledWith(
      'NotoSansHebrew-Bold.ttf',
      'NotoSansHebrew',
      'bold',
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

    // The 5 successful fonts should still be registered
    expect(doc.addFileToVFS).toHaveBeenCalledTimes(5);
    expect(doc.addFont).toHaveBeenCalledTimes(5);

    // A warning should have been logged for the failed font
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('GeistSans-Bold.ttf'),
    );

    // Default font should still be set despite the failure
    expect(doc.setFont).toHaveBeenCalledWith('GeistSans', 'normal');
  });
});
