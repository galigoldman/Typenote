import { describe, it, expect, vi, beforeEach } from 'vitest';
import { printExportDocument } from '../print-export';
import type { ExportableDocument } from '../export-pdf';

// Mock html-template module
vi.mock('../html-template', () => ({
  buildTextDocumentHtml: vi.fn(
    () => '<html><body>mock content</body></html>',
  ),
}));

describe('printExportDocument', () => {
  let mockWindow: {
    document: {
      write: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      fonts: { ready: Promise<void> };
    };
    addEventListener: ReturnType<typeof vi.fn>;
    print: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
        fonts: { ready: Promise.resolve() },
      },
      addEventListener: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
    };

    vi.spyOn(window, 'open').mockReturnValue(
      mockWindow as unknown as Window,
    );
  });

  const textDoc: ExportableDocument = {
    title: 'Test Document',
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ],
    },
    pages: null,
    canvas_type: 'blank',
  };

  it('opens a new browser window', async () => {
    await printExportDocument(textDoc);
    expect(window.open).toHaveBeenCalledWith('', '_blank');
  });

  it('writes HTML content to the print window', async () => {
    await printExportDocument(textDoc);
    expect(mockWindow.document.write).toHaveBeenCalledWith(
      expect.stringContaining('mock content'),
    );
  });

  it('closes the document after writing', async () => {
    await printExportDocument(textDoc);
    expect(mockWindow.document.close).toHaveBeenCalled();
  });

  it('calls print() on the window', async () => {
    await printExportDocument(textDoc);
    expect(mockWindow.print).toHaveBeenCalled();
  });

  it('registers afterprint listener to close window', async () => {
    await printExportDocument(textDoc);
    expect(mockWindow.addEventListener).toHaveBeenCalledWith(
      'afterprint',
      expect.any(Function),
    );
  });

  it('throws if window.open returns null (pop-up blocked)', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(printExportDocument(textDoc)).rejects.toThrow(
      'Could not open print window',
    );
  });
});
